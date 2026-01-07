import express from 'express';
import { getDB } from '../config/mongodb.js';
import { verifyToken } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// GET /projects - Get all projects
router.get('/', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    const projects = await projectsCollection.find({}).toArray();
    const formattedProjects = projects.map(project => ({
      id: project._id.toString(),
      ...project,
      _id: undefined
    }));
    res.json({ success: true, projects: formattedProjects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});

// GET /projects/:id - Get a single project by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[DEBUG] Fetching project with ID:', id);
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    
    let project;
    try {
      const objectId = new ObjectId(id);
      console.log('[DEBUG] Trying ObjectId query:', objectId);
      project = await projectsCollection.findOne({ _id: objectId });
      if (project) {
        console.log('[DEBUG] Project found with ObjectId');
      }
    } catch (err) {
      console.log('[DEBUG] ObjectId conversion failed, trying string:', err.message);
      project = await projectsCollection.findOne({ _id: id });
      if (project) {
        console.log('[DEBUG] Project found with string ID');
      }
    }
    
    if (!project) {
      console.log('[DEBUG] Project not found. Searched with ID:', id);
      // Also try to list all projects to see what IDs exist
      const allProjects = await projectsCollection.find({}).toArray();
      console.log('[DEBUG] Available project IDs:', allProjects.map(p => p._id.toString()));
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    res.json({
      success: true,
      project: {
        id: project._id.toString(),
        ...project,
        _id: undefined
      }
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project'
    });
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
    
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    
    // Check for duplicate project name (case-insensitive)
    const existingProjects = await projectsCollection.find({}).toArray();
    const duplicate = existingProjects.some(project => {
      const projectName = project.name;
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
      createdAt: new Date()
    };
    
    const result = await projectsCollection.insertOne(newProject);
    
    res.json({
      success: true,
      project: { id: result.insertedId.toString(), ...newProject }
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
    
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    
    let project;
    try {
      project = await projectsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      project = await projectsCollection.findOne({ _id: id });
    }
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    
    await projectsCollection.updateOne(
      { _id: project._id },
      { $set: updates }
    );
    
    const updated = await projectsCollection.findOne({ _id: project._id });
    res.json({
      success: true,
      project: { id: updated._id.toString(), ...updated, _id: undefined }
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
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    
    let project;
    try {
      project = await projectsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      project = await projectsCollection.findOne({ _id: id });
    }
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    await projectsCollection.deleteOne({ _id: project._id });
    
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
    
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    const usersCollection = db.collection('users');
    const blockedEmailsCollection = db.collection('blocked_emails');
    
    let project;
    try {
      project = await projectsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      project = await projectsCollection.findOne({ _id: id });
    }
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const projectName = project.name;
    
    // Check if email is blocked
    const blockedDoc = await blockedEmailsCollection.findOne({ _id: email });
    if (blockedDoc) {
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
    const existingUser = await usersCollection.findOne({ email: email });
    
    let memberUid;
    
    if (existingUser) {
      // User exists, update existing document
      memberUid = existingUser._id.toString();
      
      // Check for role conflict
      if (existingUser.role !== finalRole || existingUser.userType !== userType) {
        return res.status(400).json({
          success: false,
          error: `Email ${email} is already registered with a different role. Each email can only be used with one role across all projects.`
        });
      }
      
      // Update user document
      const updateData = {
        role: finalRole,
        userType: userType,
        updatedAt: new Date(),
        updatedBy: req.user.id,
      };
      
      // Add project ID to projects array if not already present
      const currentProjects = existingUser.projects || [];
      if (!currentProjects.includes(id)) {
        updateData.projects = [...currentProjects, id];
      }
      
      // Ensure project is always an array of names
      let currentProjectNames = Array.isArray(existingUser.project)
        ? existingUser.project
        : existingUser.project ? [existingUser.project] : [];
      if (!currentProjectNames.includes(projectName)) {
        currentProjectNames.push(projectName);
      }
      updateData.project = currentProjectNames;
      
      await usersCollection.updateOne(
        { _id: existingUser._id },
        { $set: updateData }
      );
    } else {
      // User does not exist, create a new pending user document
      const newUser = {
        email: email,
        role: finalRole,
        userType: userType,
        createdAt: new Date(),
        createdBy: req.user.id,
        status: 'pending',
        password: password, // Store password temporarily for account creation
        projects: [id],
        project: [projectName],
      };
      
      const result = await usersCollection.insertOne(newUser);
      memberUid = result.insertedId.toString();
    }
    
    // Add user to project members
    const updatedMembers = [...(project.members || []), {
      email: email,
      role: finalRole,
      uid: memberUid,
      userType: userType,
      status: existingUser ? (existingUser.status || 'active') : 'pending'
    }];
    
    await projectsCollection.updateOne(
      { _id: project._id },
      { $set: { members: updatedMembers } }
    );
    
    const updated = await projectsCollection.findOne({ _id: project._id });
    res.json({
      success: true,
      project: { id: updated._id.toString(), ...updated, _id: undefined }
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
    
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    
    let project;
    try {
      project = await projectsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      project = await projectsCollection.findOne({ _id: id });
    }
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const members = project.members || [];
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
    
    await projectsCollection.updateOne(
      { _id: project._id },
      { $set: { members: updatedMembers } }
    );
    
    // Update user document if exists
    const usersCollection = db.collection('users');
    const existingUser = await usersCollection.findOne({ email: email });
    
    if (existingUser) {
      await usersCollection.updateOne(
        { _id: existingUser._id },
        { 
          $set: {
            role: finalRole,
            userType: userType,
            updatedAt: new Date(),
            updatedBy: req.user.id
          }
        }
      );
    }
    
    const updated = await projectsCollection.findOne({ _id: project._id });
    res.json({
      success: true,
      project: { id: updated._id.toString(), ...updated, _id: undefined }
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
    
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    
    let project;
    try {
      project = await projectsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      project = await projectsCollection.findOne({ _id: id });
    }
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const members = project.members || [];
    const updatedMembers = members.filter(member => member.email !== email);
    
    await projectsCollection.updateOne(
      { _id: project._id },
      { $set: { members: updatedMembers } }
    );
    
    // Check if user is still a member of any other project
    const allProjects = await projectsCollection.find({}).toArray();
    let isStillMember = false;
    
    allProjects.forEach(proj => {
      const projectMembers = proj.members || [];
      if (projectMembers.some(m => m.email === email)) {
        isStillMember = true;
      }
    });
    
    // If not a member of any project, delete user document
    if (!isStillMember) {
      const usersCollection = db.collection('users');
      await usersCollection.deleteOne({ email: email });
    }
    
    const updated = await projectsCollection.findOne({ _id: project._id });
    res.json({
      success: true,
      project: { id: updated._id.toString(), ...updated, _id: undefined },
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
    const db = await getDB();
    const blockedEmailsCollection = db.collection('blocked_emails');
    const blocked = await blockedEmailsCollection.findOne({ _id: email });
    
    if (!blocked) {
      return res.status(404).json({
        success: false,
        error: 'Email is not blocked'
      });
    }
    
    await blockedEmailsCollection.deleteOne({ _id: email });
    
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

