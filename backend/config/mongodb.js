import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB connection URL
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://articket_user:Artihcus%40123@127.0.0.1:27017/articket?authSource=articket&directConnection=true';
// Extract database name from URI if present, otherwise use DB_NAME env or default
const getDBNameFromURI = (uri) => {
  try {
    const url = new URL(uri);
    const path = url.pathname;
    if (path && path.length > 1) {
      return path.substring(1).split('?')[0]; // Remove leading / and query params
    }
  } catch (e) {
    // If URI parsing fails, fall back to env/default
  }
  return process.env.DB_NAME || 'ticketing';
};
const DB_NAME = getDBNameFromURI(MONGODB_URI);

let client = null;
let db = null;

/**
 * Connect to MongoDB
 */
export const connectDB = async () => {
  try {
    if (client && db) {
      return { client, db };
    }

    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);

    console.log('✅ MongoDB connected successfully');

    // Create indexes for better performance
    await createIndexes(db);

    return { client, db };
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
};

/**
 * Get database instance
 */
export const getDB = async () => {
  if (!db) {
    await connectDB();
  }
  return db;
};

/**
 * Create indexes for collections
 */
const createIndexes = async (database) => {
  try {
    // Users collection indexes
    await database.collection('users').createIndex({ email: 1 }, { unique: true });
    await database.collection('users').createIndex({ role: 1 });
    await database.collection('users').createIndex({ project: 1 });

    // Tickets collection indexes
    await database.collection('tickets').createIndex({ ticketNumber: 1 }, { unique: true });
    await database.collection('tickets').createIndex({ email: 1 });
    await database.collection('tickets').createIndex({ projectId: 1 });
    await database.collection('tickets').createIndex({ project: 1 });
    await database.collection('tickets').createIndex({ status: 1 });
    await database.collection('tickets').createIndex({ 'assignedTo.email': 1 });
    await database.collection('tickets').createIndex({ created: -1 });

    // Projects collection indexes
    await database.collection('projects').createIndex({ name: 1 }, { unique: true });

    // Counters collection indexes


    console.log('✅ MongoDB indexes created');
  } catch (error) {
    // Index creation errors are not critical, just log them
    console.warn('⚠️  Some indexes may already exist:', error.message);
  }
};

/**
 * Close MongoDB connection
 */
export const closeDB = async () => {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('✅ MongoDB connection closed');
  }
};

// Initialize connection on module load
connectDB().catch(console.error);

export default { connectDB, getDB, closeDB };

