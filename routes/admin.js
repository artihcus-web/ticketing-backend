import express from 'express';
import { db } from '../config/firebase.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// GET /admin/stats - Get admin dashboard statistics
router.get('/stats', verifyToken, async (req, res) => {
  try {
    // Fetch total clients
    const clientsQuery = db.collection('users').where('role', '==', 'client');
    const clientsSnapshot = await clientsQuery.get();
    
    // Fetch total employees
    const employeesQuery = db.collection('users').where('role', '==', 'employee');
    const employeesSnapshot = await employeesQuery.get();
    
    // Fetch client heads
    const clientHeadsQuery = db.collection('users').where('role', '==', 'client_head');
    const clientHeadsSnapshot = await clientHeadsQuery.get();
    
    // Fetch project managers
    const projectManagersQuery = db.collection('users').where('role', '==', 'project_manager');
    const projectManagersSnapshot = await projectManagersQuery.get();
    
    // Fetch total projects
    const projectsQuery = db.collection('projects');
    const projectsSnapshot = await projectsQuery.get();
    
    // Fetch total tickets
    const ticketsQuery = db.collection('tickets');
    const ticketsSnapshot = await ticketsQuery.get();
    
    res.json({
      success: true,
      stats: {
        totalClients: clientsSnapshot.size,
        totalEmployees: employeesSnapshot.size,
        clientHeads: clientHeadsSnapshot.size,
        projectManagers: projectManagersSnapshot.size,
        totalProjects: projectsSnapshot.size,
        totalTickets: ticketsSnapshot.size
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// GET /admin/ticket-stats - Get ticket statistics
router.get('/ticket-stats', verifyToken, async (req, res) => {
  try {
    const ticketsQuery = db.collection('tickets');
    const ticketsSnapshot = await ticketsQuery.get();
    
    const statusData = {};
    const priorityData = {};
    const ticketsOverTime = [];
    
    // Process all tickets
    ticketsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const status = data.status || 'Unknown';
      const priority = data.priority || 'Unknown';
      
      statusData[status] = (statusData[status] || 0) + 1;
      priorityData[priority] = (priorityData[priority] || 0) + 1;
    });
    
    // Get recent activity (last 5 tickets)
    const allTickets = ticketsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Sort by created date (most recent first)
    allTickets.sort((a, b) => {
      const dateA = a.created?.toDate ? a.created.toDate() : new Date(a.created || 0);
      const dateB = b.created?.toDate ? b.created.toDate() : new Date(b.created || 0);
      return dateB - dateA;
    });
    
    const recentActivity = allTickets.slice(0, 5);
    
    // Generate tickets over time data (last 7 days)
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      const count = ticketsSnapshot.docs.filter(doc => {
        const ticketDate = doc.data().created?.toDate ? doc.data().created.toDate() : new Date(doc.data().created || 0);
        const ticketDateStr = ticketDate.toISOString().split('T')[0];
        return ticketDateStr === dateStr;
      }).length;
      ticketsOverTime.push({ date, count });
    }
    
    res.json({
      success: true,
      ticketStats: {
        byStatus: statusData,
        byPriority: priorityData,
        recentActivity,
        ticketsOverTime
      }
    });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticket statistics'
    });
  }
});

// GET /admin/users - Get all users
router.get('/users', verifyToken, async (req, res) => {
  try {
    const usersQuery = db.collection('users');
    const usersSnapshot = await usersQuery.get();
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// GET /admin/projects - Get all projects (for dropdowns)
router.get('/projects', verifyToken, async (req, res) => {
  try {
    const projectsQuery = db.collection('projects');
    const projectsSnapshot = await projectsQuery.get();
    const projects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name
    }));
    
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

// GET /admin/tickets - Get all tickets (for admin ticket management)
router.get('/tickets', verifyToken, async (req, res) => {
  try {
    const ticketsQuery = db.collection('tickets');
    const ticketsSnapshot = await ticketsQuery.get();
    const tickets = ticketsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
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

// DELETE /admin/tickets/:id - Delete a ticket
router.delete('/tickets/:id', verifyToken, async (req, res) => {
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
    
    await ticketRef.delete();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete ticket'
    });
  }
});

// POST /admin/tickets/bulk-delete - Bulk delete tickets
router.post('/tickets/bulk-delete', verifyToken, async (req, res) => {
  try {
    const { ticketIds } = req.body;
    
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Ticket IDs array is required'
      });
    }
    
    const batch = db.batch();
    const deletePromises = ticketIds.map(id => {
      const ticketRef = db.collection('tickets').doc(id);
      return ticketRef.delete();
    });
    
    await Promise.all(deletePromises);
    
    res.json({ success: true, deletedCount: ticketIds.length });
  } catch (error) {
    console.error('Error bulk deleting tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete tickets'
    });
  }
});

export default router;

