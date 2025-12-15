import express from 'express';
import cors from 'cors';
import ical from 'node-ical';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// En enkel databas för att spara vem som gör vad

// Hjälpfunktion för att läsa/skriva databas
// DB_FILE and LOCAL_EVENTS_FILE defined centrally above

// Dina kalender-källor (Dessa ska vi fylla på)
const CALENDARS = [
    {
        id: 'svante_personal',
        name: 'Svante (Privat)',
        url: 'https://calendar.google.com/calendar/ical/svante.ortendahl%40gmail.com/private-96d4e54f3b8348303cec1fbc1ab90ccb/basic.ics'
    },
    {
        id: 'sarah_personal',
        name: 'Sarah (Privat)',
        url: 'https://calendar.google.com/calendar/ical/sarah.ortendahl%40gmail.com/private-884acb7a4a2e50c22116cacd9a43eaa1/basic.ics'
    },
    {
        id: 'arsenal_fc',
        name: 'Arsenal FC',
        url: 'https://ics.fixtur.es/v2/arsenal.ics'
    },
    {
        id: 'ois_fotboll',
        name: 'Örgryte IS',
        url: 'https://calendar.google.com/calendar/ical/nahppp38tiqn7nbsahk6l0qncno1rahs%40import.calendar.google.com/public/basic.ics'
    }
];

// ============ ROBUST KALENDER-CACHE ============
// 1. Disk persistence - survives restarts
// 2. 1-hour cache duration
// 3. Background scheduled refresh
// 4. Graceful error handling

// Datakatalog
const DATA_DIR = process.env.DATA_DIR || __dirname;

// Se till att katalogen finns (om den inte är root)
if (process.env.DATA_DIR && !fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`[Init] Created data directory: ${DATA_DIR}`);
    } catch (e) {
        console.error(`[Init] Failed to create data directory: ${e.message}`);
    }
}

// === SEEDING LOGIC ===
// Om datafiler saknas i DATA_DIR, kopiera från server/initial_data (om de finns där)
// Detta säkerställer att vi inte startar med tom databas vid första deploy
const INITIAL_DATA_DIR = path.join(__dirname, 'initial_data');
const FILES_TO_SEED = ['tasks.json', 'db.json', 'local_events.json'];

if (fs.existsSync(INITIAL_DATA_DIR)) {
    FILES_TO_SEED.forEach(file => {
        const sourcePath = path.join(INITIAL_DATA_DIR, file);
        const destPath = path.join(DATA_DIR, file);

        if (fs.existsSync(sourcePath) && !fs.existsSync(destPath)) {
            try {
                fs.copyFileSync(sourcePath, destPath);
                console.log(`[Init] Seeded ${file} from initial_data`);
            } catch (e) {
                console.error(`[Init] Failed to seed ${file}: ${e.message}`);
            }
        }
    });
}
// =====================

// Datafiler
const DB_FILE = path.join(DATA_DIR, 'db.json');
const LOCAL_EVENTS_FILE = path.join(DATA_DIR, 'local_events.json');
const CACHE_FILE = path.join(DATA_DIR, 'calendar_cache.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
let cachedCalendarEvents = [];
let cacheTimestamp = 0;
let isFetching = false;
let lastFetchError = null;

// Helper delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Load cache from disk on startup
function loadCacheFromDisk() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            cachedCalendarEvents = data.events || [];
            cacheTimestamp = data.timestamp || 0;
            console.log(`[Cache] Loaded ${cachedCalendarEvents.length} events from disk (age: ${Math.round((Date.now() - cacheTimestamp) / 1000 / 60)} min)`);
            return true;
        }
    } catch (e) {
        console.error('[Cache] Failed to load from disk:', e.message);
    }
    return false;
}

// Save cache to disk
function saveCacheToDisk() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            events: cachedCalendarEvents,
            timestamp: cacheTimestamp,
            savedAt: new Date().toISOString()
        }, null, 2));
        console.log(`[Cache] Saved ${cachedCalendarEvents.length} events to disk`);
    } catch (e) {
        console.error('[Cache] Failed to save to disk:', e.message);
    }
}

// Fetch calendars (internal function)
async function fetchCalendarsFromGoogle() {
    if (isFetching) {
        console.log('[Cache] Already fetching, skipping...');
        return false;
    }

    isFetching = true;
    console.log('[Cache] Fetching fresh calendar data from Google...');
    const freshEvents = [];
    let successCount = 0;
    let errorCount = 0;

    for (const cal of CALENDARS) {
        try {
            if (cal.url.includes('private-xxxxx')) {
                console.log(`Skippar kalender ${cal.name} (ingen giltig URL än)`);
                continue;
            }

            console.log(`Fetching calendar: ${cal.name}...`);

            const opts = {
                headers: {
                    'User-Agent': 'Mac OS X/10.15.7 (19H2) CalendarAgent/954'
                }
            };

            const data = await ical.async.fromURL(cal.url, opts);
            const eventsFound = Object.values(data).filter(e => e.type === 'VEVENT').length;
            console.log(`✓ Successfully fetched ${eventsFound} events from ${cal.name}`);
            successCount++;

            for (const k in data) {
                const ev = data[k];
                if (ev.type === 'VEVENT') {
                    freshEvents.push({
                        uid: ev.uid,
                        summary: ev.summary,
                        start: ev.start,
                        end: ev.end,
                        location: ev.location || 'Okänd plats',
                        description: ev.description || '',
                        source: cal.name,
                        todoList: [],
                        tags: [],
                        deleted: false
                    });
                }
            }
        } catch (e) {
            console.error(`✗ Kunde inte hämta kalender: ${cal.name}. Error: ${e.message}`);
            errorCount++;
            lastFetchError = { calendar: cal.name, error: e.message, time: new Date().toISOString() };
        }

        // 5 seconds between each calendar - be extra nice to Google
        await delay(5000);
    }

    isFetching = false;

    // Only update cache if we got ANY new events
    if (freshEvents.length > 0) {
        cachedCalendarEvents = freshEvents;
        cacheTimestamp = Date.now();
        saveCacheToDisk();
        console.log(`[Cache] Updated with ${freshEvents.length} events (${successCount} calendars OK, ${errorCount} failed)`);
        return true;
    } else if (cachedCalendarEvents.length > 0) {
        console.log(`[Cache] Fetch returned 0 events, keeping old cache (${cachedCalendarEvents.length} events)`);
        return false;
    }

    return false;
}

// Public function to get cached calendars
async function fetchAndCacheCalendars() {
    const now = Date.now();
    const cacheAge = now - cacheTimestamp;

    // Return cache if still valid
    if (cachedCalendarEvents.length > 0 && cacheAge < CACHE_DURATION_MS) {
        console.log(`[Cache] Returning cached data (age: ${Math.round(cacheAge / 1000 / 60)} min)`);
        return cachedCalendarEvents;
    }

    // Try to fetch fresh data
    const success = await fetchCalendarsFromGoogle();

    // If fetch failed but we have cached data, use it
    if (!success && cachedCalendarEvents.length > 0) {
        console.log('[Cache] Using stale cache data due to fetch failure');
        return cachedCalendarEvents;
    }

    return cachedCalendarEvents;
}

// Manual refresh endpoint will be added in API section

// Schedule background refresh every hour
function startScheduledRefresh() {
    console.log('[Scheduler] Starting hourly calendar refresh...');

    // Initial fetch after 30 seconds (give server time to start)
    setTimeout(async () => {
        console.log('[Scheduler] Running initial calendar fetch...');
        await fetchCalendarsFromGoogle();
    }, 30000);

    // Then refresh every hour
    setInterval(async () => {
        console.log('[Scheduler] Running scheduled calendar refresh...');
        await fetchCalendarsFromGoogle();
    }, CACHE_DURATION_MS);
}

// Load cache from disk on startup
loadCacheFromDisk();

// Helper för att läsa DB (Assignments)
const readDb = () => {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
};

const writeDb = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// Helper för att läsa lokala events
const readLocalEvents = () => {
    if (!fs.existsSync(LOCAL_EVENTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOCAL_EVENTS_FILE, 'utf8'));
};

const writeLocalEvents = (data) => {
    fs.writeFileSync(LOCAL_EVENTS_FILE, JSON.stringify(data, null, 2));
};

// Ladda tasks
let tasksData = [];
try {
    if (fs.existsSync(TASKS_FILE)) {
        tasksData = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    }
} catch (error) {
    console.error("Error loading tasks.json:", error);
    tasksData = [];
}

const saveTasks = () => {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksData, null, 2));
};

// --- API ---

app.get('/api/tasks', (req, res) => {
    res.json(tasksData);
});

app.post('/api/tasks', (req, res) => {
    const newTask = {
        id: Date.now().toString(),
        text: req.body.text,
        assignee: req.body.assignee || null,
        week: req.body.week || null,
        days: req.body.days || [], // Array of strings e.g. ['Mån', 'Tis']
        isRecurring: req.body.isRecurring || false,
        done: false,
        completedWeeks: [], // For recurring tasks: list of week numbers where task is done
        createdAt: new Date().toISOString()
    };
    tasksData.push(newTask);
    saveTasks();
    res.json(newTask);
});

app.put('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const taskIndex = tasksData.findIndex(t => t.id === id);
    if (taskIndex > -1) {
        tasksData[taskIndex] = { ...tasksData[taskIndex], ...req.body };
        saveTasks();
        res.json(tasksData[taskIndex]);
    } else {
        res.status(404).send('Task not found');
    }
});

// Wildcard route removed - handled by fallback at end of file

app.delete('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    tasksData = tasksData.filter(t => t.id !== id);
    saveTasks();
    res.json({ success: true });
});

// Manual calendar refresh endpoint
app.post('/api/refresh-calendars', async (req, res) => {
    console.log('[API] Manual calendar refresh triggered');
    try {
        const success = await fetchCalendarsFromGoogle();
        res.json({
            success,
            eventsCount: cachedCalendarEvents.length,
            lastError: lastFetchError,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Cache status endpoint
app.get('/api/cache-status', (req, res) => {
    const now = Date.now();
    const cacheAge = now - cacheTimestamp;
    res.json({
        eventsCount: cachedCalendarEvents.length,
        cacheAgeMinutes: Math.round(cacheAge / 1000 / 60),
        cacheDurationMinutes: CACHE_DURATION_MS / 1000 / 60,
        isStale: cacheAge >= CACHE_DURATION_MS,
        lastFetchError,
        isFetching
    });
});

app.get('/api/events', async (req, res) => {
    try {
        const assignments = readDb();
        const localEvents = readLocalEvents();
        const includeTrash = req.query.includeTrash === 'true';

        // Använd cachad data istället för att hämta varje gång
        const fetchedEvents = await fetchAndCacheCalendars();

        // Lägg till lokala events
        const formattedLocalEvents = localEvents.map(ev => ({
            ...ev,
            source: ev.source || 'Familjen (Eget)',
            start: new Date(ev.start), // Konvertera sträng till datum för jämförelse
            end: new Date(ev.end)
        }));

        // Merge logic: Local events override fetched events with same UID
        const eventMap = new Map();

        // First add fetched events
        fetchedEvents.forEach(ev => eventMap.set(ev.uid, ev));

        // Then add/overwrite with local events
        formattedLocalEvents.forEach(ev => eventMap.set(ev.uid, ev));

        let allEvents = Array.from(eventMap.values());

        // Filtrera bort gamla events (före datumet vi satte)
        const FILTER_DATE = new Date('2025-11-01');
        allEvents = allEvents.filter(event => new Date(event.start) >= FILTER_DATE);

        // Filter out deleted events unless requested
        if (!includeTrash) {
            allEvents = allEvents.filter(e => !e.deleted && !e.cancelled);
        }

        // Sortera: Närmast i tid först
        allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

        // Berika med assignments
        const enrichedEvents = allEvents.map(event => ({
            ...event,
            assignments: assignments[event.uid] || {} // tomma objekt om inga uppdrag finns
        }));

        res.json(enrichedEvents);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Kunde inte hämta händelser' });
    }
});

// Hämta papperskorgen
app.get('/api/trash', (req, res) => {
    try {
        const localEvents = readLocalEvents();
        // Returnera bara de som är deleted eller cancelled
        const trash = localEvents.filter(e => e.deleted || e.cancelled);
        res.json(trash);
    } catch (e) {
        res.status(500).json({ error: 'Kunde inte hämta papperskorgen' });
    }
});

app.post('/api/create-event', (req, res) => {
    const { summary, location, coords, start, end, description, createdBy, assignee, assignees, category } = req.body;

    if (!summary || !start) {
        return res.status(400).json({ error: 'Titel och starttid krävs' });
    }

    const events = readLocalEvents();
    const newEvent = {
        uid: uuidv4(),
        summary,
        location: location || '',
        coords: coords || null,
        start,
        end: end || start, // Om inget slutdatum, sätt samma som start
        description: description || '',
        assignee: assignee || 'Hela familjen', // Default to family
        assignees: assignees || [], // Array of assignees
        category: category || null, // Event category
        todoList: [],
        createdBy,
        createdAt: new Date().toISOString(),
        deleted: false,
        cancelled: false
    };

    events.push(newEvent);
    writeLocalEvents(events);

    res.json({ success: true, event: newEvent });
});

app.post('/api/update-event', (req, res) => {
    const { uid, summary, location, coords, start, end, description, todoList, cancelled, assignments, assignee, assignees, category } = req.body;
    let events = readLocalEvents();

    const existingIndex = events.findIndex(e => e.uid === uid);

    console.log('Update Event called for:', uid);
    console.log('Assignments received:', assignments);
    console.log('Assignees received:', assignees);
    console.log('Category received:', category);

    if (existingIndex >= 0) {
        // Update existing local event
        events[existingIndex] = {
            ...events[existingIndex],
            summary, location, coords, start, end, description, todoList,
            assignee: assignee || events[existingIndex].assignee,
            assignees: assignees || events[existingIndex].assignees || [],
            category: category || events[existingIndex].category,
            cancelled: cancelled !== undefined ? cancelled : events[existingIndex].cancelled
        };
    } else {
        // Probably editing an external event -> Create a local "shadow" copy to persist edits
        console.log(`Simulating Google Calendar Sync for event ${uid} ... (Requires API Credentials)`);

        const shadowEvent = {
            uid, // Keep original UID to override it in the get loop
            summary,
            location: location || '',
            coords: coords || null,
            start,
            end,
            description: description || '',
            todoList: todoList || [],
            assignee: assignee || '',
            assignees: assignees || [],
            category: category || null,
            source: 'Familjen (Redigerad)', // Marking it as locally modified
            createdAt: new Date().toISOString(), // effectively "claiming" it
            cancelled: cancelled || false,
            deleted: false
        };
        events.push(shadowEvent);
    }

    writeLocalEvents(events);

    // Save Assignments if provided
    if (assignments) {
        const db = readDb();
        db[uid] = { ...db[uid], ...assignments }; // Merge with existing or create new
        writeDb(db);
    }

    res.json({ success: true });
});

app.post('/api/delete-event', (req, res) => {
    const { uid, summary, start, end, source } = req.body; // Vi behöver info för att skapa "skuggan" om den inte finns
    let events = readLocalEvents();
    const existingIndex = events.findIndex(e => e.uid === uid);

    if (existingIndex >= 0) {
        // Markera som deleted
        events[existingIndex].deleted = true;
        events[existingIndex].deletedAt = new Date().toISOString();
    } else {
        // Skapa skugga av externt event som deleted
        const shadowEvent = {
            uid,
            summary: summary || 'Borttaget event',
            start,
            end,
            source: source || 'Externt',
            deleted: true,
            deletedAt: new Date().toISOString()
        };
        events.push(shadowEvent);
    }

    writeLocalEvents(events);
    res.json({ success: true });
});

app.post('/api/restore-event', (req, res) => {
    const { uid } = req.body;
    let events = readLocalEvents();
    const existingIndex = events.findIndex(e => e.uid === uid);

    if (existingIndex >= 0) {
        events[existingIndex].deleted = false;
        events[existingIndex].cancelled = false; // Reset cancel too?
        delete events[existingIndex].deletedAt;
        writeLocalEvents(events);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Event not found in local db' });
    }
});

app.post('/api/assign', (req, res) => {
    const { eventId, user, role } = req.body; // role: 'driver' | 'packer'
    const db = readDb();

    if (!db[eventId]) {
        db[eventId] = {};
    }

    // Uppdatera specifik roll
    db[eventId][role] = user;

    writeDb(db);

    res.json({ success: true, assignments: db[eventId] });
});

// --- Serve Frontend in Production ---
const distPath = path.resolve(__dirname, '..', 'dist');
console.log('Serving frontend from:', distPath);

// 1. Manual Asset Handler for debugging and explicit serving
app.get('/assets/:filename', (req, res) => {
    const filename = req.params.filename;
    // Security check
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(403).send('Forbidden');
    }

    const filepath = path.join(distPath, 'assets', filename);
    console.log(`[Asset Request] Looking for: ${filepath}`);

    if (fs.existsSync(filepath)) {
        // Explicitly set MIME types
        if (filename.endsWith('.js')) res.type('application/javascript');
        else if (filename.endsWith('.css')) res.type('text/css');
        else if (filename.endsWith('.svg')) res.type('image/svg+xml');

        console.log(`[Asset Request] Serving file: ${filename}`);
        res.sendFile(filepath);
    } else {
        console.error(`[Asset Request] File NOT FOUND at: ${filepath}`);
        res.status(404).send('Asset not found');
    }
});

// 2. Serve other static files (like favicon, manifest) from root dist
app.use(express.static(distPath));

// 3. Fallback handler
app.use((req, res) => {
    // Debug log to see if we accidentally fell through
    console.log(`Fallback triggered for: ${req.url}`);

    if (req.path.startsWith('/api') || req.path.includes('.')) {
        res.status(404).send('Not found');
        return;
    }

    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend not built. In dev mode? Check console.');
    }
});

// Duplicate fallback removed
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Family Ops Backend körs på http://0.0.0.0:${PORT}`);
    // Start the background calendar refresh scheduler
    startScheduledRefresh();
});
