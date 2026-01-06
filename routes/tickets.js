import express from 'express';
import { db } from '../config/firebase.js';
import { verifyToken } from '../middleware/auth.js';
import admin from 'firebase-admin';

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
  
  const counterRef = db.collection('counters').doc(counterDocId);
  return await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let current = startValue - 1;
    if (counterDoc.exists) {
      current = counterDoc.data().value;
    }
    const newValue = current + 1;
    transaction.set(counterRef, { value: newValue });
    return `${prefix}${newValue}`;
  });
};

// Helper to fetch project member emails
const fetchProjectMemberEmails = async (projectName) => {
  if (!projectName) return [];
  try {
    const usersRef = db.collection('users');
    const q = usersRef.where('project', 'array-contains', projectName);
    const querySnapshot = await q.get();
    return querySnapshot.docs.map(doc => doc.data().email).filter(Boolean);
  } catch (error) {
    console.error("Error fetching project member emails:", error);
    return [];
  }
};

// GET /tickets/config/formConfig - Get form configuration
router.get('/config/formConfig', verifyToken, async (req, res) => {
  try {
    const configRef = db.collection('config').doc('formConfig');
    const configSnap = await configRef.get();
    
    if (!configSnap.exists) {
      return res.json({ success: true, formConfig: null });
    }
    
    res.json({ success: true, formConfig: configSnap.data() });
  } catch (error) {
    console.error('Error fetching form config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch form config' });
  }
});

// PUT /tickets/config/formConfig - Update form configuration
router.put('/config/formConfig', verifyToken, async (req, res) => {
  try {
    const { fields, moduleOptions, categoryOptions, subCategoryOptions } = req.body;
    
    const configRef = db.collection('config').doc('formConfig');
    
    const updateData = {};
    if (fields !== undefined) updateData.fields = fields;
    if (moduleOptions !== undefined) updateData.moduleOptions = moduleOptions;
    if (categoryOptions !== undefined) updateData.categoryOptions = categoryOptions;
    if (subCategoryOptions !== undefined) updateData.subCategoryOptions = subCategoryOptions;
    
    await configRef.set(updateData, { merge: true });
    
    const updatedSnap = await configRef.get();
    res.json({
      success: true,
      formConfig: updatedSnap.data()
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
    const userDocRef = db.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();
    
    if (!userDocSnap.exists) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userData = userDocSnap.data();
    res.json({
      success: true,
      user: {
        id: userId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        project: userData.project || 'General',
        role: userData.role
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
    
    const projectsRef = db.collection('projects');
    const q = projectsRef.where('name', '==', projectName);
    const projectSnapshot = await q.get();
    
    if (projectSnapshot.empty) {
      return res.json({ success: true, members: [] });
    }
    
    const projectDoc = projectSnapshot.docs[0];
    const members = projectDoc.data().members || [];
    
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
    const projectsRef = db.collection('projects');
    const q = projectsRef.where('name', '==', projectName);
    const projectSnapshot = await q.get();
    
    if (projectSnapshot.empty) {
      return res.json({ success: true, members: [] });
    }
    
    const projectDoc = projectSnapshot.docs[0];
    const members = projectDoc.data().members || [];
    
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
    
    const ticketsRef = db.collection('tickets');
    const q = ticketsRef.where('email', '==', email);
    const querySnapshot = await q.get();
    
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const isDuplicate = querySnapshot.docs.some(doc => {
      const data = doc.data();
      const createdTime = data.created?.toDate ? data.created.toDate() : new Date(data.created);
      return data.subject === subject && createdTime >= last24Hours;
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
    
    // Get next ticket number
    const ticketNumber = await getNextTicketNumber(typeOfIssue);
    
    // Fetch projectId by project name
    let projectId = null;
    if (project) {
      const projectsRef = db.collection('projects');
      const q = projectsRef.where('name', '==', project);
      const projectSnapshot = await q.get();
      if (!projectSnapshot.empty) {
        projectId = projectSnapshot.docs[0].id;
      }
    }
    
    // Build ticket data
    const ticketData = {
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
      created: admin.firestore.FieldValue.serverTimestamp(),
      starred: false,
      attachments: attachments || [],
      ticketNumber,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      userId: req.user.id,
      reportedBy: reportedBy || ''
    };
    
    // Create ticket
    const docRef = await db.collection('tickets').add(ticketData);
    
    // Update ticket with its Firestore doc ID
    await docRef.update({ ticketId: docRef.id });
    
    // Fetch project members' emails for notification
    const projectName = Array.isArray(project) ? project[0] : project;
    const memberEmails = await fetchProjectMemberEmails(projectName);
    
    res.json({
      success: true,
      ticket: {
        id: docRef.id,
        ticketNumber,
        ...ticketData
      },
      memberEmails // Return for frontend to send email
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
    const ticketRef = db.collection('tickets').doc(id);
    const ticketSnap = await ticketRef.get();
    
    if (!ticketSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const ticketData = { id: ticketSnap.id, ...ticketSnap.data() };
    
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
      const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
      const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
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
    
    const ticketRef = db.collection('tickets').doc(id);
    const ticketSnap = await ticketRef.get();
    
    if (!ticketSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const ticketData = ticketSnap.data();
    
    // Handle timestamp fields
    if (updates.lastUpdated !== undefined) {
      updates.lastUpdated = admin.firestore.FieldValue.serverTimestamp();
    }
    
    // Update ticket
    await ticketRef.update(updates);
    
    // Fetch updated ticket
    const updatedSnap = await ticketRef.get();
    const updatedData = { id: updatedSnap.id, ...updatedSnap.data() };
    
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
    
    const ticketRef = db.collection('tickets').doc(id);
    const ticketSnap = await ticketRef.get();
    
    if (!ticketSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const newComment = {
      message,
      attachments: attachments || [],
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      authorEmail: authorEmail || req.user.email,
      authorName: authorName || '',
      authorRole: authorRole || 'employee'
    };
    
    // Get current comments array
    const ticketData = ticketSnap.data();
    const comments = ticketData.comments || [];
    
    // Add new comment
    comments.push(newComment);
    
    // Update ticket
    await ticketRef.update({
      comments,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
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
    
    const ticketRef = db.collection('tickets').doc(id);
    const ticketSnap = await ticketRef.get();
    
    if (!ticketSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const ticketData = ticketSnap.data();
    const comments = ticketData.comments || [];
    
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
      lastEditedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEditedBy: req.user.email
    };
    
    // Update ticket
    await ticketRef.update({
      comments,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
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
    const ticketRef = db.collection('tickets').doc(id);
    const ticketSnap = await ticketRef.get();
    
    if (!ticketSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const ticketData = ticketSnap.data();
    const project = ticketData.project;
    
    if (!project) {
      return res.json({ success: true, employees: [] });
    }
    
    const usersRef = db.collection('users');
    let employees = [];
    
    if (Array.isArray(project)) {
      const q = usersRef.where('project', 'array-contains-any', project).where('role', 'in', ['employee', 'project_manager']);
      const snapshot = await q.get();
      employees = snapshot.docs.map(doc => {
        const data = doc.data();
        let name = '';
        if (data.firstName && data.lastName) {
          name = `${data.firstName} ${data.lastName}`.trim();
        } else if (data.firstName) {
          name = data.firstName;
        } else if (data.lastName) {
          name = data.lastName;
        } else {
          name = data.email.split('@')[0];
        }
        if (data.role === 'project_manager') {
          name += ' (Project Manager)';
        }
        return {
          id: doc.id,
          email: data.email,
          name,
          role: data.role
        };
      });
    } else {
      const q1 = usersRef.where('project', '==', project).where('role', 'in', ['employee', 'project_manager']);
      const q2 = usersRef.where('project', 'array-contains', project).where('role', 'in', ['employee', 'project_manager']);
      const [snap1, snap2] = await Promise.all([q1.get(), q2.get()]);
      const emps1 = snap1.docs.map(doc => doc.data());
      const emps2 = snap2.docs.map(doc => doc.data());
      const allEmps = [...emps1, ...emps2].filter((v, i, a) => a.findIndex(t => t.email === v.email) === i);
      employees = allEmps.map(data => ({
        id: data.id,
        email: data.email,
        name: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : (data.firstName || data.lastName || data.email.split('@')[0]),
        role: data.role
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
    const ticketRef = db.collection('tickets').doc(id);
    const ticketSnap = await ticketRef.get();
    
    if (!ticketSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    const ticketData = ticketSnap.data();
    const project = ticketData.project;
    
    if (!project) {
      return res.json({ success: true, clients: [] });
    }
    
    const usersRef = db.collection('users');
    const q = usersRef.where('project', '==', project).where('role', '==', 'client');
    const snapshot = await q.get();
    
    const clients = snapshot.docs.map(doc => {
      const data = doc.data();
      let name = '';
      if (data.firstName && data.lastName) {
        name = `${data.firstName} ${data.lastName}`.trim();
      } else if (data.firstName) {
        name = data.firstName;
      } else if (data.lastName) {
        name = data.lastName;
      } else {
        name = data.email.split('@')[0];
      }
      return {
        id: doc.id,
        email: data.email,
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

