import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ticketing';
const DB_NAME = 'ticketing';

// Admin user details
const adminUser = {
  email: 'admin@gmail.com',
  password: 'Admin@12',
  role: 'admin',
  firstName: 'Admin',
  lastName: 'User',
  status: 'active',
  createdAt: new Date(),
  userType: 'admin'
};

async function createAdminUser() {
  let client = null;
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    const usersCollection = db.collection('users');
    
    // Check if admin user already exists
    const existingUser = await usersCollection.findOne({ 
      email: adminUser.email.toLowerCase() 
    });
    
    if (existingUser) {
      console.log('⚠️  Admin user already exists!');
      console.log('   Updating password...');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(adminUser.password, 10);
      
      // Update existing user
      await usersCollection.updateOne(
        { email: adminUser.email.toLowerCase() },
        {
          $set: {
            password: hashedPassword,
            role: 'admin',
            status: 'active',
            firstName: adminUser.firstName,
            lastName: adminUser.lastName,
            userType: 'admin',
            updatedAt: new Date()
          }
        }
      );
      
      console.log('✅ Admin user password updated successfully!');
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Password: ${adminUser.password}`);
      console.log(`   Role: ${adminUser.role}`);
    } else {
      console.log('📝 Creating new admin user...');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(adminUser.password, 10);
      
      // Create new user
      const newUser = {
        email: adminUser.email.toLowerCase(),
        password: hashedPassword,
        role: adminUser.role,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        status: adminUser.status,
        userType: adminUser.userType,
        createdAt: adminUser.createdAt
      };
      
      const result = await usersCollection.insertOne(newUser);
      
      console.log('✅ Admin user created successfully!');
      console.log(`   User ID: ${result.insertedId}`);
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Password: ${adminUser.password}`);
      console.log(`   Role: ${adminUser.role}`);
    }
    
    console.log('\n🎉 Done! You can now login with:');
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Password: ${adminUser.password}`);
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 MongoDB connection closed');
    }
  }
}

// Run the script
createAdminUser();

