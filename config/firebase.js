import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin SDK
// Note: In production, use a service account key file via GOOGLE_APPLICATION_CREDENTIALS
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || "ticketing-9965a",
};

// Initialize Admin SDK
if (!admin.apps.length) {
  try {
    // Try to initialize with service account if available
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('./') 
        ? join(__dirname, '..', process.env.GOOGLE_APPLICATION_CREDENTIALS.replace('./', ''))
        : process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: firebaseConfig.projectId,
      });
      console.log('✅ Firebase Admin initialized with service account');
    } else {
      // Try application default credentials
      try {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: firebaseConfig.projectId,
        });
        console.log('✅ Firebase Admin initialized with application default credentials');
      } catch (adcError) {
        // Fallback: Initialize with project ID only (will fail on operations)
        console.warn('⚠️  Firebase Admin initialized without credentials. Some operations may fail.');
        console.warn('⚠️  Please set up service account: See backend/get-service-account.md');
        admin.initializeApp({
          projectId: firebaseConfig.projectId,
        });
      }
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error.message);
    console.error('Please set up Firebase service account credentials. See backend/get-service-account.md');
    // Try minimal initialization (will likely fail on operations)
    try {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    } catch (fallbackError) {
      console.error('❌ Failed to initialize Firebase Admin:', fallbackError.message);
    }
  }
}

export const db = admin.firestore();
export const auth = admin.auth();

