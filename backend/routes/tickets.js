import express from 'express';
import { getDB } from '../config/mongodb.js';
import { verifyToken } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Helper to get next ticket number
const getNextTicketNumber = async (typeOfIssue) => {
  let prefix, counterDocId, startValue;
  const type = (typeOfIssue || '').replace(/\s+/g, '').toLowerCase();
  
  if (type === 'incident') {
    prefix = 'IN';
    counterDocId = 'incident_counter';
    startValue = 100000;
  } else if (type === 'servicerequest') {
    prefix = 'SR';
    counterDocId = 'service_counter';
    startValue = 200000;
  } else if (type === 'changerequest') {
    prefix = 'CR';
    counterDocId = 'change_counter';
    startValue = 300000;
  } else {
    prefix = 'IN';
    counterDocId = 'incident_counter';
    startValue = 100000;
  }
  
  try {
    const db = await getDB();
    const countersCollection = db.collection('counters');
    
    // Check if counter exists
    const existingCounter = await countersCollection.findOne({ _id: counterDocId });
    
    let newValue;
    if (!existingCounter) {
      // Create new counter with startValue + 1
      newValue = startValue + 1;
      await countersCollection.insertOne({
        _id: counterDocId,
        value: newValue
      });
    } else {
      // Safely increment existing counter without conflicting update paths
      const currentValue = Number(existingCounter.value) || startValue;
      newValue = currentValue + 1;
      await countersCollection.updateOne(
        { _id: counterDocId },
        { $set: { value: newValue } }
      );
    }
    
    return `${prefix}${newValue}`;
  } catch (error) {
    // Fallback: if there is any issue with the counters collection,
    // log the error and generate a ticket number based on timestamp.
    console.error('Error updating ticket counter, falling back to timestamp-based number:', error);
    const timestampNumber = Date.now(); // milliseconds since epoch
    return `${prefix}${timestampNumber}`;
  }
};

// Helper to fetch project member emails
const fetchProjectMemberEmails = async (projectName) => {
  if (!projectName) return [];
  try {
    const db = await getDB();
    const usersCollection = db.collection('users');
    const users = await usersCollection.find({ 
      project: { $in: [projectName] } 
    }).toArray();
    return users.map(user => user.email).filter(Boolean);
  } catch (error) {
    console.error("Error fetching project member emails:", error);
    return [];
  }
};

// GET /tickets/config/formConfig - Get form configuration
router.get('/config/formConfig', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const configCollection = db.collection('config');
    const config = await configCollection.findOne({ _id: 'formConfig' });
    
    if (!config) {
      return res.json({ success: true, formConfig: null });
    }
    
    // Remove _id from response
    const { _id, ...formConfig } = config;
    res.json({ success: true, formConfig });
  } catch (error) {
    console.error('Error fetching form config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch form config' });
  }
});

// PUT /tickets/config/formConfig - Update form configuration
router.put('/config/formConfig', verifyToken, async (req, res) => {
  try {
    const { fields, moduleOptions, categoryOptions, subCategoryOptions } = req.body;
    
    const db = await getDB();
    const configCollection = db.collection('config');
    
    const updateData = {};
    if (fields !== undefined) updateData.fields = fields;
    if (moduleOptions !== undefined) updateData.moduleOptions = moduleOptions;
    if (categoryOptions !== undefined) updateData.categoryOptions = categoryOptions;
    if (subCategoryOptions !== undefined) updateData.subCategoryOptions = subCategoryOptions;
    
    await configCollection.updateOne(
      { _id: 'formConfig' },
      { $set: updateData },
      { upsert: true }
    );
    
    const updated = await configCollection.findOne({ _id: 'formConfig' });
    const { _id, ...formConfig } = updated;
    res.json({
      success: true,
      formConfig
    });
  } catch (error) {
    console.error('Error updating form config:', error);
    res.status(500).json({ success: false, error: 'Failed to update form config' });
  }
});

// GET /tickets/users/current - Get current user data
router.get('/users/current', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const usersCollection = db.collection('users');
    
    let user;
    try {
      user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    } catch (err) {
      // If ObjectId conversion fails, try as string
      user = await usersCollection.findOne({ _id: userId });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        project: user.project || 'General',
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user data' });
  }
});

// GET /tickets/project-members - Get all project members by project name (query parameter)
router.get('/project-members', verifyToken, async (req, res) => {
  try {
    const { projectName } = req.query;
    if (!projectName) {
      return res.status(400).json({ success: false, error: 'Project name is required' });
    }
    
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    const project = await projectsCollection.findOne({ name: projectName });
    
    if (!project) {
      return res.json({ success: true, members: [] });
    }
    
    const members = project.members || [];
    
    // Return all members (not just clients)
    res.json({ success: true, members });
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch project members' });
  }
});

// GET /tickets/projects/:projectName/members - Get project members (path parameter, returns only clients)
router.get('/projects/:projectName/members', verifyToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    const project = await projectsCollection.findOne({ name: projectName });
    
    if (!project) {
      return res.json({ success: true, members: [] });
    }
    
    const members = project.members || [];
    
    // Filter client-side members
    const clientMembers = members.filter(m => m.role === 'client' || m.role === 'client_head');
    
    res.json({ success: true, members: clientMembers });
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch project members' });
  }
});

// GET /tickets/projects/:projectName/member-emails - Get project member emails
router.get('/projects/:projectName/member-emails', verifyToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const emails = await fetchProjectMemberEmails(projectName);
    res.json({ success: true, emails });
  } catch (error) {
    console.error('Error fetching project member emails:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch project member emails' });
  }
});

// GET /tickets/check-duplicate - Check for duplicate tickets
router.get('/check-duplicate', verifyToken, async (req, res) => {
  try {
    const { subject, email } = req.query;
    
    if (!subject || !email) {
      return res.json({ success: true, isDuplicate: false });
    }
    
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');
    const tickets = await ticketsCollection.find({ email: email }).toArray();
    
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const isDuplicate = tickets.some(ticket => {
      const createdTime = ticket.created instanceof Date ? ticket.created : new Date(ticket.created);
      return ticket.subject === subject && createdTime >= last24Hours;
    });
    
    res.json({ success: true, isDuplicate });
  } catch (error) {
    console.error('Error checking duplicate tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to check duplicate tickets' });
  }
});

// POST /tickets - Create a new ticket
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      subject,
      customer,
      email,
      project,
      module,
      category,
      subCategory,
      typeOfIssue,
      priority,
      description,
      attachments,
      reportedBy
    } = req.body;

    // Validate required fields
    if (!subject || !email || !description) {
      return res.status(400).json({
        success: false,
        error: 'Subject, email, and description are required'
      });
    }

    const db = await getDB();

    // Fetch projectId by project name
    let projectId = null;
    if (project) {
      const projectsCollection = db.collection('projects');
      const projectDoc = await projectsCollection.findOne({ name: project });
      if (projectDoc) {
        projectId = projectDoc._id.toString();
      }
    }

    // Base ticket data (without ticketNumber yet)
    const now = new Date();
    const baseTicketData = {
      subject,
      customer,
      email,
      project: project || 'General',
      projectId: projectId || '',
      module: module || '',
      category: category || '',
      subCategory: subCategory || '',
      typeOfIssue: typeOfIssue || '',
      priority: priority || 'Medium',
      description,
      status: 'Open',
      created: now,
      starred: false,
      attachments: attachments || [],
      lastUpdated: now,
      userId: req.user.id,
      reportedBy: reportedBy || ''
    };

    const ticketsCollection = db.collection('tickets');

    // Try a few times in case of rare duplicate ticketNumber collisions
    const maxAttempts = 3;
    let lastError = null;
    let ticketId = null;
    let finalTicketData = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Get next ticket number for this attempt
      const ticketNumber = await getNextTicketNumber(typeOfIssue);
      const ticketData = { ...baseTicketData, ticketNumber };

      try {
        const result = await ticketsCollection.insertOne(ticketData);
        ticketId = result.insertedId.toString();
        finalTicketData = ticketData;

        // Update ticket with its MongoDB doc ID
        await ticketsCollection.updateOne(
          { _id: result.insertedId },
          { $set: { ticketId } }
        );

        // Fetch project members' emails for notification
        const projectName = Array.isArray(project) ? project[0] : project;
        const memberEmails = await fetchProjectMemberEmails(projectName);

        return res.json({
          success: true,
          ticket: {
            id: ticketId,
            ticketNumber,
            ...finalTicketData,
            ticketId
          },
          memberEmails // Return for frontend to send email
        });
      } catch (err) {
        // If we hit a duplicate ticketNumber, retry with a new number
        if (err && err.code === 11000 && err.keyPattern && err.keyPattern.ticketNumber) {
          console.warn(
            `Duplicate ticketNumber ${ticketNumber} detected on attempt ${attempt + 1}, retrying with a new number...`
          );
          lastError = err;
          continue;
        }

        // Any other error: rethrow
        lastError = err;
        break;
      }
    }

    // If we got here, all attempts failed
    console.error('Error creating ticket after retries:', lastError);
    return res.status(500).json({
      success: false,
      error: lastError?.message || 'Failed to create ticket'
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create ticket'
    });
  }
});

// GET /tickets/:id - Get ticket details
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');
    
    let ticket;
    try {
      ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      // If ObjectId conversion fails, try as string or by ticketId
      ticket = await ticketsCollection.findOne({ 
        $or: [
          { _id: id },
          { ticketId: id }
        ]
      });
    }
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const ticketData = { id: ticket._id.toString(), ...ticket };
    delete ticketData._id;
    
    // Merge old responses for display if comments array is missing
    let comments = [];
    if (ticketData.comments && Array.isArray(ticketData.comments)) {
      comments = ticketData.comments;
    } else {
      // Migrate old responses for display only
      if (ticketData.adminResponses) {
        comments = comments.concat(ticketData.adminResponses.map(r => ({ ...r, authorRole: 'admin' })));
      }
      if (ticketData.customerResponses) {
        comments = comments.concat(ticketData.customerResponses.map(r => ({ ...r, authorRole: 'customer' })));
      }
    }
    
    // Sort comments by timestamp
    comments.sort((a, b) => {
      const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : (new Date(a.timestamp || 0).getTime());
      const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : (new Date(b.timestamp || 0).getTime());
      return ta - tb;
    });
    
    res.json({
      success: true,
      ticket: { ...ticketData, comments }
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticket'
    });
  }
});

// PUT /tickets/:id - Update ticket
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');
    
    let ticket;
    try {
      ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      ticket = await ticketsCollection.findOne({ 
        $or: [
          { _id: id },
          { ticketId: id }
        ]
      });
    }
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    // Handle timestamp fields
    if (updates.lastUpdated !== undefined) {
      updates.lastUpdated = new Date();
    }
    
    // Remove _id from updates if present
    delete updates._id;
    
    // Update ticket
    const filter = { _id: ticket._id };
    await ticketsCollection.updateOne(filter, { $set: updates });
    
    // Fetch updated ticket
    const updated = await ticketsCollection.findOne(filter);
    const updatedData = { id: updated._id.toString(), ...updated };
    delete updatedData._id;
    
    res.json({
      success: true,
      ticket: updatedData
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update ticket'
    });
  }
});

// POST /tickets/:id/comments - Add a comment
router.post('/:id/comments', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { message, attachments, authorName, authorEmail, authorRole } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Comment message is required'
      });
    }
    
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');
    
    let ticket;
    try {
      ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      ticket = await ticketsCollection.findOne({ 
        $or: [
          { _id: id },
          { ticketId: id }
        ]
      });
    }
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const newComment = {
      message,
      attachments: attachments || [],
      timestamp: new Date(),
      authorEmail: authorEmail || req.user.email,
      authorName: authorName || '',
      authorRole: authorRole || 'employee'
    };
    
    // Get current comments array
    const comments = ticket.comments || [];
    
    // Add new comment
    comments.push(newComment);
    
    // Update ticket
    await ticketsCollection.updateOne(
      { _id: ticket._id },
      { 
        $set: { 
          comments,
          lastUpdated: new Date()
        }
      }
    );
    
    res.json({
      success: true,
      comment: newComment
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment'
    });
  }
});

// PUT /tickets/:id/comments/:index - Edit a comment
router.put('/:id/comments/:index', verifyToken, async (req, res) => {
  try {
    const { id, index } = req.params;
    const { message } = req.body;
    const commentIndex = parseInt(index);
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Comment message is required'
      });
    }
    
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');
    
    let ticket;
    try {
      ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      ticket = await ticketsCollection.findOne({ 
        $or: [
          { _id: id },
          { ticketId: id }
        ]
      });
    }
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const comments = ticket.comments || [];
    
    if (commentIndex < 0 || commentIndex >= comments.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid comment index'
      });
    }
    
    // Update comment
    comments[commentIndex] = {
      ...comments[commentIndex],
      message,
      lastEditedAt: new Date(),
      lastEditedBy: req.user.email
    };
    
    // Update ticket
    await ticketsCollection.updateOne(
      { _id: ticket._id },
      { 
        $set: { 
          comments,
          lastUpdated: new Date()
        }
      }
    );
    
    res.json({
      success: true,
      comment: comments[commentIndex]
    });
  } catch (error) {
    console.error('Error editing comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to edit comment'
    });
  }
});

// GET /tickets/:id/employees - Get employees for assignment
router.get('/:id/employees', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');
    
    let ticket;
    try {
      ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      ticket = await ticketsCollection.findOne({ 
        $or: [
          { _id: id },
          { ticketId: id }
        ]
      });
    }
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const project = ticket.project;
    
    if (!project) {
      return res.json({ success: true, employees: [] });
    }
    
    const usersCollection = db.collection('users');
    let employees = [];
    
    if (Array.isArray(project)) {
      const users = await usersCollection.find({
        project: { $in: project },
        role: { $in: ['employee', 'project_manager'] }
      }).toArray();
      
      employees = users.map(user => {
        let name = '';
        if (user.firstName && user.lastName) {
          name = `${user.firstName} ${user.lastName}`.trim();
        } else if (user.firstName) {
          name = user.firstName;
        } else if (user.lastName) {
          name = user.lastName;
        } else {
          name = user.email.split('@')[0];
        }
        if (user.role === 'project_manager') {
          name += ' (Project Manager)';
        }
        return {
          id: user._id.toString(),
          email: user.email,
          name,
          role: user.role
        };
      });
    } else {
      const users = await usersCollection.find({
        $or: [
          { project: project },
          { project: { $in: [project] } }
        ],
        role: { $in: ['employee', 'project_manager'] }
      }).toArray();
      
      // Deduplicate by email
      const uniqueUsers = users.filter((v, i, a) => a.findIndex(t => t.email === v.email) === i);
      
      employees = uniqueUsers.map(user => ({
        id: user._id.toString(),
        email: user.email,
        name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.firstName || user.lastName || user.email.split('@')[0]),
        role: user.role
      }));
    }
    
    res.json({ success: true, employees });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employees'
    });
  }
});

// GET /tickets/:id/clients - Get clients for requester selection
router.get('/:id/clients', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');
    
    let ticket;
    try {
      ticket = await ticketsCollection.findOne({ _id: new ObjectId(id) });
    } catch (err) {
      ticket = await ticketsCollection.findOne({ 
        $or: [
          { _id: id },
          { ticketId: id }
        ]
      });
    }
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const project = ticket.project;
    
    if (!project) {
      return res.json({ success: true, clients: [] });
    }
    
    const usersCollection = db.collection('users');
    const projectFilter = Array.isArray(project) 
      ? { project: { $in: project }, role: 'client' }
      : { 
          $or: [
            { project: project },
            { project: { $in: [project] } }
          ],
          role: 'client'
        };
    
    const users = await usersCollection.find(projectFilter).toArray();
    
    const clients = users.map(user => {
      let name = '';
      if (user.firstName && user.lastName) {
        name = `${user.firstName} ${user.lastName}`.trim();
      } else if (user.firstName) {
        name = user.firstName;
      } else if (user.lastName) {
        name = user.lastName;
      } else {
        name = user.email.split('@')[0];
      }
      return {
        id: user._id.toString(),
        email: user.email,
        name,
      };
    });
    
    res.json({ success: true, clients });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clients'
    });
  }
});

export default router;

