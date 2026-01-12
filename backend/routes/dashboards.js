import express from 'express';
import { getDB } from '../config/mongodb.js';
import { verifyToken } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// GET /dashboards/user - Get current user data (MongoDB)
router.get('/user', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection('users');

    let user;
    try {
      user = await usersCollection.findOne({ _id: new ObjectId(req.user.id) });
    } catch {
      user = await usersCollection.findOne({ _id: req.user.id });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        ...user,
        _id: undefined,
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user data',
    });
  }
});

// GET /dashboards/projects - Get projects for current user (filtered by role) (MongoDB)
router.get('/projects', verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userRole = req.user.role;

    const db = await getDB();
    const projectsCollection = db.collection('projects');

    const projectsDocs = await projectsCollection.find({}).toArray();

    const projects = projectsDocs
      .map((doc) => ({
        id: doc._id.toString(),
        ...doc,
        _id: undefined,
      }))
      .filter((project) => {
        const members = project.members || [];
        return members.some(
          (m) =>
            m.email === userEmail &&
            (m.role === userRole ||
              (userRole === 'client_head' &&
                (m.role === 'client_head' || m.role === 'client')) ||
              (userRole === 'project_manager' && m.role === 'project_manager') ||
              (userRole === 'employee' && m.role === 'employee') ||
              (userRole === 'client' && m.role === 'client')),
        );
      });

    res.json({
      success: true,
      projects,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects',
    });
  }
});

// GET /dashboards/tickets - Get tickets for a project (MongoDB)
router.get('/tickets', verifyToken, async (req, res) => {
  try {
    const { projectId, projectName } = req.query;

    if (!projectId && !projectName) {
      return res.status(400).json({
        success: false,
        error: 'projectId or projectName is required',
      });
    }

    const db = await getDB();
    const ticketsCollection = db.collection('tickets');

    let tickets = [];

    if (projectId) {
      const byId = await ticketsCollection
        .find({ projectId: projectId })
        .toArray();
      tickets = byId.map((t) => ({
        id: t._id.toString(),
        ...t,
        _id: undefined,
      }));
    }

    if (projectName) {
      const byName = await ticketsCollection
        .find({ project: projectName })
        .toArray();
      const ticketsByName = byName.map((t) => ({
        id: t._id.toString(),
        ...t,
        _id: undefined,
      }));

      // Merge and deduplicate by id
      const ticketMap = {};
      [...tickets, ...ticketsByName].forEach((ticket) => {
        ticketMap[ticket.id] = ticket;
      });
      tickets = Object.values(ticketMap);
    }

    res.json({
      success: true,
      tickets,
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickets',
    });
  }
});

// GET /dashboards/clients - Get clients (for client head dashboard) (MongoDB)
router.get('/clients', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection('users');
    const clientsDocs = await usersCollection
      .find({ role: 'client' })
      .toArray();

    const clients = clientsDocs.map((doc) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));

    res.json({
      success: true,
      clients,
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clients',
    });
  }
});

// GET /dashboards/stats - Get dashboard statistics (MongoDB)
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const { projectId, projectName, year } = req.query;
    const userRole = req.user.role;

    const db = await getDB();
    const ticketsCollection = db.collection('tickets');

    const query = {};
    if (projectId) {
      query.projectId = projectId;
    } else if (projectName) {
      query.project = projectName;
    }

    const ticketsDocs = await ticketsCollection.find(query).toArray();

    const tickets = ticketsDocs.map((doc) => ({
      id: doc._id.toString(),
      ...doc,
      created:
        doc.created instanceof Date
          ? doc.created.toISOString()
          : doc.created || null,
      _id: undefined,
    }));

    // Filter by year if provided
    let filteredTickets = tickets;
    if (year) {
      const yearNum = parseInt(year, 10);
      filteredTickets = tickets.filter((t) => {
        const created = t.created ? new Date(t.created) : null;
        return created && created.getFullYear() === yearNum;
      });
    }

    // Calculate stats
    const stats = {
      totalTickets: filteredTickets.length,
      openTickets: filteredTickets.filter(
        (t) => String(t.status || '').trim().toLowerCase() === 'open',
      ).length,
      inProgressTickets: filteredTickets.filter(
        (t) => String(t.status || '').trim().toLowerCase() === 'in progress',
      ).length,
      resolvedTickets: filteredTickets.filter(
        (t) => String(t.status || '').trim().toLowerCase() === 'resolved',
      ).length,
      closedTickets: filteredTickets.filter(
        (t) => String(t.status || '').trim().toLowerCase() === 'closed',
      ).length,
      unclosedTickets: filteredTickets.filter(
        (t) => String(t.status || '').trim().toLowerCase() !== 'closed',
      ).length,
      criticalCount: filteredTickets.filter(
        (t) => String(t.priority || '').trim().toLowerCase() === 'critical',
      ).length,
      highCount: filteredTickets.filter(
        (t) => String(t.priority || '').trim().toLowerCase() === 'high',
      ).length,
      mediumCount: filteredTickets.filter(
        (t) => String(t.priority || '').trim().toLowerCase() === 'medium',
      ).length,
      lowCount: filteredTickets.filter(
        (t) => String(t.priority || '').trim().toLowerCase() === 'low',
      ).length,
    };

    // Role-specific stats
    if (userRole === 'client_head') {
      const usersCollection = db.collection('users');
      stats.totalClients = await usersCollection.countDocuments({
        role: 'client',
      });
    }

    res.json({
      success: true,
      stats,
      tickets: filteredTickets,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
    });
  }
});

export default router;