import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

async function testConnection() {
  const testURIs = [
    // With admin user
    'mongodb://admin:Artihcus%40123@localhost:27017/ticketing?authSource=admin',
    // Without authentication
    'mongodb://localhost:27017/ticketing',
    // With ticketing_user
    'mongodb://ticketing_user:Artihcus%40123@localhost:27017/ticketing?authSource=admin',
  ];

  console.log('🔍 Testing MongoDB connections...\n');
  console.log('Database name: ticketing\n');

  for (const uri of testURIs) {
    let client = null;
    try {
      console.log(`Testing: ${uri.replace(/:[^:@]+@/, ':****@')}`);
      client = new MongoClient(uri);
      await client.connect();
      
      const db = client.db('ticketing');
      await db.admin().ping();
      
      // Try to list collections
      const collections = await db.listCollections().toArray();
      console.log(`✅ SUCCESS! Connection works.`);
      console.log(`   Collections found: ${collections.map(c => c.name).join(', ') || 'none'}`);
      console.log(`\n📋 Use this URI in your .env file:\n`);
      console.log(`MONGODB_URI=${uri}\n`);
      
      await client.close();
      return uri;
    } catch (error) {
      console.log(`❌ Failed: ${error.message}\n`);
      if (client) {
        await client.close().catch(() => {});
      }
    }
  }

  console.log('\n❌ None of the connection strings worked.');
  console.log('💡 You may need to:');
  console.log('   1. Create the MongoDB user');
  console.log('   2. Disable MongoDB authentication');
  console.log('   3. Check if MongoDB is running');
}

testConnection().catch(console.error);

