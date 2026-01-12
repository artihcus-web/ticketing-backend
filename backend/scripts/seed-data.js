
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = 'mongodb://artihcus19:27017/ticketing';
const DB_NAME = 'ticketing';

async function seedData() {
    let client = null;

    try {
        console.log('🔌 Connecting to MongoDB...');
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db(DB_NAME);

        // 1. Create Counters Collection (Essential for ticket numbers)
        console.log('📝 Seeding Counters...');
        const countersCollection = db.collection('counters');
        await countersCollection.updateOne(
            { _id: 'tickets' },
            { $setOnInsert: { seq: 0 } },
            { upsert: true }
        );
        console.log('✅ Counters seeded');

        // 2. Create Project
        console.log('📝 Seeding Projects...');
        const projectsCollection = db.collection('projects');
        const project = {
            name: 'Internal Operations',
            description: 'Default project for internal operations and support',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Check if project exists to avoid duplicates
        let projectId;
        const existingProject = await projectsCollection.findOne({ name: project.name });
        if (!existingProject) {
            const result = await projectsCollection.insertOne(project);
            projectId = result.insertedId;
            console.log('✅ Project created');
        } else {
            projectId = existingProject._id;
            console.log('ℹ️  Project already exists');
        }

        // 3. Create Ticket
        console.log('📝 Seeding Tickets...');
        const ticketsCollection = db.collection('tickets');

        // Get next ticket number
        const counterResult = await countersCollection.findOneAndUpdate(
            { _id: 'tickets' },
            { $inc: { seq: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        const ticketNumber = counterResult ? counterResult.seq : 1; // Correct handling of return object might vary by driver version, simplified here

        const ticket = {
            title: 'Welcome to Articket',
            description: 'This is an auto-generated welcome ticket. The system has been successfully restored.',
            status: 'Open',
            priority: 'High',
            type: 'Task',
            project: 'Internal Operations',
            projectId: projectId.toString(),
            ticketNumber: ticketNumber, // Keep consistent with counter
            created: new Date(),
            updated: new Date(),
            createdBy: 'System Admin',
            email: 'admin@gmail.com'
        };

        // Ensure at least one ticket exists
        const ticketCount = await ticketsCollection.countDocuments();
        if (ticketCount === 0) {
            await ticketsCollection.insertOne(ticket);
            console.log('✅ Ticket created');
        } else {
            console.log('ℹ️  Tickets already exist, skipping seed');
        }

        console.log('\n🎉 Data seeding completed successfully!');

    } catch (error) {
        console.error('❌ Error seeding data:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

seedData();
