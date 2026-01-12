import express from 'express';
import { getDB } from '../config/mongodb.js';
import { verifyToken } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin role required.'
    });
  }
};

// GET /admin/stats - Get admin dashboard statistics
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection('users');
    const ticketsCollection = db.collection('tickets');
    const projectsCollection = db.collection('projects');

    const totalUsers = await usersCollection.countDocuments();
    const totalTickets = await ticketsCollection.countDocuments();
    const totalProjects = await projectsCollection.countDocuments();
    
    const openTickets = await ticketsCollection.countDocuments({ status: 'Open' });
    const inProgressTickets = await ticketsCollection.countDocuments({ status: 'In Progress' });
    const resolvedTickets = await ticketsCollection.countDocuments({ status: 'Resolved' });
    const closedTickets = await ticketsCollection.countDocuments({ status: 'Closed' });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalTickets,
        totalProjects,
        openTickets,
        inProgressTickets,
        resolvedTickets,
        closedTickets
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin statistics'
    });
  }
});

// GET /admin/users - Get all users
router.get('/users', verifyToken, isAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection('users');
    const users = await usersCollection.find({}).toArray();

    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      role: user.role,
      project: user.project || [],
      status: user.status || 'active',
      createdAt: user.createdAt || null,
      _id: undefined
    }));

    res.json({
      success: true,
      users: formattedUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// GET /admin/ticket-stats - Get ticket statistics
router.get('/ticket-stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');

    const tickets = await ticketsCollection.find({}).toArray();

    // Calculate stats by status
    const statusCounts = {
      Open: 0,
      'In Progress': 0,
      Resolved: 0,
      Closed: 0
    };

    // Calculate stats by priority
    const priorityCounts = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0
    };

    // Calculate tickets over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const ticketsOverTime = [];
    const dateMap = {};

    tickets.forEach(ticket => {
      // Status counts
      if (ticket.status && statusCounts.hasOwnProperty(ticket.status)) {
        statusCounts[ticket.status]++;
      }

      // Priority counts
      if (ticket.priority && priorityCounts.hasOwnProperty(ticket.priority)) {
        priorityCounts[ticket.priority]++;
      }

      // Tickets over time
      const createdDate = ticket.created instanceof Date 
        ? ticket.created 
        : new Date(ticket.created);
      
      if (createdDate >= thirtyDaysAgo) {
        const dateKey = createdDate.toISOString().split('T')[0];
        dateMap[dateKey] = (dateMap[dateKey] || 0) + 1;
      }
    });

    // Convert date map to array
    Object.keys(dateMap).sort().forEach(date => {
      ticketsOverTime.push({
        date: date,
        count: dateMap[date]
      });
    });

    // Get recent activity (last 10 tickets)
    const recentActivity = tickets
      .sort((a, b) => {
        const dateA = a.created instanceof Date ? a.created : new Date(a.created || 0);
        const dateB = b.created instanceof Date ? b.created : new Date(b.created || 0);
        return dateB - dateA;
      })
      .slice(0, 10)
      .map(ticket => ({
        id: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber || '',
        subject: ticket.subject || '',
        status: ticket.status || 'Open',
        priority: ticket.priority || 'Medium',
        created: ticket.created instanceof Date ? ticket.created.toISOString() : (ticket.created || new Date().toISOString()),
        email: ticket.email || ''
      }));

    res.json({
      success: true,
      ticketStats: {
        byStatus: statusCounts,
        byPriority: priorityCounts,
        ticketsOverTime,
        totalTickets: tickets.length,
        recentActivity
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

// GET /admin/projects - Get all projects
router.get('/projects', verifyToken, isAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const projectsCollection = db.collection('projects');
    const projects = await projectsCollection.find({}).toArray();

    const formattedProjects = projects.map(project => ({
      id: project._id.toString(),
      name: project.name,
      description: project.description || '',
      members: project.members || [],
      createdAt: project.createdAt || null,
      _id: undefined
    }));

    res.json({
      success: true,
      projects: formattedProjects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects'
    });
  }
});

// GET /admin/tickets - Get all tickets (admin only)
router.get('/tickets', verifyToken, isAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const ticketsCollection = db.collection('tickets');
    const tickets = await ticketsCollection.find({}).sort({ created: -1 }).toArray();

    const formattedTickets = tickets.map(ticket => ({
      id: ticket._id.toString(),
      ticketNumber: ticket.ticketNumber || '',
      subject: ticket.subject || '',
      email: ticket.email || '',
      customer: ticket.customer || '',
      project: ticket.project || '',
      projectId: ticket.projectId || '',
      module: ticket.module || '',
      category: ticket.category || '',
      subCategory: ticket.subCategory || '',
      typeOfIssue: ticket.typeOfIssue || '',
      priority: ticket.priority || 'Medium',
      description: ticket.description || '',
      status: ticket.status || 'Open',
      created: ticket.created instanceof Date ? ticket.created.toISOString() : (ticket.created || new Date().toISOString()),
      lastUpdated: ticket.lastUpdated instanceof Date ? ticket.lastUpdated.toISOString() : (ticket.lastUpdated || new Date().toISOString()),
      assignedTo: ticket.assignedTo || null,
      comments: ticket.comments || [],
      attachments: ticket.attachments || [],
      starred: ticket.starred || false,
      userId: ticket.userId || '',
      reportedBy: ticket.reportedBy || '',
      _id: undefined
    }));

    res.json({
      success: true,
      tickets: formattedTickets
    });
  } catch (error) {
    console.error('Error fetching admin tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickets'
    });
  }
});

export default router;
