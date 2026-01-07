import express from 'express';
import bcrypt from 'bcrypt';
import { getDB } from '../config/mongodb.js';
import { generateToken, verifyToken } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const router = express.Router();

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('📥 Login request received');
    console.log('Request body:', { email: req.body?.email, hasPassword: !!req.body?.password });
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please fill in all fields' 
      });
    }

    console.log('🔍 Connecting to MongoDB...');
    const db = await getDB();
    console.log('✅ MongoDB connection obtained');
    const usersCollection = db.collection('users');

    // 1. Find user by email
    console.log('🔍 Searching for user:', email.toLowerCase());
    const user = await usersCollection.findOne({ email: email.toLowerCase() });
    console.log('👤 User found:', user ? 'Yes' : 'No');

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    // 2. Check if user account is disabled or deleted
    if (user.status === 'disabled') {
      return res.status(403).json({ 
        success: false, 
        error: 'Your account has been disabled by the admin.' 
      });
    }

    if (user.status === 'deleted') {
      return res.status(403).json({ 
        success: false, 
        error: 'Your account has been deleted by the admin.' 
      });
    }

    // 3. Handle pending users - hash password if it's plain text
    if (user.status === 'pending' && user.password && !user.password.startsWith('$2')) {
      // Password is plain text, hash it
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await usersCollection.updateOne(
        { _id: user._id },
        { 
          $set: { 
            password: hashedPassword,
            status: 'active'
          }
        }
      );
      user.password = hashedPassword;
      user.status = 'active';
    }

    // 4. Verify password
    let passwordValid = false;
    
    // Check if password is hashed (starts with $2a$, $2b$, or $2y$)
    if (user.password && user.password.startsWith('$2')) {
      // Password is hashed, use bcrypt compare
      passwordValid = await bcrypt.compare(password, user.password);
    } else if (user.password) {
      // Password is plain text (legacy), compare directly
      passwordValid = user.password === password;
      // If valid, hash it for future use
      if (passwordValid) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { password: hashedPassword } }
        );
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    // 5. Update status to active if it was pending
    if (user.status === 'pending') {
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { status: 'active' } }
      );
      user.status = 'active';
    }

    // 6. Determine redirect path based on role
    const role = user.role?.toLowerCase();
    let redirectPath = '/access-denied';
    switch (role) {
      case 'admin':
        redirectPath = '/admin';
        break;
      case 'employee':
        redirectPath = '/employeedashboard';
        break;
      case 'client':
        redirectPath = '/clientdashboard';
        break;
      case 'project_manager':
        redirectPath = '/project-manager-dashboard';
        break;
      case 'client_head':
        redirectPath = '/client-head-dashboard';
        break;
    }

    // 7. Generate JWT token
    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // 8. Return success response
    console.log('✅ Login successful for:', email);
    res.json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        empId: user.empId,
        clientId: user.clientId,
        project: user.project || null,
        email: user.email
      },
      redirectPath
    });

  } catch (err) {
    console.error("Login error:", err);
    console.error("Error stack:", err.stack);
    
    return res.status(500).json({ 
      success: false, 
      error: err.message || 'An unexpected error occurred. Please try again.' 
    });
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please enter your email address.' 
      });
    }

    const db = await getDB();
    const usersCollection = db.collection('users');

    // Check if user exists
    const user = await usersCollection.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'No account found with this email address' 
      });
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in user document
    await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          resetToken: resetToken,
          resetTokenExpiry: resetTokenExpiry
        }
      }
    );

    // In production, send email with reset link
    // For now, return success message
    // TODO: Integrate with email service to send reset link
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    
    return res.json({
      success: true,
      message: 'Password reset link has been sent to your email. Please check your inbox.',
      resetLink // Remove this in production, only for testing
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    
    return res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to send reset link. Please try again.' 
    });
  }
});

// POST /auth/reset-password - Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters long' 
      });
    }

    const db = await getDB();
    const usersCollection = db.collection('users');

    // Find user by reset token
    const user = await usersCollection.findOne({ 
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or expired reset token' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { password: hashedPassword },
        $unset: { resetToken: '', resetTokenExpiry: '' }
      }
    );

    return res.json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });

  } catch (err) {
    console.error("Reset password error:", err);
    
    return res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to reset password. Please try again.' 
    });
  }
});

// GET /auth/verify - Verify token and get user info
router.get('/verify', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const db = await getDB();
    const usersCollection = db.collection('users');
    
    // Try to find user by ObjectId first, then by string
    let user;
    try {
      user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    } catch (err) {
      // If ObjectId conversion fails, try as string
      user = await usersCollection.findOne({ _id: userId });
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user is disabled
    if (user.status === 'disabled') {
      return res.status(403).json({
        success: false,
        error: 'Your account has been disabled by the admin.'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        empId: user.empId,
        clientId: user.clientId,
        project: user.project || null,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify token'
    });
  }
});

// GET /auth/user - Get current user info (requires token)
router.get('/user', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const db = await getDB();
    const usersCollection = db.collection('users');
    
    const user = await usersCollection.findOne({ _id: userId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        empId: user.empId,
        clientId: user.clientId,
        project: user.project || null,
        email: user.email,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user info'
    });
  }
});

export default router;
