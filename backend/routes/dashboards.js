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
      // Fallback for external users verified by token middleware
      if (req.user && req.user.email) {
        return res.json({
          success: true,
          user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            userName: req.user.userName,
            fullName: req.user.fullName,
            isExternal: true
          }
        });
      }

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
        isExternal: false
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

// GET /dashboards/projects - Get projects for current user from External REST API
router.get('/projects', verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email?.toLowerCase().trim();
    const apiBase = process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';

    // 1. Fetch current user's assigned projects from employees API
    const employeesUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/employees`;
    const empResponse = await fetch(employeesUrl);
    let assignedProjectIds = [];

    if (empResponse.ok) {
      const empData = await empResponse.json();
      const employees = empData.employees || empData;
      const currentEmp = employees.find(e => e.email?.toLowerCase().trim() === userEmail);
      if (currentEmp && currentEmp.assignedProjects) {
        assignedProjectIds = currentEmp.assignedProjects;
      }
    }

    // 2. Fetch all projects from REST API
    const projectsUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/projects`;
    const projResponse = await fetch(projectsUrl);

    if (!projResponse.ok) {
      throw new Error(`External API returned ${projResponse.status}: ${projResponse.statusText}`);
    }

    const projData = await projResponse.json();
    const allProjects = Array.isArray(projData) ? projData : (projData.projects || []);

    // 3. Search through all projects to find where the user is a member
    const userProjects = allProjects
      .filter(p => {
        // Check if user is in assignedProjectIds from employee profile
        const pid = p._id || p.id;
        if (assignedProjectIds.includes(pid)) return true;

        // Also check if user is listed in employees or projectManagers arrays
        const members = [
          ...(p.employees || []),
          ...(p.projectManagers || [])
        ];

        return members.some(m =>
          (m.email && m.email.toLowerCase().trim() === userEmail) ||
          (m.employeeId && m.employeeId === req.user.employeeId) ||
          (m.username && m.username.toLowerCase().trim() === userEmail)
        );
      })
      .map(p => ({
        id: p._id || p.id,
        name: p.projectName || p.name,
        description: p.description || 'External Project',
        isExternal: true
      }));

    res.json({
      success: true,
      projects: userProjects,
    });
  } catch (error) {
    console.error('Error fetching projects from external API:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects from external API',
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
      // Search by ID first
      const query = { $or: [{ projectId: projectId }] };

      // Fetch project name from REST API to allow matching legacy tickets
      try {
        const apiBase = process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
        const projectsUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/projects`;
        const response = await fetch(projectsUrl);

        if (response.ok) {
          const data = await response.json();
          const projectsArray = Array.isArray(data) ? data : (data.projects || []);
          const project = projectsArray.find(p =>
            (p._id && p._id.toString() === projectId) ||
            (p.id && p.id.toString() === projectId)
          );

          if (project) {
            const projectName = project.projectName || project.name;
            if (projectName) {
              query.$or.push({ project: projectName });
            }
          }
        }
      } catch (err) {
        console.error('Error fetching project from REST API:', err);
      }

      const foundTickets = await ticketsCollection.find(query).toArray();
      tickets = foundTickets.map((t) => ({
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