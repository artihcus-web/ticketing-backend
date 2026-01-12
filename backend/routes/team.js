import express from 'express';
import { getDB } from '../config/mongodb.js';
import { verifyToken } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// GET /team/members - Get all team members (employees and project managers) (MongoDB)
router.get('/members', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection('users');

    const teamDocs = await usersCollection
      .find({ role: { $in: ['employee', 'project_manager'] } })
      .toArray();

    const teamData = teamDocs.map((doc) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));

    res.json({
      success: true,
      members: teamData,
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team members',
    });
  }
});

// GET /team/projects - Get projects (filtered by user role) (MongoDB)
router.get('/projects', verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userRole = req.user.role;

    const db = await getDB();
    const projectsCollection = db.collection('projects');

    const allProjectsDocs = await projectsCollection.find({}).toArray();
    const allProjects = allProjectsDocs.map((doc) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));

    // If current user is a project manager, only show projects where they are a manager
    let filteredProjects = allProjects;
    if (userRole === 'project_manager') {
      filteredProjects = allProjects.filter((project) =>
        (project.members || []).some(
          (m) => m.email === userEmail && m.role === 'project_manager',
        ),
      );
    }

    res.json({
      success: true,
      projects: filteredProjects,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects',
    });
  }
});

// GET /team/projects/:id/members - Get project members (MongoDB)
router.get('/projects/:id/members', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    const userRole = req.user.role;

    const db = await getDB();
    const projectsCollection = db.collection('projects');

    let projectDoc;
    try {
      projectDoc = await projectsCollection.findOne({ _id: new ObjectId(id) });
    } catch {
      projectDoc = await projectsCollection.findOne({ _id: id });
    }

    if (!projectDoc) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const projectData = projectDoc;

    // Check if current user is a project manager in this project
    const isManagerInProject = (projectData.members || []).some(
      (m) => m.email === userEmail && m.role === 'project_manager',
    );

    if (!isManagerInProject && userRole === 'project_manager') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You are not a manager in this project',
      });
    }

    // Only show members with role 'employee' or 'project_manager'
    const filteredMembers = (projectData.members || []).filter(
      (m) => m.role === 'employee' || m.role === 'project_manager',
    );

    res.json({
      success: true,
      members: filteredMembers,
      project: {
        id: projectDoc._id.toString(),
        ...projectData,
        _id: undefined,
      },
    });
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project members',
    });
  }
});

// GET /team/employee/:id - Get employee by ID (MongoDB)
router.get('/employee/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const db = await getDB();
    const usersCollection = db.collection('users');

    let userDoc;
    try {
      userDoc = await usersCollection.findOne({ _id: new ObjectId(id) });
    } catch {
      userDoc = await usersCollection.findOne({ _id: id });
    }

    if (!userDoc) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found',
      });
    }

    res.json({
      success: true,
      employee: {
        id: userDoc._id.toString(),
        ...userDoc,
        _id: undefined,
      },
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employee',
    });
  }
});

// GET /team/kpi/:email - Get KPI data for an employee (MongoDB)
router.get('/kpi/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params;

    const db = await getDB();
    const ticketsCollection = db.collection('tickets');

    // Fetch tickets assigned to this employee
    const ticketsDocs = await ticketsCollection
      .find({ 'assignedTo.email': email })
      .toArray();

    const tickets = ticketsDocs.map((doc) => ({
      id: doc._id.toString(),
      ...doc,
      created:
        doc.created instanceof Date
          ? doc.created.toISOString()
          : doc.created || null,
      lastUpdated:
        doc.lastUpdated instanceof Date
          ? doc.lastUpdated.toISOString()
          : doc.lastUpdated || null,
      _id: undefined,
    }));

    res.json({
      success: true,
      tickets,
    });
  } catch (error) {
    console.error('Error fetching KPI data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KPI data',
    });
  }
});

export default router;