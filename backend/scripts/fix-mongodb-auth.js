import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ticketing';

async function fixMongoDBAuth() {
  let client = null;
  
  try {
    console.log('🔍 Diagnosing MongoDB connection issue...\n');
    console.log('Connection string:', MONGODB_URI.replace(/:[^:@]+@/, ':****@')); // Hide password
    
    // Try to connect without authentication first
    const uriWithoutAuth = MONGODB_URI.replace(/\/\/[^@]+@/, '//').split('?')[0];
    console.log('\n📡 Attempting to connect without authentication...');
    console.log('URI:', uriWithoutAuth);
    
    try {
      client = new MongoClient(uriWithoutAuth);
      await client.connect();
      console.log('✅ Successfully connected without authentication!\n');
      
      const adminDb = client.db('admin');
      
      // Check if user exists
      console.log('🔍 Checking if ticketing_user exists...');
      try {
        const users = await adminDb.command({ usersInfo: 1 });
        const ticketingUser = users.users?.find(u => u.user === 'ticketing_user');
        
        if (ticketingUser) {
          console.log('⚠️  User ticketing_user already exists!');
          console.log('   This might mean the password is incorrect.');
          console.log('\n💡 Options:');
          console.log('   1. Update the password in your .env file');
          console.log('   2. Change the user password (see instructions below)');
          console.log('   3. Use a different user');
        } else {
          console.log('❌ User ticketing_user does NOT exist.\n');
          console.log('📝 Creating ticketing_user...\n');
          
          // Extract password from connection string
          const passwordMatch = MONGODB_URI.match(/\/\/([^:]+):([^@]+)@/);
          const username = passwordMatch ? passwordMatch[1] : 'ticketing_user';
          const password = passwordMatch ? decodeURIComponent(passwordMatch[2]) : 'Artihcus@123';
          
          console.log(`   Username: ${username}`);
          console.log(`   Password: ${password.replace(/./g, '*')}`);
          
          await adminDb.command({
            createUser: username,
            pwd: password,
            roles: [
              { role: 'readWrite', db: 'ticketing' },
              { role: 'dbAdmin', db: 'ticketing' }
            ]
          });
          
          console.log('✅ User created successfully!\n');
        }
      } catch (err) {
        if (err.codeName === 'DuplicateKey' || err.message.includes('already exists')) {
          console.log('⚠️  User already exists. Password might be incorrect.');
        } else {
          throw err;
        }
      }
      
      // Test the connection with authentication
      console.log('🧪 Testing connection with authentication...');
      await client.close();
      
      client = new MongoClient(MONGODB_URI);
      await client.connect();
      const db = client.db('ticketing');
      await db.admin().ping();
      
      console.log('✅ Authentication test passed!');
      console.log('✅ MongoDB connection is working correctly!\n');
      
    } catch (err) {
      if (err.codeName === 'AuthenticationFailed' || err.message.includes('Authentication failed')) {
        console.log('❌ Authentication failed with current credentials.\n');
        console.log('💡 Solutions:');
        console.log('   1. Create the user (if it doesn\'t exist)');
        console.log('   2. Update the password in your .env file');
        console.log('   3. Disable MongoDB authentication for development\n');
      } else {
        throw err;
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n📋 Troubleshooting steps:');
    console.error('   1. Make sure MongoDB is running');
    console.error('   2. Check if MongoDB requires authentication');
    console.error('   3. Verify your MONGODB_URI in .env file');
    console.error('   4. Try connecting manually: mongosh');
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Connection closed');
    }
  }
}

// Run the script
fixMongoDBAuth();

