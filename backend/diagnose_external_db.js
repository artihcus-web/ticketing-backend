import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function diagnose() {
    try {
        console.log('Connecting with URI:', MONGODB_URI.replace(/:([^@]+)@/, ':****@'));
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('Connected successfully to MongoDB');

        const admin = client.db().admin();
        const dbs = await admin.listDatabases();
        console.log('Available databases:', dbs.databases.map(d => d.name));

        const db = client.db('myapp');
        const collections = await db.listCollections().toArray();
        console.log('Collections in "myapp":', collections.map(c => c.name));

        if (collections.some(c => c.name === 'projects')) {
            const projects = await db.collection('projects').find({}).limit(1).toArray();
            console.log('Sample Project:', JSON.stringify(projects[0], null, 2));
        }

        if (collections.some(c => c.name === 'users')) {
            const users = await db.collection('users').find({}).limit(1).toArray();
            console.log('Sample User:', JSON.stringify(users[0], null, 2));
        }

        await client.close();
        process.exit(0);
    } catch (error) {
        console.error('Diagnosis failed:', error);
        process.exit(1);
    }
}

diagnose();
