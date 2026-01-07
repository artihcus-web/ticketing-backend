import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware to verify JWT token
 */
export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.headers['x-access-token'];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'No token provided' 
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

/**
 * Generate JWT token
 */
export const generateToken = (userData) => {
  return jwt.sign(
    {
      id: userData.id,
      email: userData.email,
      role: userData.role,
    },
    JWT_SECRET,
    {
      expiresIn: '7d', // Token expires in 7 days
    }
  );
};





