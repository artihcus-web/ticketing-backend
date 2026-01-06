import express from 'express';
import { db, auth } from '../config/firebase.js';
import { verifyToken } from '../middleware/auth.js';
import admin from 'firebase-admin';

const router = express.Router();

// GET /projects - Get all projects
router.get('/', verifyToken, async (req, res) => {
  try {
    const projectsRef = db.collection('projects');
    const snapshot = await projectsRef.get();
    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json({ success: true, projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});

// POST /projects - Create a new project
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Project name is required'
      });
    }
    
    // Check for duplicate project name (case-insensitive)
    const projectsRef = db.collection('projects');
    const snapshot = await projectsRef.get();
    const duplicate = snapshot.docs.some(doc => {
      const projectName = doc.data().name;
      return projectName && projectName.trim().toLowerCase() === name.trim().toLowerCase();
    });
    
    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: 'This project already exists'
      });
    }
    
    const newProject = {
      name: name.trim(),
      description: description || '',
      members: [],
      createdAt: new Date().toISOString()
    };
    
    const docRef = await projectsRef.add(newProject);
    
    res.json({
      success: true,
      project: { id: docRef.id, ...newProject }
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create project'
    });
  }
});

// PUT /projects/:id - Update a project
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    const projectRef = db.collection('projects').doc(id);
    const projectSnap = await projectRef.get();
    
    if (!projectSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    
    await projectRef.update(updates);
    
    const updatedSnap = await projectRef.get();
    res.json({
      success: true,
      project: { id: updatedSnap.id, ...updatedSnap.data() }
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update project'
    });
  }
});

// DELETE /projects/:id - Delete a project
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const projectRef = db.collection('projects').doc(id);
    const projectSnap = await projectRef.get();
    
    if (!projectSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    await projectRef.delete();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete project'
    });
  }
});

// POST /projects/:id/members - Add a member to a project
router.post('/:id/members', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role, userType, password } = req.body;
    
    if (!email || !role || !userType) {
      return res.status(400).json({
        success: false,
        error: 'Email, role, and userType are required'
      });
    }
    
    const projectRef = db.collection('projects').doc(id);
    const projectSnap = await projectRef.get();
    
    if (!projectSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const projectData = projectSnap.data();
    const projectName = projectData.name;
    
    // Check if email is blocked
    const blockedDoc = await db.collection('blocked_emails').doc(email).get();
    if (blockedDoc.exists) {
      return res.status(400).json({
        success: false,
        error: 'This email has been blocked by admin and cannot be added.',
        blocked: true
      });
    }
    
    // Determine final role
    let finalRole;
    if (userType === 'client') {
      finalRole = role === 'head' ? 'client_head' : 'client';
    } else {
      finalRole = role === 'manager' ? 'project_manager' : 'employee';
    }
    
    // Check for email uniqueness across ALL roles
    const usersQuery = db.collection('users').where('email', '==', email);
    const userSnapshot = await usersQuery.get();
    
    let memberUid;
    let userRef;
    
    if (!userSnapshot.empty) {
      // User exists, update existing document
      userRef = userSnapshot.docs[0].ref;
      memberUid = userSnapshot.docs[0].id;
      const userData = userSnapshot.docs[0].data();
      
      // Check for role conflict
      if (userData.role !== finalRole || userData.userType !== userType) {
        return res.status(400).json({
          success: false,
          error: `Email ${email} is already registered with a different role. Each email can only be used with one role across all projects.`
        });
      }
      
      // Update user document
      const updateData = {
        role: finalRole,
        userType: userType,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.id,
        projects: admin.firestore.FieldValue.arrayUnion(id),
      };
      
      // Ensure project is always an array of names
      let currentProjects = Array.isArray(userData.project)
        ? userData.project
        : userData.project ? [userData.project] : [];
      if (!currentProjects.includes(projectName)) {
        currentProjects.push(projectName);
      }
      updateData.project = currentProjects;
      
      await userRef.update(updateData);
    } else {
      // User does not exist, create a new pending user document
      memberUid = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      userRef = db.collection('users').doc(memberUid);
      
      const setData = {
        email: email,
        role: finalRole,
        userType: userType,
        createdAt: new Date().toISOString(),
        createdBy: req.user.id,
        status: 'pending',
        password: password, // Store password temporarily for account creation
        projects: [id],
        project: [projectName],
      };
      
      await userRef.set(setData);
    }
    
    // Add user to project members
    const updatedMembers = [...(projectData.members || []), {
      email: email,
      role: finalRole,
      uid: memberUid,
      userType: userType,
      status: userSnapshot.empty ? 'pending' : (userSnapshot.docs[0].data()?.status || 'active')
    }];
    
    await projectRef.update({ members: updatedMembers });
    
    const updatedSnap = await projectRef.get();
    res.json({
      success: true,
      project: { id: updatedSnap.id, ...updatedSnap.data() }
    });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add member to project'
    });
  }
});

// PUT /projects/:id/members/:email - Update a member in a project
router.put('/:id/members/:email', verifyToken, async (req, res) => {
  try {
    const { id, email } = req.params;
    const { role, userType } = req.body;
    
    const projectRef = db.collection('projects').doc(id);
    const projectSnap = await projectRef.get();
    
    if (!projectSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const projectData = projectSnap.data();
    const members = projectData.members || [];
    const memberIndex = members.findIndex(m => m.email === email);
    
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Member not found in project'
      });
    }
    
    // Determine final role
    let finalRole;
    if (userType === 'client') {
      finalRole = role === 'head' ? 'client_head' : 'client';
    } else {
      finalRole = role === 'manager' ? 'project_manager' : 'employee';
    }
    
    // Update member in project
    const updatedMembers = [...members];
    updatedMembers[memberIndex] = {
      ...updatedMembers[memberIndex],
      role: finalRole,
      userType: userType
    };
    
    await projectRef.update({ members: updatedMembers });
    
    // Update user document if exists
    const usersQuery = db.collection('users').where('email', '==', email);
    const userSnapshot = await usersQuery.get();
    
    if (!userSnapshot.empty) {
      const userRef = userSnapshot.docs[0].ref;
      await userRef.update({
        role: finalRole,
        userType: userType,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.id
      });
    }
    
    const updatedSnap = await projectRef.get();
    res.json({
      success: true,
      project: { id: updatedSnap.id, ...updatedSnap.data() }
    });
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update member'
    });
  }
});

// DELETE /projects/:id/members/:email - Remove a member from a project
router.delete('/:id/members/:email', verifyToken, async (req, res) => {
  try {
    const { id, email } = req.params;
    
    const projectRef = db.collection('projects').doc(id);
    const projectSnap = await projectRef.get();
    
    if (!projectSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const projectData = projectSnap.data();
    const members = projectData.members || [];
    const updatedMembers = members.filter(member => member.email !== email);
    
    await projectRef.update({ members: updatedMembers });
    
    // Check if user is still a member of any other project
    const allProjectsSnapshot = await db.collection('projects').get();
    let isStillMember = false;
    
    allProjectsSnapshot.forEach(docSnap => {
      const projectMembers = docSnap.data().members || [];
      if (projectMembers.some(m => m.email === email)) {
        isStillMember = true;
      }
    });
    
    // If not a member of any project, delete user document
    if (!isStillMember) {
      const usersQuery = db.collection('users').where('email', '==', email);
      const userSnapshot = await usersQuery.get();
      for (const docSnap of userSnapshot.docs) {
        await docSnap.ref.delete();
      }
    }
    
    const updatedSnap = await projectRef.get();
    res.json({
      success: true,
      project: { id: updatedSnap.id, ...updatedSnap.data() },
      userDeleted: !isStillMember
    });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove member from project'
    });
  }
});

// DELETE /projects/blocked-emails/:email - Unblock an email
router.delete('/blocked-emails/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    const blockedRef = db.collection('blocked_emails').doc(email);
    const blockedSnap = await blockedRef.get();
    
    if (!blockedSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Email is not blocked'
      });
    }
    
    await blockedRef.delete();
    
    res.json({ success: true, message: 'Email unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unblock email'
    });
  }
});

export default router;

