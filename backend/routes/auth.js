import express from 'express';
import bcrypt from 'bcrypt';
import { getDB } from '../config/mongodb.js';
import { generateToken, verifyToken } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const router = express.Router();

// POST /auth/external-login - Proxy login to external API
router.post('/external-login', async (req, res) => {
  try {
    const apiBase = process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
    const loginUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/auth/login`;

    console.log(`🔍 Backend proxying login to: ${loginUrl}`);

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('❌ External login proxy error:', error);
    res.status(500).json({ success: false, error: 'Failed' });
  }
});

// GET /auth/external-verify - Proxy token verification to external API
router.get('/external-verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token' });
    }

    const apiBase = process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
    const verifyUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/auth/me`;

    console.log(`🔍 Backend proxying verify to: ${verifyUrl}`);

    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('❌ External verify proxy error:', error);
    res.status(500).json({ success: false, error: 'Failed' });
  }
});

// POST /auth/login
// POST /login - Restricted to Admins only
router.post('/login', async (req, res) => {
  try {
    const { email, password, identifier } = req.body;
    const loginIdentifier = identifier || email;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please fill in all fields'
      });
    }

    const db = await getDB();
    const usersCollection = db.collection('users');

    // Find user by email or empId
    const user = await usersCollection.findOne({
      $or: [
        { email: loginIdentifier.toLowerCase() },
        { empId: loginIdentifier }
      ]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // CRITICAL: Only allow Admin login via local fallback
    if (user.role?.toLowerCase() !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only Admin accounts can use local authentication.'
      });
    }

    if (user.status === 'disabled' || user.status === 'deleted') {
      return res.status(403).json({
        success: false,
        error: `Your account is ${user.status}.`
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Determine redirect path
    let redirectPath = '/admin'; // Local fallback is only for admins

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
        email: user.email
      },
      redirectPath
    });

  } catch (err) {
    console.error("Local login error:", err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred.'
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
