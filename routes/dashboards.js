import express from 'express';
import { db } from '../config/firebase.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// GET /dashboards/user - Get current user data
router.get('/user', verifyToken, async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.user.id);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const userData = userSnap.data();
    res.json({
      success: true,
      user: {
        id: userSnap.id,
        ...userData
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user data'
    });
  }
});

// GET /dashboards/projects - Get projects for current user (filtered by role)
router.get('/projects', verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userRole = req.user.role;
    
    // Get user's projects
    const projectsRef = db.collection('projects');
    const projectsSnapshot = await projectsRef.get();
    
    const projects = projectsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(project => {
        const members = project.members || [];
        return members.some(m => 
          m.email === userEmail && 
          (m.role === userRole || 
           (userRole === 'client_head' && (m.role === 'client_head' || m.role === 'client')) ||
           (userRole === 'project_manager' && m.role === 'project_manager') ||
           (userRole === 'employee' && m.role === 'employee') ||
           (userRole === 'client' && m.role === 'client'))
        );
      });
    
    res.json({
      success: true,
      projects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects'
    });
  }
});

// GET /dashboards/tickets - Get tickets for a project
router.get('/tickets', verifyToken, async (req, res) => {
  try {
    const { projectId, projectName } = req.query;
    
    if (!projectId && !projectName) {
      return res.status(400).json({
        success: false,
        error: 'projectId or projectName is required'
      });
    }
    
    const ticketsRef = db.collection('tickets');
    let tickets = [];
    
    if (projectId) {
      // Query by projectId
      const q1 = ticketsRef.where('projectId', '==', projectId);
      const snapshot1 = await q1.get();
      tickets = snapshot1.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    if (projectName) {
      // Query by project name (both string and array-contains)
      const q2 = ticketsRef.where('project', '==', projectName);
      const snapshot2 = await q2.get();
      const ticketsByName = snapshot2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Merge and deduplicate
      const ticketMap = {};
      [...tickets, ...ticketsByName].forEach(ticket => {
        ticketMap[ticket.id] = ticket;
      });
      tickets = Object.values(ticketMap);
    }
    
    res.json({
      success: true,
      tickets
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickets'
    });
  }
});

// GET /dashboards/clients - Get clients (for client head dashboard)
router.get('/clients', verifyToken, async (req, res) => {
  try {
    const clientsQuery = db.collection('users').where('role', '==', 'client');
    const clientsSnapshot = await clientsQuery.get();
    const clients = clientsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      clients
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clients'
    });
  }
});

// GET /dashboards/stats - Get dashboard statistics
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const { projectId, projectName, year } = req.query;
    const userEmail = req.user.email;
    const userRole = req.user.role;
    
    // Get tickets for the project
    const ticketsRef = db.collection('tickets');
    let ticketsSnapshot;
    
    if (projectId) {
      ticketsSnapshot = await ticketsRef.where('projectId', '==', projectId).get();
    } else if (projectName) {
      ticketsSnapshot = await ticketsRef.where('project', '==', projectName).get();
    } else {
      // Get all tickets user has access to
      ticketsSnapshot = await ticketsRef.get();
    }
    
    const tickets = ticketsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        created: data.created?.toDate ? data.created.toDate().toISOString() : (data.created || null)
      };
    });
    
    // Filter by year if provided
    let filteredTickets = tickets;
    if (year) {
      const yearNum = parseInt(year);
      filteredTickets = tickets.filter(t => {
        const created = t.created ? new Date(t.created) : null;
        return created && created.getFullYear() === yearNum;
      });
    }
    
    // Calculate stats
    const stats = {
      totalTickets: filteredTickets.length,
      openTickets: filteredTickets.filter(t => String(t.status).trim().toLowerCase() === 'open').length,
      inProgressTickets: filteredTickets.filter(t => String(t.status).trim().toLowerCase() === 'in progress').length,
      resolvedTickets: filteredTickets.filter(t => String(t.status).trim().toLowerCase() === 'resolved').length,
      closedTickets: filteredTickets.filter(t => String(t.status).trim().toLowerCase() === 'closed').length,
      unclosedTickets: filteredTickets.filter(t => String(t.status).trim().toLowerCase() !== 'closed').length,
      criticalCount: filteredTickets.filter(t => String(t.priority).trim().toLowerCase() === 'critical').length,
      highCount: filteredTickets.filter(t => String(t.priority).trim().toLowerCase() === 'high').length,
      mediumCount: filteredTickets.filter(t => String(t.priority).trim().toLowerCase() === 'medium').length,
      lowCount: filteredTickets.filter(t => String(t.priority).trim().toLowerCase() === 'low').length,
    };
    
    // Role-specific stats
    if (userRole === 'client_head') {
      const clientsQuery = db.collection('users').where('role', '==', 'client');
      const clientsSnapshot = await clientsQuery.get();
      stats.totalClients = clientsSnapshot.size;
    }
    
    res.json({
      success: true,
      stats,
      tickets: filteredTickets
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

export default router;


