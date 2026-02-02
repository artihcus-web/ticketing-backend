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
// Updated to handle both local (Admin) and External (Everyone else) login
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

    // 1. Check local DB first (Admins)
    const localUser = await usersCollection.findOne({
      $or: [
        { email: loginIdentifier.toLowerCase() },
        { empId: loginIdentifier }
      ]
    });

    // If it's a local Admin, handle locally
    if (localUser && localUser.role?.toLowerCase() === 'admin') {
      if (localUser.status === 'disabled' || localUser.status === 'deleted') {
        return res.status(403).json({
          success: false,
          error: `Your account is ${localUser.status}.`
        });
      }

      const passwordValid = await bcrypt.compare(password, localUser.password);
      if (passwordValid) {
        const token = generateToken({
          id: localUser._id.toString(),
          email: localUser.email,
          role: localUser.role,
        });

        return res.json({
          success: true,
          token,
          user: {
            id: localUser._id.toString(),
            role: localUser.role,
            firstName: localUser.firstName,
            lastName: localUser.lastName,
            empId: localUser.empId,
            clientId: localUser.clientId,
            email: localUser.email
          },
          redirectPath: '/admin'
        });
      }
    }

    // 2. Bridge to external API (Everyone else, or if local admin password failed)
    console.log(`[AUTH] 🌉 Bridging login for: ${loginIdentifier}`);
    try {
      const apiBase = process.env.EMPLOYEES_API_URL || process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
      const externalLoginUrl = `${apiBase.replace(/\/+$/, '')}/auth/login`;

      const externalResponse = await fetch(externalLoginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginIdentifier, password })
      });

      if (externalResponse.ok) {
        const externalData = await externalResponse.json();
        console.log(`[AUTH] ✅ External login success for: ${loginIdentifier}`);
        return res.json({
          success: true,
          token: externalData.token,
          user: externalData.user
        });
      } else {
        const errorData = await externalResponse.json().catch(() => ({}));
        console.warn(`[AUTH] ❌ External login failed for ${loginIdentifier}:`, externalResponse.status);
        return res.status(externalResponse.status).json({
          success: false,
          error: errorData.message || 'Invalid email or password'
        });
      }
    } catch (externalErr) {
      console.error("[AUTH] 💥 External login bridge crash:", externalErr.message);
      return res.status(502).json({
        success: false,
        error: 'Authentication service unavailable.'
      });
    }

  } catch (err) {
    console.error("Login process error:", err);
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
