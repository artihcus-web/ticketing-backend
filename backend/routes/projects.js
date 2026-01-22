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

    // Check if member is already in the current project
    const currentMembers = project.members || [];
    const memberAlreadyInProject = currentMembers.some(
      m => m.email.toLowerCase() === email.toLowerCase()
    );

    if (memberAlreadyInProject) {
      return res.status(400).json({
        success: false,
        error: `Member with email ${email} is already in this project.`
      });
    }

    // Check for existing user (member can be in multiple projects)
    const existingUser = await usersCollection.findOne({ email: email });

    let memberUid;

    if (existingUser) {
      // User exists, update existing document
      memberUid = existingUser._id.toString();

      console.log(`[DEBUG] Adding member - Email: ${email}`);
      console.log(`[DEBUG] Existing user - role="${existingUser.role}", userType="${existingUser.userType}"`);
      console.log(`[DEBUG] New values - role="${finalRole}", userType="${userType}"`);

      // Update user document - add this project to their projects list and update role/userType
      // Note: This will update the role/userType for all projects, allowing members to be in multiple projects
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

      // Send credentials email only for new users
      if (password) {
        try {
          const { sendCredentialsEmail } = await import('../utils/emailService.js');
          await sendCredentialsEmail(email, finalRole, password, projectName);
          console.log(`Credentials email sent to ${email}`);
        } catch (emailErr) {
          console.error('Failed to send credentials email:', emailErr);
          // We don't block the response here, just log the error
        }
      }
    }

    // Add user to project members (member can be in multiple projects)
    const updatedMembers = [...currentMembers, {
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
    const { role, userType, email: newEmail } = req.body;

    console.log(`[DEBUG] Updating member. ID: ${id}, Old Email: ${email}, New Email: ${newEmail}`);
    console.log(`[DEBUG] Body - Role: ${role}, UserType: ${userType}, Email: ${newEmail}`);

    const db = await getDB();
    const projectsCollection = db.collection('projects');

    let project;
    try {
      project = await projectsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      project = await projectsCollection.findOne({ _id: id });
    }

    if (!project) {
      console.log('[DEBUG] Project not found');
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const members = project.members || [];
    const memberIndex = members.findIndex(m => m.email.toLowerCase() === email.toLowerCase());

    if (memberIndex === -1) {
      console.log(`[DEBUG] Member not found in project. ProjectId: ${project._id}, Email: ${email}`);
      console.log(`[DEBUG] Available members:`, members.map(m => m.email));
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

    console.log(`[DEBUG] Final Role determined: ${finalRole}`);

    // Use new email if provided, otherwise keep the old email
    const emailToUse = newEmail && newEmail.trim() ? newEmail.trim() : email;

    // Check if email is being changed
    const isEmailChange = emailToUse.toLowerCase() !== email.toLowerCase();

    // Get users collection and find existing user early (needed for validation and update)
    const usersCollection = db.collection('users');
    const existingUser = await usersCollection.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') }
    });

    // If email is being changed, check if the new email already exists for a different user
    if (isEmailChange) {
      // Check if new email already exists in users collection for a DIFFERENT user
      if (existingUser) {
        const emailConflict = await usersCollection.findOne({
          email: { $regex: new RegExp(`^${emailToUse}$`, 'i') },
          _id: { $ne: existingUser._id }
        });

        if (emailConflict) {
          return res.status(400).json({
            success: false,
            error: `Email ${emailToUse} is already registered with a different user. Cannot update to an existing email.`
          });
        }
      } else {
        // If user doesn't exist in users collection, check if email exists at all
        const emailExists = await usersCollection.findOne({
          email: { $regex: new RegExp(`^${emailToUse}$`, 'i') }
        });

        if (emailExists) {
          return res.status(400).json({
            success: false,
            error: `Email ${emailToUse} is already registered. Cannot update to an existing email.`
          });
        }
      }

      // Also check if the email already exists in the project members array for a different member
      const emailExistsInProject = members.some(
        (m, idx) => idx !== memberIndex && 
        m.email.toLowerCase() === emailToUse.toLowerCase()
      );

      if (emailExistsInProject) {
        return res.status(400).json({
          success: false,
          error: `Email ${emailToUse} already exists in this project for another member. Cannot update to an existing email.`
        });
      }
    }

    // Update member in project
    const updatedMembers = [...members];
    updatedMembers[memberIndex] = {
      ...updatedMembers[memberIndex],
      email: emailToUse,
      role: finalRole,
      userType: userType
    };

    await projectsCollection.updateOne(
      { _id: project._id },
      { $set: { members: updatedMembers } }
    );
    console.log('[DEBUG] Project members array updated');

    if (existingUser) {
      console.log(`[DEBUG] Updating user document: ${existingUser._id}`);
      
      // Prepare update data
      const updateData = {
        role: finalRole,
        userType: userType,
        updatedAt: new Date(),
        updatedBy: req.user.id
      };

      // Track if email is being changed for the first time (to send notification only once)
      const currentUserEmail = existingUser.email.toLowerCase();
      const shouldSendEmail = isEmailChange && currentUserEmail !== emailToUse.toLowerCase();

      // If email is being changed, update it (we already checked it doesn't exist above)
      if (isEmailChange) {
        updateData.email = emailToUse;
        console.log(`[DEBUG] Email updated from ${email} to ${emailToUse}`);
      }

      const updateResult = await usersCollection.updateOne(
        { _id: existingUser._id },
        { $set: updateData }
      );
      console.log(`[DEBUG] User document updated successfully`);

      // Send email notification only if email was actually changed from old to new
      // This prevents duplicate emails when updating across multiple projects
      if (shouldSendEmail && updateResult.modifiedCount > 0) {
        try {
          const { sendEmailUpdateNotification } = await import('../utils/emailService.js');
          await sendEmailUpdateNotification(emailToUse, email, finalRole);
          console.log(`Email update notification sent to ${emailToUse}`);
        } catch (emailErr) {
          console.error('Failed to send email update notification:', emailErr);
          // We don't block the response here, just log the error
        }
      }
    } else {
      console.log(`[DEBUG] User document not found for email: ${email}`);
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
    const updatedMembers = members.filter(member => member.email.toLowerCase() !== email.toLowerCase());

    await projectsCollection.updateOne(
      { _id: project._id },
      { $set: { members: updatedMembers } }
    );

    // Check if user is still a member of any other project
    const allProjects = await projectsCollection.find({}).toArray();
    let isStillMember = false;

    allProjects.forEach(proj => {
      const projectMembers = proj.members || [];
      if (projectMembers.some(m => m.email.toLowerCase() === email.toLowerCase())) {
        isStillMember = true;
      }
    });

    // If not a member of any project, delete user document
    if (!isStillMember) {
      const usersCollection = db.collection('users');
      await usersCollection.deleteOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
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

