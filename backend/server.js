import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import projectRoutes from './routes/projects.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboards.js';
import teamRoutes from './routes/team.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Disable ETag so intermediaries/browsers don't serve 304 for API calls
app.set('etag', false);

// Middleware
// CORS configuration - allow requests from frontend
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());

// Prevent caching of API responses (fixes stale UI after updates in some deployments)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/tickets', ticketRoutes);
app.use('/projects', projectRoutes);
app.use('/admin', adminRoutes);
app.use('/dashboards', dashboardRoutes);
app.use('/team', teamRoutes);

// Health check
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok', message: 'Backend is running' });
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  console.error('Stack:', err.stack);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  console.error('Stack:', err.stack);
  process.exit(1);
});

// Error handling middleware (should be last)
app.use((err, req, res, next) => {
  console.error('❌ Express Error:', err);
  console.error('Stack:', err.stack);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});


