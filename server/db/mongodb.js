import { MongoClient } from 'mongodb';

// Connection URI from environment
const uri = process.env.MONGODB_URI;

let client = null;
let db = null;
let isConnected = false;

// Connect to MongoDB
export async function connectToMongo() {
    if (isConnected && client) {
        return db;
    }

    if (!uri) {
        console.error('[MongoDB] No MONGODB_URI environment variable set');
        return null;
    }

    try {
        console.log('[MongoDB] Connecting to MongoDB Atlas...');
        client = new MongoClient(uri);
        await client.connect();
        db = client.db('familjecentral');
        isConnected = true;
        console.log('[MongoDB] Connected successfully to familjecentral database');
        return db;
    } catch (error) {
        console.error('[MongoDB] Connection error:', error.message);
        isConnected = false;
        return null;
    }
}

// Get database instance
export function getDb() {
    return db;
}

// Check if connected
export function isMongoConnected() {
    return isConnected && db !== null;
}

// Collections
export function getAssignmentsCollection() {
    return db?.collection('assignments');
}

export function getTasksCollection() {
    return db?.collection('tasks');
}

export function getLocalEventsCollection() {
    return db?.collection('localEvents');
}

export function getIgnoredEventsCollection() {
    return db?.collection('ignoredEvents');
}

// ============ ASSIGNMENTS (db.json replacement) ============

export async function getAllAssignments() {
    const collection = getAssignmentsCollection();
    if (!collection) return {};

    const docs = await collection.find({}).toArray();
    // Convert array to object keyed by eventId
    const result = {};
    docs.forEach(doc => {
        result[doc.eventId] = {
            driver: doc.driver,
            packer: doc.packer,
            deletedAt: doc.deletedAt
        };
    });
    return result;
}

export async function setAssignment(eventId, data) {
    const collection = getAssignmentsCollection();
    if (!collection) return null;

    const result = await collection.updateOne(
        { eventId },
        { $set: { eventId, ...data, updatedAt: new Date() } },
        { upsert: true }
    );
    return result;
}

export async function deleteAssignment(eventId) {
    const collection = getAssignmentsCollection();
    if (!collection) return null;

    return await collection.deleteOne({ eventId });
}

// ============ TASKS (tasks.json replacement) ============

export async function getAllTasks() {
    const collection = getTasksCollection();
    if (!collection) return [];

    return await collection.find({}).toArray();
}

export async function createTask(task) {
    const collection = getTasksCollection();
    if (!collection) return null;

    const result = await collection.insertOne({
        ...task,
        createdAt: new Date()
    });
    return { ...task, _id: result.insertedId };
}

export async function updateTask(taskId, updates) {
    const collection = getTasksCollection();
    if (!collection) return null;

    return await collection.updateOne(
        { id: taskId },
        { $set: { ...updates, updatedAt: new Date() } }
    );
}

export async function deleteTask(taskId) {
    const collection = getTasksCollection();
    if (!collection) return null;

    return await collection.deleteOne({ id: taskId });
}

// ============ LOCAL EVENTS (local_events.json replacement) ============

export async function getAllLocalEvents() {
    const collection = getLocalEventsCollection();
    if (!collection) return [];

    return await collection.find({}).toArray();
}

export async function createLocalEvent(event) {
    const collection = getLocalEventsCollection();
    if (!collection) return null;

    const result = await collection.insertOne({
        ...event,
        createdAt: new Date()
    });
    return { ...event, _id: result.insertedId };
}

export async function updateLocalEvent(uid, updates) {
    const collection = getLocalEventsCollection();
    if (!collection) return null;

    return await collection.updateOne(
        { uid },
        { $set: { ...updates, updatedAt: new Date() } }
    );
}

export async function deleteLocalEvent(uid) {
    const collection = getLocalEventsCollection();
    if (!collection) return null;

    return await collection.deleteOne({ uid });
}

// ============ TRASH / IGNORED EVENTS (papperskorg) ============

export async function getIgnoredEventIds() {
    const collection = getIgnoredEventsCollection();
    if (!collection) return [];

    const docs = await collection.find({}).toArray();
    return docs.map(doc => doc.eventId);
}

// Get full trash items with metadata for UI
export async function getTrashedEvents() {
    const collection = getIgnoredEventsCollection();
    if (!collection) return [];

    return await collection.find({}).sort({ trashedAt: -1 }).toArray();
}

// Add event to trash with metadata
export async function addToTrash(eventId, eventData = {}) {
    const collection = getIgnoredEventsCollection();
    if (!collection) return null;

    return await collection.updateOne(
        { eventId },
        {
            $set: {
                eventId,
                summary: eventData.summary || 'Okänd händelse',
                start: eventData.start,
                source: eventData.source,
                trashedAt: new Date()
            }
        },
        { upsert: true }
    );
}

export async function addIgnoredEvent(eventId) {
    const collection = getIgnoredEventsCollection();
    if (!collection) return null;

    return await collection.updateOne(
        { eventId },
        { $set: { eventId, ignoredAt: new Date() } },
        { upsert: true }
    );
}

// Restore from trash
export async function removeFromTrash(eventId) {
    const collection = getIgnoredEventsCollection();
    if (!collection) return null;

    return await collection.deleteOne({ eventId });
}

export async function removeIgnoredEvent(eventId) {
    return await removeFromTrash(eventId);
}

// ============ MIGRATION HELPER ============

export async function migrateFromJson(assignments, tasks, localEvents, ignoredEvents) {
    console.log('[MongoDB] Starting migration from JSON files...');

    // Migrate assignments
    if (assignments && Object.keys(assignments).length > 0) {
        const assignmentDocs = Object.entries(assignments).map(([eventId, data]) => ({
            eventId,
            ...data,
            migratedAt: new Date()
        }));
        const assignmentsCol = getAssignmentsCollection();
        if (assignmentsCol) {
            await assignmentsCol.deleteMany({});
            await assignmentsCol.insertMany(assignmentDocs);
            console.log(`[MongoDB] Migrated ${assignmentDocs.length} assignments`);
        }
    }

    // Migrate tasks
    if (tasks && tasks.length > 0) {
        const tasksCol = getTasksCollection();
        if (tasksCol) {
            await tasksCol.deleteMany({});
            await tasksCol.insertMany(tasks.map(t => ({ ...t, migratedAt: new Date() })));
            console.log(`[MongoDB] Migrated ${tasks.length} tasks`);
        }
    }

    // Migrate local events
    if (localEvents && localEvents.length > 0) {
        const localEventsCol = getLocalEventsCollection();
        if (localEventsCol) {
            await localEventsCol.deleteMany({});
            await localEventsCol.insertMany(localEvents.map(e => ({ ...e, migratedAt: new Date() })));
            console.log(`[MongoDB] Migrated ${localEvents.length} local events`);
        }
    }

    // Migrate ignored events
    if (ignoredEvents && ignoredEvents.length > 0) {
        const ignoredCol = getIgnoredEventsCollection();
        if (ignoredCol) {
            await ignoredCol.deleteMany({});
            await ignoredCol.insertMany(ignoredEvents.map(id => ({ eventId: id, migratedAt: new Date() })));
            console.log(`[MongoDB] Migrated ${ignoredEvents.length} ignored events`);
        }
    }

    console.log('[MongoDB] Migration complete!');
}

// Graceful shutdown
export async function closeMongo() {
    if (client) {
        await client.close();
        isConnected = false;
        console.log('[MongoDB] Connection closed');
    }
}
