import { getDB } from './backend/config/mongodb.js';
import dotenv from 'dotenv';
dotenv.config();

async function debug() {
    try {
        const db = await getDB();
        const ticketsCollection = db.collection('tickets');
        const tickets = await ticketsCollection.find({}).limit(5).toArray();
        console.log('Sample Tickets:');
        console.log(JSON.stringify(tickets, null, 2));

        const projectsCollection = db.collection('projects');
        const projects = await projectsCollection.find({}).toArray();
        console.log('\nProjects:');
        console.log(JSON.stringify(projects, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
