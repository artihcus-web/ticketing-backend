import express from 'express';
import { getDB, getExternalDB } from '../config/mongodb.js';
import { verifyToken } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = express.Router();

// GET /projects - Get all projects from External REST API
router.get('/', verifyToken, async (req, res) => {
  try {
    const apiBase = process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
    const projectsUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/projects`;
    const employeesUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/employees`;

    console.log(`Fetching projects from: ${projectsUrl}`);

    // Fetch both projects and employees in parallel
    const [projectsResponse, employeesResponse] = await Promise.all([
      fetch(projectsUrl),
      fetch(employeesUrl)
    ]);

    if (!projectsResponse.ok) {
      throw new Error(`Projects API returned ${projectsResponse.status}: ${projectsResponse.statusText}`);
    }

    const projectsData = await projectsResponse.json();
    const projectsArray = Array.isArray(projectsData) ? projectsData : (projectsData.projects || []);

    // Build employee lookup maps by email and employeeId
    const employeeMapByEmail = {};
    const employeeMapById = {};
    if (employeesResponse.ok) {
      const employeesData = await employeesResponse.json();
      const employeesArray = employeesData.employees || employeesData;
      employeesArray.forEach(emp => {
        if (emp.email) {
          employeeMapByEmail[emp.email.toLowerCase().trim()] = emp;
        }
        if (emp.employeeId) {
          employeeMapById[emp.employeeId] = emp;
        }
      });
    }

    // Format projects and enrich employee data with roles
    const formattedProjects = projectsArray.map(project => {
      // Combine employees and projectManagers arrays
      const allMembers = [
        ...(project.employees || []),
        ...(project.projectManagers || [])
      ];

      return {
        id: project._id || project.id,
        name: project.projectName || project.name,
        description: project.description || '',
        members: allMembers.map(emp => {
          // Try to find employee by email first, then by employeeId
          const email = emp.email?.toLowerCase().trim();
          let fullEmployee = email ? employeeMapByEmail[email] : null;

          if (!fullEmployee && emp.employeeId) {
            fullEmployee = employeeMapById[emp.employeeId];
          }

          return {
            uid: emp._id || emp.uid,
            email: fullEmployee?.email || emp.email,
            employeeId: emp.employeeId || fullEmployee?.employeeId,
            role: fullEmployee?.role || 'employee',
            userType: fullEmployee?.userType || 'employee',
            status: fullEmployee?.status || (fullEmployee?.isActive ? 'active' : 'inactive')
          };
        }),
        createdAt: project.createdAt || new Date(),
        isExternal: true
      };
    });

    res.json({ success: true, projects: formattedProjects });
  } catch (error) {
    console.error('Error fetching projects from external API:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects from external API' });
  }
});

// GET /projects/:id - Get a single project by ID from External REST API
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const apiBase = process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
    const projectsUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/projects`;
    const employeesUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/employees`;

    console.log(`Fetching project ${id} from: ${projectsUrl}`);

    // Fetch both projects and employees in parallel
    const [projectsResponse, employeesResponse] = await Promise.all([
      fetch(projectsUrl),
      fetch(employeesUrl)
    ]);

    if (!projectsResponse.ok) {
      throw new Error(`Projects API returned ${projectsResponse.status}: ${projectsResponse.statusText}`);
    }

    const projectsData = await projectsResponse.json();
    const projectsArray = Array.isArray(projectsData) ? projectsData : (projectsData.projects || []);

    // Find the specific project by ID
    const project = projectsArray.find(p =>
      (p._id && p._id.toString() === id) ||
      (p.id && p.id.toString() === id)
    );

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Build employee lookup maps by email and employeeId
    const employeeMapByEmail = {};
    const employeeMapById = {};
    if (employeesResponse.ok) {
      const employeesData = await employeesResponse.json();
      const employeesArray = employeesData.employees || employeesData;
      employeesArray.forEach(emp => {
        if (emp.email) {
          employeeMapByEmail[emp.email.toLowerCase().trim()] = emp;
        }
        if (emp.employeeId) {
          employeeMapById[emp.employeeId] = emp;
        }
      });
    }

    // Format the project and enrich employee data with roles
    // Combine employees and projectManagers arrays
    const allMembers = [
      ...(project.employees || []),
      ...(project.projectManagers || [])
    ];

    const formattedProject = {
      id: project._id || project.id,
      name: project.projectName || project.name,
      description: project.description || '',
      members: allMembers.map(emp => {
        // Try to find employee by email first, then by employeeId
        const email = emp.email?.toLowerCase().trim();
        let fullEmployee = email ? employeeMapByEmail[email] : null;

        if (!fullEmployee && emp.employeeId) {
          fullEmployee = employeeMapById[emp.employeeId];
        }

        return {
          uid: emp._id || emp.uid,
          email: fullEmployee?.email || emp.email,
          employeeId: emp.employeeId || fullEmployee?.employeeId,
          role: fullEmployee?.role || 'employee',
          userType: fullEmployee?.userType || 'employee',
          status: fullEmployee?.status || (fullEmployee?.isActive ? 'active' : 'inactive')
        };
      }),
      createdAt: project.createdAt || new Date(),
      isExternal: true
    };

    res.json({ success: true, project: formattedProject });
  } catch (error) {
    console.error('Error fetching project from external API:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch project from external API' });
  }
});

// POST /projects - Disabled (Projects are managed externally)
router.post('/', verifyToken, async (req, res) => {
  res.status(403).json({ success: false, error: 'Project creation is disabled. Projects must be managed in the source application.' });
});

// PUT /projects/:id - Disabled (Projects are managed externally)
router.put('/:id', verifyToken, async (req, res) => {
  res.status(403).json({ success: false, error: 'Project updates are disabled. Projects must be managed in the source application.' });
});

// DELETE /projects/:id - Disabled (Projects are managed externally)
router.delete('/:id', verifyToken, async (req, res) => {
  res.status(403).json({ success: false, error: 'Project deletion is disabled. Projects must be managed in the source application.' });
});

// POST /projects/:id/members - Disabled (Projects are managed externally)
router.post('/:id/members', verifyToken, async (req, res) => {
  res.status(403).json({ success: false, error: 'Member management is disabled. Members must be managed in the source application.' });
});

// PUT /projects/:id/members/:email - Disabled (Projects are managed externally)
router.put('/:id/members/:email', verifyToken, async (req, res) => {
  res.status(403).json({ success: false, error: 'Member management is disabled. Members must be managed in the source application.' });
});

// DELETE /projects/:id/members/:email - Disabled (Projects are managed externally)
router.delete('/:id/members/:email', verifyToken, async (req, res) => {
  res.status(403).json({ success: false, error: 'Member management is disabled. Members must be managed in the source application.' });
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

