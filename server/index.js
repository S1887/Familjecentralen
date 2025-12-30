import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import ical from 'node-ical';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    connectToMongo,
    isMongoConnected,
    getAllAssignments,
    setAssignment,
    getAllTasks,
    createTask,
    updateTask,
    deleteTask,
    getAllLocalEvents,
    createLocalEvent,
    updateLocalEvent,
    deleteLocalEvent,
    getIgnoredEventIds,
    addIgnoredEvent,
    migrateFromJson
} from './db/mongodb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Optional HTTP Basic Auth for Render deployment
// Set AUTH_USER and AUTH_PASS environment variables to enable
if (process.env.AUTH_USER && process.env.AUTH_PASS) {
    console.log('[Auth] HTTP Basic Auth enabled');
    app.use((req, res, next) => {
        // Skip auth for health check endpoints
        if (req.path === '/health' || req.path === '/api/health') {
            return next();
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Familjecentralen"');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(401).end();
        }

        const [scheme, credentials] = authHeader.split(' ');
        if (scheme !== 'Basic' || !credentials) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Familjecentralen"');
            return res.status(401).send('Ogiltig autentisering');
        }

        const decoded = Buffer.from(credentials, 'base64').toString();
        const [user, pass] = decoded.split(':');

        if (user === process.env.AUTH_USER && pass === process.env.AUTH_PASS) {
            next();
        } else {
            res.setHeader('WWW-Authenticate', 'Basic realm="Familjecentralen"');
            return res.status(401).send('Fel användarnamn eller lösenord');
        }
    });
} else {
    console.log('[Auth] No AUTH_USER/AUTH_PASS set - running without HTTP auth');
}

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Serve hero image from HA config folder (local, private)
// The image is expected at /config/hero-custom.jpg on the Pi
app.get('/api/hero-image', (req, res) => {
    const possiblePaths = [
        '/config/hero-custom.jpg',           // HA Add-on mapped config folder
        '/config/hero-custom.png',           // PNG variant
        path.join(__dirname, '..', 'public', 'hero-custom.jpg'), // Fallback: public folder
        path.join(__dirname, '..', 'src', 'assets', 'hero-custom.jpg') // Dev fallback
    ];

    for (const imagePath of possiblePaths) {
        if (fs.existsSync(imagePath)) {
            console.log(`[Hero] Serving image from: ${imagePath}`);
            return res.sendFile(imagePath);
        }
    }

    console.log('[Hero] No hero image found');
    res.status(404).send('Hero image not found. Place hero-custom.jpg in /config/');
});

// En enkel databas för att spara vem som gör vad

// Hjälpfunktion för att läsa/skriva databas
// DB_FILE and LOCAL_EVENTS_FILE defined centrally above

// Dina kalender-källor (Dessa ska vi fylla på)
const CALENDARS = [
    {
        id: 'svante_personal',
        name: 'Svante',
        url: 'https://calendar.google.com/calendar/ical/svante.ortendahl%40gmail.com/private-96d4e54f3b8348303cec1fbc1ab90ccb/basic.ics'
    },
    {
        id: 'sarah_personal',
        name: 'Sarah',
        url: 'https://calendar.google.com/calendar/ical/sarah.ortendahl%40gmail.com/private-884acb7a4a2e50c22116cacd9a43eaa1/basic.ics'
    },
    {
        id: 'family_group',
        name: 'Örtendahls familjekalender',
        url: 'https://calendar.google.com/calendar/ical/family17438490542731545369%40group.calendar.google.com/private-a8ef35f1df9c3adeab2b260aa704f722/basic.ics'
    },
    // Subscription calendars - marked as inbox only, will not be primary sources
    {
        id: 'arsenal_fc',
        name: 'Arsenal FC',
        url: 'https://ics.fixtur.es/v2/arsenal.ics',
        inboxOnly: true
    },
    {
        id: 'ois_fotboll',
        name: 'Örgryte IS',
        url: 'https://calendar.google.com/calendar/ical/nahppp38tiqn7nbsahk6l0qncno1rahs%40import.calendar.google.com/public/basic.ics',
        inboxOnly: true
    },
    {
        id: 'rada_bk_p2015',
        name: 'Råda BK P2015',
        url: 'https://cal.laget.se/RadaBK-P2015.ics',
        inboxOnly: true
    },
    {
        id: 'hkl_p11_p10',
        name: 'HK Lidköping P11/P10',
        url: 'https://cal.laget.se/HKL-P11-P10.ics',
        inboxOnly: true
    },
    {
        id: 'hkl_handbollsskola',
        name: 'HK Lidköping Handbollsskola',
        url: 'https://cal.laget.se/HKLidkoping-Handbollsskola.ics',
        inboxOnly: true
    },
    {
        id: 'rada_bk_f7',
        name: 'Råda BK F7',
        url: 'https://cal.laget.se/RadaBK-F7.ics',
        inboxOnly: true
    },
    {
        id: 'villa_lidkoping_algot',
        name: 'Villa Lidköping (Algot)',
        url: 'https://portalweb.sportadmin.se/webcal?id=d9a0805a-8cb5-4c5c-8eb9-679ecb6c70c0',
        inboxOnly: true
    },
    {
        id: 'vklass_skola',
        name: 'Vklass (Skola)',
        url: 'https://cal.vklass.se/d0cc0c1d-b064-40b8-a82c-0b2c90ba41c4.ics?custodian=true',
        inboxOnly: true
    },
    {
        id: 'vklass_skola_tuva',
        name: 'Vklass (Skola Tuva)',
        url: 'https://cal.vklass.se/5bfb5374-1d00-4dc0-b688-4dc5a60765a9.ics?custodian=true',
        inboxOnly: true
    }
];

// ============ ROBUST KALENDER-CACHE ============
// 1. Disk persistence - survives restarts
// 2. 1-hour cache duration
// 3. Background scheduled refresh
// 4. Graceful error handling

// Datakatalog
// HA-Aware Configuration
const HA_OPTIONS_FILE = '/data/options.json';
const HA_DATA_DIR = '/data';

// Determine DATA_DIR
let dataPath = process.env.DATA_DIR || __dirname;

// If we are in HA (indicated by /data existence), use it for persistence
if (fs.existsSync(HA_DATA_DIR)) {
    console.log('[Init] Detected HA /data directory, using for persistence');
    dataPath = HA_DATA_DIR;
}

const DATA_DIR = dataPath;

// Load Options from HA (Environment Variables override these if set, but in HA env vars are hard)
if (fs.existsSync(HA_OPTIONS_FILE)) {
    try {
        const options = JSON.parse(fs.readFileSync(HA_OPTIONS_FILE, 'utf8'));
        if (options.gemini_api_key) {
            process.env.GEMINI_API_KEY = options.gemini_api_key;
            console.log('[Init] Loaded Gemini API Key from HA options');
        }
    } catch (e) { console.error('[Init] Failed to load HA options:', e.message); }
}

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
const FILES_TO_SEED = ['tasks.json', 'db.json', 'local_events.json', 'ignored_events.json'];

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
const IGNORED_EVENTS_FILE = path.join(DATA_DIR, 'ignored_events.json');
const CACHE_FILE = path.join(DATA_DIR, 'calendar_cache.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const MEALS_FILE = path.join(DATA_DIR, 'meals.json');

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes (faster sync, still safe for Google API)
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
                    let summary = ev.summary;
                    let isInbox = !!cal.inboxOnly;
                    let assignees = [];

                    // Sport Context Injection - REMOVED per user request
                    // We only want exact source titles + specific fixes (like Handboll->Bandy below)

                    // Global fix for Villa Lidköping: Replace Handboll -> Bandy (often labeled wrong in source)
                    // Global fix for Villa Lidköping: Replace Handboll -> Bandy (often labeled wrong in source)
                    if (cal.id === 'villa_lidkoping_algot') {
                        summary = summary.replace(/Handboll/gi, 'Bandy');
                    }

                    // AUTO-TAGGING PARENTS
                    if (cal.id === 'svante_personal') {
                        assignees = ['Svante'];
                    }
                    if (cal.id === 'sarah_personal') {
                        assignees = ['Sarah'];
                    }

                    // AUTO-RULES
                    let category = null; // Initialize category here
                    // 1. HK Lidköping (Algot): "Träning" goes directly to calendar
                    if (cal.id === 'hkl_p11_p10' && summary.toLowerCase().includes('träning')) {
                        console.log(`[Auto-Rule] Bypassing inbox for Algot (Handboll): ${summary}`);
                        isInbox = false;
                        summary = `Algot: ${summary}`;
                        assignees = ['Algot'];
                        category = 'Handboll';
                    }
                    // 2. HK Lidköping (Tuva): "Träning" goes directly to calendar
                    if (cal.id === 'hkl_handbollsskola' && summary.toLowerCase().includes('träning')) {
                        console.log(`[Auto-Rule] Bypassing inbox for Tuva: ${summary}`);
                        isInbox = false;
                        summary = `Tuva: ${summary}`;
                        assignees = ['Tuva'];
                        category = 'Handboll';
                    }
                    // 3. Råda BK F7 (Tuva): "Träning" goes directly to calendar
                    if (cal.id === 'rada_bk_f7' && summary.toLowerCase().includes('träning')) {
                        console.log(`[Auto-Rule] Bypassing inbox for Tuva (Fotboll): ${summary}`);
                        isInbox = false;
                        summary = `Tuva: ${summary}`;
                        assignees = ['Tuva'];
                        category = 'Fotboll';
                    }
                    // 4. Råda BK P2015 (Algot): "Träning" goes directly to calendar
                    if (cal.id === 'rada_bk_p2015' && summary.toLowerCase().includes('träning')) {
                        console.log(`[Auto-Rule] Bypassing inbox for Algot (Fotboll): ${summary}`);
                        isInbox = false;
                        summary = `Algot: ${summary}`;
                        assignees = ['Algot'];
                        category = 'Fotboll';
                    }
                    // 5. Villa Lidköping (Algot): "Träning" goes directly to calendar
                    if (cal.id === 'villa_lidkoping_algot' && summary.toLowerCase().includes('träning')) {
                        console.log(`[Auto-Rule] Bypassing inbox for Algot (Bandy): ${summary}`);
                        isInbox = false;
                        summary = `Algot: ${summary}`;
                        assignees = ['Algot'];
                        category = 'Bandy';
                    }

                    // 6. Arsenal (Svante): ALL matches go directly to calendar
                    if (cal.id === 'arsenal_fc') {
                        console.log(`[Auto-Rule] Auto-importing Arsenal match for Svante: ${summary}`);
                        isInbox = false;
                        summary = `Svante: ${summary}`;
                        assignees = ['Svante'];
                        category = 'Sport';
                    }

                    // 7. Örgryte IS (ÖIS) (Svante): ALL matches go directly to calendar
                    if (cal.id === 'ois_fotboll') {
                        console.log(`[Auto-Rule] Auto-importing ÖIS match for Svante: ${summary}`);
                        isInbox = false;
                        summary = `Svante: ${summary}`;
                        assignees = ['Svante'];
                        category = 'Sport';
                    }


                    // 6. Vklass (Skola): Smart Tagging for Lessons
                    // Tag events with child name based on code (sth15=Algot, sth18=Tuva)
                    // Codes can be in Summary OR Description
                    if (cal.id === 'vklass_skola' || cal.id === 'vklass_skola_tuva') {
                        let match = summary.match(/\((.*?)\)/);
                        let sourceField = 'summary';

                        if (!match && ev.description) {
                            match = ev.description.match(/\((.*?)\)/);
                            sourceField = 'description';
                        }

                        if (match) {
                            const content = match[1];
                            const isCode =
                                content.includes('__') ||
                                content.includes('/') ||
                                /^[a-z]+\d+$/i.test(content);

                            // Detect Student
                            let student = null;
                            if (content.toLowerCase().includes('sth15')) student = 'Algot';
                            else if (content.toLowerCase().includes('sth18')) student = 'Tuva';

                            if (isCode && student) {
                                // It IS a lesson
                                isInbox = false; // Don't show in inbox
                                category = 'Skola';
                                assignees = [student]; // Assign to child

                                // Only clean summary if the code was actually IN the summary
                                if (sourceField === 'summary') {
                                    summary = summary.replace(/\s*\(.*?\)/, '').trim();
                                }

                                // Extra properties for our app
                                ev.isLesson = true;
                                ev.scheduleOnly = true; // Flag to hide from main calendar
                                ev.student = student;
                            } else if (isCode) {
                                // Code found but no student? 
                                // Ideally we should hide it too if it looks like a lesson code to avoid spam
                                // But without student we can't show it in schedule.
                                // Let's hide it from main calendar anyway if it looks like a school code
                                if (content.includes('__')) {
                                    isInbox = false;
                                    ev.scheduleOnly = true;
                                }
                            }
                        }
                    }

                    // Determine correct event source
                    let eventSource = cal.name;

                    // Training events that bypass inbox should have family calendar as source
                    if (!isInbox && cal.inboxOnly) {
                        eventSource = 'Örtendahls familjekalender';
                    }

                    freshEvents.push({
                        uid: ev.uid,
                        summary: summary,
                        start: ev.start,
                        end: ev.end,
                        location: ev.location || 'Okänd plats',
                        description: ev.description || '',
                        source: eventSource,
                        originalSource: cal.name, // Preserve original source for UI display
                        inboxOnly: isInbox,
                        assignees: assignees,
                        category: category,
                        todoList: [],
                        tags: [],
                        deleted: false,
                        // Custom props
                        scheduleOnly: ev.scheduleOnly || false,
                        student: ev.student || null,
                        isLesson: ev.isLesson || false
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

// Helper för att läsa DB (Assignments) - Hybrid: MongoDB first, fallback to JSON
const readDb = async () => {
    if (isMongoConnected()) {
        return await getAllAssignments();
    }
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
};

const writeDb = async (eventId, data) => {
    if (isMongoConnected()) {
        await setAssignment(eventId, data);
    }
    // Always write to file as backup
    const allData = await readDb();
    allData[eventId] = data;
    fs.writeFileSync(DB_FILE, JSON.stringify(allData, null, 2));
};

// Helper för att läsa lokala events - Hybrid
const readLocalEvents = async () => {
    if (isMongoConnected()) {
        return await getAllLocalEvents();
    }
    if (!fs.existsSync(LOCAL_EVENTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOCAL_EVENTS_FILE, 'utf8'));
};

const writeLocalEvents = async (data) => {
    // data is the full events array here
    fs.writeFileSync(LOCAL_EVENTS_FILE, JSON.stringify(data, null, 2));
};

// Helper för att läsa ignorerade events - Hybrid
const readIgnoredEvents = async () => {
    if (isMongoConnected()) {
        return await getIgnoredEventIds();
    }
    if (!fs.existsSync(IGNORED_EVENTS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(IGNORED_EVENTS_FILE, 'utf8'));
    } catch (e) { return []; }
};

const writeIgnoredEvents = (data) => {
    fs.writeFileSync(IGNORED_EVENTS_FILE, JSON.stringify(data, null, 2));
};

// Ladda tasks - will be loaded from MongoDB after connection
let tasksData = [];

const loadTasksFromFile = () => {
    try {
        if (fs.existsSync(TASKS_FILE)) {
            tasksData = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
        }
    } catch (error) {
        console.error("Error loading tasks.json:", error);
        tasksData = [];
    }
};

// Load from file initially
loadTasksFromFile();

const saveTasks = () => {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksData, null, 2));
};

// --- AUTHENTICATION CONFIG ---
// Moved from client-side for security
const USERS = [
    { name: 'Svante', pin: '486512', role: 'parent' },
    { name: 'Sarah', pin: '060812', role: 'parent' },
    { name: 'Algot', pin: '502812', role: 'child' },
    { name: 'Tuva', pin: '502812', role: 'child' },
    { name: 'Leon', pin: '502812', role: 'child' },
];

// --- API ---

app.post('/api/login', (req, res) => {
    const { username, pin } = req.body;

    // Simple validation
    if (!username || !pin) {
        return res.status(400).json({ error: 'Missing credentials' });
    }

    // Check credentials
    const user = USERS.find(u => u.name === username);

    // Constant-time comparison not strictly necessary for this low-stakes app, 
    // but good practice. Here we just do direct comparison.
    if (user && user.pin === pin) {
        // Return user info WITHOUT the PIN
        res.json({
            name: user.name,
            role: user.role
        });
    } else {
        res.status(401).json({ error: 'Invalid PIN' });
    }
});

app.get('/api/tasks', async (req, res) => {
    try {
        let tasks;
        if (isMongoConnected()) {
            tasks = await getAllTasks();
        } else {
            tasks = tasksData;
        }

        // Filter out old completed non-recurring tasks
        // Get current ISO week in format "YYYY-Www"
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
        const currentWeek = `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;

        const filteredTasks = tasks.filter(task => {
            // Always show recurring tasks
            if (task.isRecurring) return true;

            // Always show tasks without a specific week
            if (!task.week) return true;

            // Show if task week is current or future
            if (task.week >= currentWeek) return true;

            // Hide old non-recurring tasks
            return false;
        });

        console.log(`[Tasks] Returning ${filteredTasks.length}/${tasks.length} tasks (filtered old completed)`);
        res.json(filteredTasks);
    } catch (error) {
        console.error('[Tasks] Error fetching tasks:', error);
        res.json(tasksData); // Fallback to in-memory
    }
});

app.post('/api/tasks', async (req, res) => {
    const newTask = {
        id: Date.now().toString(),
        text: req.body.text,
        assignee: req.body.assignee || null,
        week: req.body.week || null,
        days: req.body.days || [],
        isRecurring: req.body.isRecurring || false,
        done: false,
        completedWeeks: [],
        createdAt: new Date().toISOString()
    };

    try {
        if (isMongoConnected()) {
            await createTask(newTask);
        }
    } catch (error) {
        console.error('[Tasks] MongoDB error, falling back to file:', error);
    }

    // Always update in-memory and file as backup
    tasksData.push(newTask);
    saveTasks();
    res.json(newTask);
});

app.put('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const taskIndex = tasksData.findIndex(t => t.id === id);

    if (taskIndex > -1) {
        tasksData[taskIndex] = { ...tasksData[taskIndex], ...req.body };

        try {
            if (isMongoConnected()) {
                await updateTask(id, req.body);
            }
        } catch (error) {
            console.error('[Tasks] MongoDB error:', error);
        }

        saveTasks();
        res.json(tasksData[taskIndex]);
    } else {
        res.status(404).send('Task not found');
    }
});

// Wildcard route removed - handled by fallback at end of file

app.delete('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    tasksData = tasksData.filter(t => t.id !== id);

    try {
        if (isMongoConnected()) {
            await deleteTask(id);
        }
    } catch (error) {
        console.error('[Tasks] MongoDB error:', error);
    }

    saveTasks();
    res.json({ success: true });
});

// ============ MEALS API ============
// Helper functions for meals
const readMeals = () => {
    try {
        if (fs.existsSync(MEALS_FILE)) {
            return JSON.parse(fs.readFileSync(MEALS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Meals] Error reading meals:', e.message);
    }
    return {};
};

const writeMeals = (data) => {
    try {
        fs.writeFileSync(MEALS_FILE, JSON.stringify(data, null, 2));
        console.log('[Meals] Saved meals data');
    } catch (e) {
        console.error('[Meals] Error writing meals:', e.message);
    }
};

// Get meals for a specific week (format: 2025-W01)
app.get('/api/meals/:week', (req, res) => {
    const { week } = req.params;
    const allMeals = readMeals();
    const weekMeals = allMeals[week] || {};
    console.log(`[Meals] GET ${week}: ${Object.keys(weekMeals).length} days`);
    res.json(weekMeals);
});

// Save meals for a specific week
app.put('/api/meals/:week', (req, res) => {
    const { week } = req.params;
    const weekMeals = req.body;

    const allMeals = readMeals();
    allMeals[week] = weekMeals;
    writeMeals(allMeals);

    console.log(`[Meals] PUT ${week}: Saved ${Object.keys(weekMeals).length} days`);
    res.json({ success: true, week, days: Object.keys(weekMeals).length });
});

// Get all meals (for debugging/export)
app.get('/api/meals', (req, res) => {
    const allMeals = readMeals();
    res.json(allMeals);
});

// ============ AI MEAL SUGGESTIONS ============
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/api/meals/suggest', async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
        const { recentMeals = [], preferences = '', weekEvents = [], dates = [], customInstructions = '', targetDate = null } = req.body;

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Analyze busy days from calendar
        const busyDaysInfo = dates.map((date, i) => {
            const dayEvents = weekEvents.filter(e => e.date === date);
            const eventCount = dayEvents.length;
            const activities = dayEvents.map(e => e.summary).join(', ');
            const isBusy = eventCount >= 2;
            return { date, isBusy, eventCount, activities };
        });

        const busyDaysText = busyDaysInfo
            .filter(d => d.isBusy)
            .map(d => `${d.date}: ${d.eventCount} aktiviteter (${d.activities})`)
            .join('\n');

        let prompt = '';

        if (targetDate) {
            // SINGLE DAY PROMPT
            const dayInfo = busyDaysInfo.find(d => d.date === targetDate);
            const dayBusyText = dayInfo && dayInfo.isBusy ? `(UPPTAGEN DAG: ${dayInfo.activities})` : '';

            prompt = `Du är en svensk familjs matplanerare.
Föreslå EN middagsrätt för ${targetDate}.

KALENDERINFO: ${dayBusyText}
REGLER:
- Svara ENDAST med en JSON-array innehållande en sträng, t.ex. ["Köttbullar"].
- ${customInstructions ? `INSTRUKTION FRÅN ANVÄNDAREN: ${customInstructions}` : 'Ge ett passande förslag baserat på veckodag.'}
- Ta hänsyn till att det är en barnfamilj.

Svara ENDAST med JSON-array.`;
        } else {
            // FULL WEEK PROMPT
            prompt = `Du är en svensk familjs matplanerare för familjen Örtendahl i Lidköping. 
Föreslå ${dates.length} middagsrätter för en familj med 3 barn (8, 11, 14 år).

BUTIK: ICA Kvantum Hjertberg, Lidköping
Ta gärna hänsyn till typiska veckans erbjudanden på ICA (färs, kyckling, lax brukar ofta vara på rea).

FAMILJEKALENDER DENNA VECKA:
${busyDaysText || 'Ingen speciellt upptagen dag'}

REGLER:
- Svara ENDAST med en JSON-array med ${dates.length} rätter, inget annat
- Variera mellan kött, kyckling, fisk och vegetariskt
- På upptagna dagar (2+ aktiviteter): föreslå snabblagade rätter (under 30 min)
- Fredag = Mysigt (tacos, pizza, hamburgare ok)
- Lördag/Söndag = Lite finare/mer tid
- Undvik upprepning från senaste 2 veckorna
- Gärna säsongsanpassat (nu är det vinter)

${recentMeals.length > 0 ? `NYLIGEN ÄTIT (undvik):\n${recentMeals.slice(-10).join(', ')}` : ''}

${preferences ? `GENERALLA ÖNSKEMÅL: ${preferences}` : ''}
${customInstructions ? `\nVIKTIG INSTRUKTION DENNA VECKA:\n${customInstructions.toUpperCase()}` : ''}

Svara ENDAST med JSON-array, exempel:
["Köttbullar med potatismos", "Tacos", "Laxpasta med spenat", "Kycklinggryta", "Pannkakor", "Lasagne", "Pulled pork"]`;
        }

        console.log('[AI] Generating suggestions with prompt length:', prompt.length);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse JSON from response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const suggestions = JSON.parse(jsonMatch[0]);
            console.log('[AI] Generated meal suggestions:', suggestions);
            res.json({ suggestions, busyDays: busyDaysInfo.filter(d => d.isBusy) });
        } else {
            console.error('[AI] Could not parse response:', text);
            res.status(500).json({ error: 'Could not parse AI response', raw: text });
        }
    } catch (error) {
        console.error('[AI] Error generating suggestions:', error);
        res.status(500).json({ error: error.message });
    }
});

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
        const assignments = await readDb();
        const includeTrash = req.query.includeTrash === 'true';

        // Get events from Google Calendar cache
        const fetchedEvents = await fetchAndCacheCalendars();

        console.log(`[Debug] Events: Fetched=${fetchedEvents.length} from Google Calendar`);

        let allEvents = [...fetchedEvents];

        // Filtrera bort gamla events (före datumet vi satte)
        const FILTER_DATE = new Date('2025-11-01');
        allEvents = allEvents.filter(event => new Date(event.start) >= FILTER_DATE);

        // Filter out inboxOnly events from the MAIN feed
        // These should only appear in the inbox endpoint
        allEvents = allEvents.filter(e => {
            // If event is marked inboxOnly, hide it from main calendar
            if (e.inboxOnly) {
                return false;
            }
            return true;
        });

        // Filter out deleted events unless requested
        if (!includeTrash) {
            allEvents = allEvents.filter(e => !e.deleted);
        }

        // Filter out scheduleOnly events (they have their own endpoint)
        allEvents = allEvents.filter(e => !e.scheduleOnly);

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

// ============ RESET ENDPOINT ============
// Clears all local data (cache, local events, tasks, assignments)
// Visit /api/reset to trigger
app.get('/api/reset', (req, res) => {
    console.log('[Reset] Clearing all local data...');
    const filesToDelete = [DB_FILE, LOCAL_EVENTS_FILE, IGNORED_EVENTS_FILE, CACHE_FILE, TASKS_FILE];
    let deleted = [];
    let errors = [];

    filesToDelete.forEach(file => {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
                deleted.push(path.basename(file));
                console.log(`[Reset] Deleted: ${file}`);
            }
        } catch (e) {
            errors.push(`${path.basename(file)}: ${e.message}`);
            console.error(`[Reset] Failed to delete ${file}: ${e.message}`);
        }
    });

    // Clear in-memory cache
    cachedCalendarEvents = [];
    cacheTimestamp = null;

    res.json({
        success: true,
        message: 'Local data cleared. Refresh the page to reload from Google Calendar.',
        deleted,
        errors
    });
});

// ICS Feed Endpoint
app.get('/api/feed.ics', async (req, res) => {
    console.log(`[ICS] Feed requested by ${req.ip} - User-Agent: ${req.get('User-Agent')}`);
    try {
        // Ensure we have data (Cold Start on Render)
        if (cachedCalendarEvents.length === 0) {
            console.log('[ICS] Cache empty, fetching calendars before serving feed...');
            await fetchAndCacheCalendars();
        }

        const localEvents = readLocalEvents();

        const feedEvents = [];

        // Add Local Events
        localEvents.forEach(ev => {
            if (!ev.deleted) feedEvents.push(ev);
        });

        // Add Auto-Approved External Events (from cache)
        const inboxSourceIds = ['hkl_p11_p10', 'hkl_handbollsskola', 'rada_bk_p2015', 'rada_bk_f7', 'villa_lidkoping_algot'];

        cachedCalendarEvents.forEach(ev => {
            const originCal = CALENDARS.find(c => c.name === ev.source);
            if (originCal && originCal.inboxOnly) {
                if (!ev.inboxOnly) {
                    if (!feedEvents.find(fe => fe.uid === ev.uid)) {
                        feedEvents.push(ev);
                    }
                }
            }
        });

        // Generate ICS String
        let icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Familjecentralen//Calendar Export v2.0//SV',
            'CAL SCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:Örtendahls familjekalender (Export)',
            'X-WR-TIMEZONE:Europe/Stockholm',
        ];

        // Helper: Sanitize and escape ICS content
        const sanitizeICSText = (text) => {
            if (!text) return '';
            return text
                .replace(/<[^>]*>/g, '') // Strip HTML tags
                .replace(/[\\,;]/g, (m) => '\\' + m) // Escape special chars
                .replace(/\n/g, '\\n') // Escape newlines
                .trim();
        };

        // Helper: Fold lines to max 75 chars per RFC 5545
        const foldLine = (line) => {
            if (line.length <= 75) return line;
            const chunks = [];
            let start = 0;
            chunks.push(line.substring(0, 75));
            start = 75;
            while (start < line.length) {
                chunks.push(' ' + line.substring(start, start + 74)); // Space prefix for continuation
                start += 74;
            }
            return chunks.join('\r\n');
        };

        feedEvents.forEach(ev => {
            const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                if (dateStr.length === 10) {
                    return dateStr.replace(/-/g, '');
                }
                return new Date(dateStr).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            };

            icsContent.push('BEGIN:VEVENT');
            icsContent.push(`UID:${ev.uid}`);
            icsContent.push(`DTSTAMP:${now}`);

            const dtStart = formatDate(ev.start);
            if (dtStart.length === 8) {
                icsContent.push(`DTSTART;VALUE=DATE:${dtStart}`);
            } else {
                icsContent.push(`DTSTART:${dtStart}`);
            }

            const dtEnd = formatDate(ev.end);
            if (dtEnd.length === 8) {
                icsContent.push(`DTEND;VALUE=DATE:${dtEnd}`);
            } else {
                icsContent.push(`DTEND:${dtEnd}`);
            }

            const summary = sanitizeICSText(ev.summary);
            icsContent.push(foldLine(`SUMMARY:${summary}`));

            if (ev.location) {
                const location = sanitizeICSText(ev.location);
                icsContent.push(foldLine(`LOCATION:${location}`));
            }

            if (ev.description) {
                const description = sanitizeICSText(ev.description);
                icsContent.push(foldLine(`DESCRIPTION:${description}`));
            }

            icsContent.push('END:VEVENT');
        });

        icsContent.push('END:VCALENDAR');

        res.set('Content-Type', 'text/calendar; charset=utf-8');
        // Removed Content-Disposition to allow inline fetching/debugging
        res.send(icsContent.join('\r\n'));

    } catch (e) {
        console.error("Error generating ICS feed", e);
        res.status(500).send('Error generating feed');
    }
});

// Admin endpoint to clear all local events (use once to clean up old data)
app.post('/api/admin/clear-local-events', async (req, res) => {
    try {
        const backup = await readLocalEvents();
        console.log(`[Admin] Clearing ${backup.length} local events`);

        // Write empty array
        await writeLocalEvents([]);

        res.json({
            success: true,
            message: `Cleared ${backup.length} local events`,
            backup: backup.length
        });
    } catch (error) {
        console.error('Clear local events error:', error);
        res.status(500).json({ error: 'Kunde inte rensa lokala händelser' });
    }
});

app.get('/api/inbox', async (req, res) => {
    try {
        const localEvents = await readLocalEvents();
        const ignoredEvents = await readIgnoredEvents();

        // Fetch fresh/cached calendars
        const allFetchedEvents = await fetchAndCacheCalendars();

        // Filter out events that are NOT inboxOnly
        // We only want events that ARE marked as inboxOnly
        const inboxEventsCandidate = allFetchedEvents.filter(e => e.inboxOnly);

        // Now remove events that have already been imported (exist in localEvents by UID)
        // OR have been ignored
        const localUids = new Set(localEvents.map(e => e.uid));
        const ignoredUids = new Set(ignoredEvents);

        // Date Filter: Show future events AND events from the last 7 days
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago

        const finalInbox = inboxEventsCandidate.filter(e => {
            if (localUids.has(e.uid)) return false; // Already imported
            if (ignoredUids.has(e.uid)) return false; // Explicitly ignored

            // Check Date
            const eventStart = new Date(e.start);
            if (eventStart < cutoffDate) return false;

            return true;
        });

        res.json(finalInbox);
    } catch (error) {
        console.error("Inbox fetch error:", error);
        res.status(500).json({ error: 'Kunde inte hämta inkorgen' });
    }
});

app.post('/api/ignore-event', async (req, res) => {
    try {
        const { uid } = req.body;
        if (!uid) return res.status(400).json({ error: 'UID krävs' });

        const ignored = await readIgnoredEvents();
        if (!ignored.includes(uid)) {
            ignored.push(uid);

            // Save to MongoDB if connected
            if (isMongoConnected()) {
                await addIgnoredEvent(uid);
            }

            writeIgnoredEvents(ignored);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ignore event error:', error);
        res.status(500).json({ error: 'Kunde inte ignorera händelse' });
    }
});

app.get('/api/schedule', async (req, res) => {
    try {
        // Fetch fresh/cached calendars
        const allFetchedEvents = await fetchAndCacheCalendars();

        // Filter for scheduleOnly events
        const scheduleEvents = allFetchedEvents.filter(e => e.scheduleOnly && !e.deleted);

        res.json(scheduleEvents);
    } catch (error) {
        console.error("Schedule fetch error:", error);
        res.status(500).json({ error: 'Kunde inte hämta schema' });
    }
});

// Import event from inbox (mark as non-inbox-only by creating local override)
app.post('/api/import-from-inbox', async (req, res) => {
    const { uid } = req.body;

    if (!uid) {
        return res.status(400).json({ error: 'UID krävs' });
    }

    try {
        const localEvents = await readLocalEvents();

        // Check if already imported
        const exists = localEvents.find(e => e.uid === uid);
        if (exists) {
            return res.json({ success: true, message: 'Already imported' });
        }

        // Find the original event from cached calendars
        const cachedCalendars = await fetchAndCacheCalendars();
        const originalEvent = cachedCalendars.find(e => e.uid === uid);

        if (!originalEvent) {
            return res.status(404).json({ error: 'Event not found in cache' });
        }

        // Create a local copy with all data from the original
        // Keep the original source so it behaves exactly like training events (external source, locked fields)
        const importedEvent = {
            ...originalEvent, // Copy all fields from original (summary, start, end, location, source, etc.)
            inboxOnly: false, // Mark as NOT inbox-only (this makes it appear in main calendar)
            createdAt: new Date().toISOString(),
            deleted: false,
            cancelled: false
        };

        // Save to MongoDB if connected
        if (isMongoConnected()) {
            await createLocalEvent(importedEvent);
        }

        // Also save to file as backup
        localEvents.push(importedEvent);
        await writeLocalEvents(localEvents);

        res.json({ success: true, event: importedEvent });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Kunde inte importera händelse' });
    }
});

// Return event to inbox (remove local override so it becomes inbox-only again)
app.post('/api/return-to-inbox', async (req, res) => {
    const { uid } = req.body;

    if (!uid) {
        return res.status(400).json({ error: 'UID krävs' });
    }

    try {
        let localEvents = await readLocalEvents();

        // Remove the local event with this UID (this removes the override)
        localEvents = localEvents.filter(e => e.uid !== uid);

        // Delete from MongoDB if connected
        if (isMongoConnected()) {
            await deleteLocalEvent(uid);
        }

        await writeLocalEvents(localEvents);

        res.json({ success: true });
    } catch (error) {
        console.error('Return to inbox error:', error);
        res.status(500).json({ error: 'Kunde inte flytta till inkorg' });
    }
});

// Hämta papperskorgen
app.get('/api/trash', async (req, res) => {
    try {
        const localEvents = await readLocalEvents();
        // Returnera bara de som är deleted eller cancelled
        const trash = localEvents.filter(e => e.deleted || e.cancelled);
        res.json(trash);
    } catch (e) {
        res.status(500).json({ error: 'Kunde inte hämta papperskorgen' });
    }
});

app.post('/api/create-event', async (req, res) => {
    const { summary, location, coords, start, end, description, createdBy, assignee, assignees, category } = req.body;

    if (!summary || !start) {
        return res.status(400).json({ error: 'Titel och starttid krävs' });
    }

    try {
        const events = await readLocalEvents();
        const newEvent = {
            uid: uuidv4(),
            summary,
            location: location || '',
            coords: coords || null,
            start,
            end: end || start,
            description: description || '',
            assignee: assignee || 'Hela familjen',
            assignees: assignees || [],
            category: category || null,
            todoList: [],
            createdBy,
            createdAt: new Date().toISOString(),
            deleted: false,
            cancelled: false
        };

        // Save to MongoDB if connected
        if (isMongoConnected()) {
            await createLocalEvent(newEvent);
        }

        events.push(newEvent);
        await writeLocalEvents(events);

        res.json({ success: true, event: newEvent });
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ error: 'Kunde inte skapa händelse' });
    }
});

app.post('/api/update-event', async (req, res) => {
    const { uid, summary, location, coords, start, end, description, todoList, cancelled, assignments, assignee, assignees, category, source } = req.body;

    try {
        let events = await readLocalEvents();
        const existingIndex = events.findIndex(e => e.uid === uid);

        console.log('Update Event called for:', uid);

        if (existingIndex >= 0) {
            let newSource = events[existingIndex].source;
            if (source) {
                if (!source.includes('(Redigerad)') && !source.includes('Familjen (Eget)') && source !== 'FamilyOps') {
                    newSource = `${source} (Redigerad)`;
                } else {
                    newSource = source;
                }
            }

            events[existingIndex] = {
                ...events[existingIndex],
                summary, location, coords, start, end, description, todoList,
                assignee: assignee || events[existingIndex].assignee,
                assignees: assignees || events[existingIndex].assignees || [],
                category: category || events[existingIndex].category,
                source: newSource,
                cancelled: cancelled !== undefined ? cancelled : events[existingIndex].cancelled
            };

            // Update in MongoDB if connected
            if (isMongoConnected()) {
                await updateLocalEvent(uid, events[existingIndex]);
            }
        } else {
            // Create shadow event for external event
            const shadowEvent = {
                uid,
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
                source: source ? (source.includes('(Redigerad)') ? source : `${source} (Redigerad)`) : 'Familjen (Redigerad)',
                createdAt: new Date().toISOString(),
                cancelled: cancelled || false,
                deleted: false
            };
            events.push(shadowEvent);

            // Save to MongoDB if connected
            if (isMongoConnected()) {
                await createLocalEvent(shadowEvent);
            }
        }

        await writeLocalEvents(events);

        // Save Assignments if provided
        if (assignments) {
            await writeDb(uid, assignments);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update event error:', error);
        res.status(500).json({ error: 'Kunde inte uppdatera händelse' });
    }
});

app.post('/api/delete-event', async (req, res) => {
    const { uid, summary, start, end, source } = req.body;

    try {
        let events = await readLocalEvents();
        const existingIndex = events.findIndex(e => e.uid === uid);

        if (existingIndex >= 0) {
            events[existingIndex].deleted = true;
            events[existingIndex].deletedAt = new Date().toISOString();

            // Update in MongoDB if connected
            if (isMongoConnected()) {
                await updateLocalEvent(uid, { deleted: true, deletedAt: events[existingIndex].deletedAt });
            }
        } else {
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

            // Save to MongoDB if connected
            if (isMongoConnected()) {
                await createLocalEvent(shadowEvent);
            }
        }

        await writeLocalEvents(events);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ error: 'Kunde inte ta bort händelse' });
    }
});

app.post('/api/restore-event', async (req, res) => {
    const { uid } = req.body;

    try {
        let events = await readLocalEvents();
        const existingIndex = events.findIndex(e => e.uid === uid);

        if (existingIndex >= 0) {
            events[existingIndex].deleted = false;
            events[existingIndex].cancelled = false;
            delete events[existingIndex].deletedAt;

            // Update in MongoDB if connected
            if (isMongoConnected()) {
                await updateLocalEvent(uid, { deleted: false, cancelled: false, deletedAt: null });
            }

            await writeLocalEvents(events);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Event not found in local db' });
        }
    } catch (error) {
        console.error('Restore event error:', error);
        res.status(500).json({ error: 'Kunde inte återställa händelse' });
    }
});

app.post('/api/assign', async (req, res) => {
    try {
        const { eventId, user, role } = req.body; // role: 'driver' | 'packer'
        const db = await readDb();

        if (!db[eventId]) {
            db[eventId] = {};
        }

        // Uppdatera specifik roll
        db[eventId][role] = user;

        await writeDb(eventId, db[eventId]);

        res.json({ success: true, assignments: db[eventId] });
    } catch (error) {
        console.error('Assign error:', error);
        res.status(500).json({ error: 'Kunde inte spara tilldelning' });
    }
});

// --- Serve Frontend in Production ---
const distPath = path.resolve(__dirname, '..', 'dist');
console.log('Serving frontend from:', distPath);

// 1. Serve static files from dist directory (handles assets, favicon, etc.)
app.use(express.static(distPath, {
    setHeaders: (res, filepath) => {
        // Ensure correct MIME types
        if (filepath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filepath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// 2. Fallback handler - serve index.html for all non-API, non-asset routes (SPA routing)
app.use((req, res) => {
    console.log(`Fallback triggered for: ${req.url}`);

    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
        res.status(404).send('API endpoint not found');
        return;
    }

    // For file requests that weren't found by static middleware, return 404
    if (req.path.includes('.') && !req.path.endsWith('.html')) {
        console.log(`[404] Static file not found: ${req.path}`);
        res.status(404).send('File not found');
        return;
    }

    // For all other routes (SPA navigation), serve index.html
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend not built. In dev mode? Check console.');
    }
});

// Duplicate fallback removed

// Initialize MongoDB and start server
async function startServer() {
    // Try to connect to MongoDB
    const mongoDb = await connectToMongo();

    if (mongoDb) {
        console.log('[Startup] MongoDB connected - running one-time migration check...');

        // Migrate existing JSON data to MongoDB (only if collections are empty)
        try {
            const existingTasks = await getAllTasks();
            if (existingTasks.length === 0 && tasksData.length > 0) {
                console.log('[Migration] MongoDB tasks empty, migrating from JSON...');
                const fileAssignments = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
                const fileLocalEvents = fs.existsSync(LOCAL_EVENTS_FILE) ? JSON.parse(fs.readFileSync(LOCAL_EVENTS_FILE, 'utf8')) : [];
                const fileIgnored = fs.existsSync(IGNORED_EVENTS_FILE) ? JSON.parse(fs.readFileSync(IGNORED_EVENTS_FILE, 'utf8')) : [];

                await migrateFromJson(fileAssignments, tasksData, fileLocalEvents, fileIgnored);
            } else {
                console.log(`[Migration] MongoDB already has ${existingTasks.length} tasks - skipping migration`);
            }
        } catch (migrationError) {
            console.error('[Migration] Error during migration:', migrationError);
        }
    } else {
        console.log('[Startup] Running in file-only mode (no MongoDB)');
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Family Ops Backend körs på http://0.0.0.0:${PORT}`);
        console.log(`MongoDB status: ${isMongoConnected() ? 'CONNECTED ✓' : 'NOT CONNECTED (using files)'}`);
        // Start the background calendar refresh scheduler
        startScheduledRefresh();
    });
}

startServer();
