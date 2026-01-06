import express from 'express';
import admin from 'firebase-admin';
import { db, auth } from '../config/firebase.js';
import { generateToken, verifyToken } from '../middleware/auth.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Firebase Auth REST API endpoint
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyA5atsWG-tRpSJLMHSqiVUG5let0sb87Uo';

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please fill in all fields' 
      });
    }

    let userData; // Data from the Firestore user document found by email
    let userDocId;
    let userDocRefByEmail; // Reference to the document found by email

    // 1. Check for existing user in Firestore by email
    let userSnapshot;
    try {
      const usersQuery = db.collection('users').where('email', '==', email);
      userSnapshot = await usersQuery.get();
    } catch (firestoreError) {
      console.error('Firestore query error:', firestoreError);
      return res.status(500).json({ 
        success: false, 
        error: 'Database connection error. Please check Firebase Admin SDK configuration.' 
      });
    }

    if (userSnapshot.empty) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    userData = userSnapshot.docs[0].data();
    userDocId = userSnapshot.docs[0].id;
    userDocRefByEmail = userSnapshot.docs[0].ref;

    // Check if user already has an auth account
    let signInMethods = [];
    try {
      const userRecord = await auth.getUserByEmail(email);
      signInMethods = userRecord.providerData.map(p => p.providerId);
    } catch (error) {
      // User doesn't exist in Auth yet - this is okay
      if (error.code !== 'auth/user-not-found') {
        console.error('Error checking Auth user:', error);
      }
      signInMethods = [];
    }

    if (userData.status === 'pending' && userData.password && signInMethods.length === 0) {
      // Only create auth account if user doesn't already have one
      try {
        // Use the temporary password to create the Firebase Auth account
        await auth.createUser({
          email: email,
          password: userData.password,
          emailVerified: false,
        });
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          console.log('Auth account already exists, proceeding to sign in');
        } else {
          console.error('Error creating Auth account for pending user:', authError);
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to activate account. Please try again.' 
          });
        }
      }
    }

    // 2. Verify password and sign in the user using Firebase Auth REST API
    let userRecord;
    let idToken;
    try {
      // Verify password using Firebase Auth REST API
      const response = await fetch(`${FIREBASE_AUTH_URL}?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          password: password,
          returnSecureToken: true
        })
      });

      const authData = await response.json();

      if (!response.ok) {
        if (authData.error?.message?.includes('INVALID_PASSWORD') || 
            authData.error?.message?.includes('EMAIL_NOT_FOUND') ||
            authData.error?.message?.includes('INVALID_LOGIN_CREDENTIALS')) {
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid email or password' 
          });
        }
        throw new Error(authData.error?.message || 'Authentication failed');
      }

      idToken = authData.idToken;
      userRecord = await auth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Password verification error:', error);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    const actualUid = userRecord.uid; // Get the actual Firebase Auth UID

    // 3. Handle UID migration/synchronization if the Firestore document ID is temporary
    if (userDocId !== actualUid) {
      console.log(`UID mismatch: Firestore ID (${userDocId}) vs Auth UID (${actualUid}). Migrating document.`);
      // Create a new document with the actual Firebase Auth UID
      const newUserDocRef = db.collection('users').doc(actualUid);
      // Copy all data from the old document, add status: 'active', and remove password
      const updatedUserData = { ...userData, status: 'active' };
      delete updatedUserData.password; // Ensure temporary password is not copied
      await newUserDocRef.set(updatedUserData);
      console.log('New user document created with actual UID.', newUserDocRef.id);
      // Delete the old temporary document
      await userDocRefByEmail.delete();
      console.log('Old temporary user document deleted.', userDocRefByEmail.id);
      // Update userData and userDocId to point to the new, correct document for subsequent operations
      userData = updatedUserData;
      userDocId = actualUid;
    } else if (userData.status === 'pending') {
      // If UIDs match but status is still pending, update existing document
      console.log('UIDs match, but status pending. Updating existing document.');
      await userDocRefByEmail.update({
        status: 'active',
        password: admin.firestore.FieldValue.delete() // Remove the temporary password field
      });
      userData.status = 'active';
      delete userData.password;
    }

    // 4. After migration or if not pending, check by UID. If the document exists and is not disabled, allow login. If not, block login and show error.
    const userDocRef = db.collection('users').doc(actualUid);
    const userDocSnap = await userDocRef.get();
    if (!userDocSnap.exists) {  // In Admin SDK, exists is a property, not a method
      console.log('Login: Blocked login - user document does not exist for UID:', actualUid, email);
      return res.status(403).json({ 
        success: false, 
        error: 'Your account has been deleted by the admin.' 
      });
    }
    const latestUserData = userDocSnap.data();
    if (latestUserData.status === 'disabled') {
      console.log('Login: Blocked login - user is disabled for UID:', actualUid, email);
      return res.status(403).json({ 
        success: false, 
        error: 'Your account has been disabled by the admin.' 
      });
    }

    // Determine redirect path based on role
    const role = userData.role?.toLowerCase();
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

    // Generate JWT token for client-side authentication
    const token = generateToken({
      id: userDocId,
      email: userData.email,
      role: userData.role,
    });

    // Return success response with user data and JWT token
    res.json({
      success: true,
      token, // JWT token for API authentication
      user: {
        id: userDocId,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        empId: userData.empId,
        clientId: userData.clientId,
        project: userData.project || null,
        email: userData.email
      },
      redirectPath
    });

    } catch (err) {
    console.error("Login error:", err);
    console.error("Error stack:", err.stack);
    
    // Check for specific Firebase Admin errors
    if (err.message?.includes('credential') || err.message?.includes('permission denied')) {
      return res.status(500).json({ 
        success: false, 
        error: 'Firebase Admin SDK configuration error. Please set up service account credentials.' 
      });
    }
    
    if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }
    
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

    // First check if the email exists in Firebase Auth
    let signInMethods = [];
    let userRecord = null;
    try {
      userRecord = await auth.getUserByEmail(email);
      signInMethods = userRecord.providerData.map(p => p.providerId);
    } catch (error) {
      // User doesn't exist in Auth
      signInMethods = [];
    }

    if (signInMethods.length === 0) {
      // If not in Auth, check Firestore
      const usersQuery = db.collection('users').where('email', '==', email);
      const userSnapshot = await usersQuery.get();

      if (userSnapshot.empty) {
        return res.status(404).json({ 
          success: false, 
          error: 'No account found with this email address' 
        });
      }

      // If user exists in Firestore but not in Auth, we need to create their Auth account first
      const userData = userSnapshot.docs[0].data();
      const userDocRef = userSnapshot.docs[0].ref;

      // Generate a temporary password if one doesn't exist
      const tempPassword = userData.password || Math.random().toString(36).slice(-8);

      try {
        // Create the Firebase Auth account using the temporary password
        await auth.createUser({
          email: email,
          password: tempPassword,
          emailVerified: false,
        });

        // Update the user's status in Firestore
        await userDocRef.update({
          status: 'active',
          password: tempPassword // Keep the password temporarily
        });

        // Now send the password reset email
        try {
          const resetLink = await auth.generatePasswordResetLink(email, {
            url: process.env.FRONTEND_URL || 'http://localhost:5173/',
            handleCodeInApp: true
          });
          
          // In production, you would send this link via email service
          // For now, we'll return it (or integrate with your email service)
          return res.json({
            success: true,
            message: 'Password reset link has been sent to your email. Please check your inbox.',
            resetLink // Remove this in production, only for testing
          });
        } catch (resetError) {
          throw resetError;
        }
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          // If the account was created in the meantime, try sending reset email
          try {
            const resetLink = await auth.generatePasswordResetLink(email, {
              url: process.env.FRONTEND_URL || 'http://localhost:5173/',
              handleCodeInApp: true
            });
            
            return res.json({
              success: true,
              message: 'Password reset link has been sent to your email. Please check your inbox.',
              resetLink // Remove this in production
            });
          } catch (resetError) {
            throw resetError;
          }
        }
        throw authError;
      }
    }

    // If we get here, the email exists in Auth, so we can send the reset email
    try {
      const resetLink = await auth.generatePasswordResetLink(email, {
        url: process.env.FRONTEND_URL || 'http://localhost:5173/',
        handleCodeInApp: true
      });
      
      return res.json({
        success: true,
        message: 'Password reset link has been sent to your email. Please check your inbox.',
        resetLink // Remove this in production
      });
    } catch (resetError) {
      throw resetError;
    }

  } catch (err) {
    console.error("Forgot password error:", err);
    let errorMessage = `Failed to send reset link: ${err.message}`;
    
    switch (err.code) {
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address format';
        break;
      case 'auth/user-not-found':
        errorMessage = 'No account found with this email address';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many attempts. Please try again later';
        break;
      case 'auth/network-request-failed':
        errorMessage = 'Network error. Please check your internet connection';
        break;
      case 'auth/email-already-in-use':
        errorMessage = 'Account already exists. Please try logging in.';
        break;
    }
    
    return res.status(500).json({ 
      success: false, 
      error: errorMessage 
    });
  }
});

// GET /auth/verify - Verify token and get user info
router.get('/verify', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user data from Firestore
    const userDocRef = db.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();
    
    if (!userDocSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const userData = userDocSnap.data();
    
    // Check if user is disabled
    if (userData.status === 'disabled') {
      return res.status(403).json({
        success: false,
        error: 'Your account has been disabled by the admin.'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: userId,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        empId: userData.empId,
        clientId: userData.clientId,
        project: userData.project || null,
        email: userData.email
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
    
    const userDocRef = db.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();
    
    if (!userDocSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const userData = userDocSnap.data();
    
    res.json({
      success: true,
      user: {
        id: userId,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        empId: userData.empId,
        clientId: userData.clientId,
        project: userData.project || null,
        email: userData.email,
        status: userData.status
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

