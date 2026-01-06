import express from 'express';
import { db } from '../config/firebase.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// GET /team/members - Get all team members (employees and project managers)
router.get('/members', verifyToken, async (req, res) => {
  try {
    const teamQuery = db.collection('users').where('role', 'in', ['employee', 'project_manager']);
    const teamSnapshot = await teamQuery.get();
    const teamData = teamSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      members: teamData
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team members'
    });
  }
});

// GET /team/projects - Get projects (filtered by user role)
router.get('/projects', verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userRole = req.user.role;
    
    const projectsSnapshot = await db.collection('projects').get();
    const allProjects = projectsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // If current user is a project manager, only show projects where they are a manager
    let filteredProjects = allProjects;
    if (userRole === 'project_manager') {
      filteredProjects = allProjects.filter(project =>
        (project.members || []).some(
          m => m.email === userEmail && m.role === 'project_manager'
        )
      );
    }
    
    res.json({
      success: true,
      projects: filteredProjects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects'
    });
  }
});

// GET /team/projects/:id/members - Get project members
router.get('/projects/:id/members', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    const userRole = req.user.role;
    
    const projectDoc = await db.collection('projects').doc(id).get();
    if (!projectDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    const projectData = projectDoc.data();
    
    // Check if current user is a project manager in this project
    const isManagerInProject = (projectData.members || []).some(
      m => m.email === userEmail && m.role === 'project_manager'
    );
    
    if (!isManagerInProject && userRole === 'project_manager') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You are not a manager in this project'
      });
    }
    
    // Only show members with role 'employee' or 'project_manager'
    const filteredMembers = (projectData.members || []).filter(
      m => m.role === 'employee' || m.role === 'project_manager'
    );
    
    res.json({
      success: true,
      members: filteredMembers,
      project: {
        id: projectDoc.id,
        ...projectData
      }
    });
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project members'
    });
  }
});

// GET /team/employee/:id - Get employee by ID
router.get('/employee/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userDoc = await db.collection('users').doc(id).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }
    
    res.json({
      success: true,
      employee: {
        id: userDoc.id,
        ...userDoc.data()
      }
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employee'
    });
  }
});

// GET /team/kpi/:email - Get KPI data for an employee
router.get('/kpi/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Fetch tickets assigned to this employee
    const ticketsQuery = db.collection('tickets').where('assignedTo.email', '==', email);
    const ticketsSnapshot = await ticketsQuery.get();
    const tickets = ticketsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        created: data.created?.toDate ? data.created.toDate().toISOString() : (data.created || null),
        lastUpdated: data.lastUpdated?.toDate ? data.lastUpdated.toDate().toISOString() : (data.lastUpdated || null),
      };
    });
    
    res.json({
      success: true,
      tickets
    });
  } catch (error) {
    console.error('Error fetching KPI data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KPI data'
    });
  }
});

export default router;


