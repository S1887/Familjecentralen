import dotenv from 'dotenv';
import { fileURLToPath as _fileURLToPath } from 'url';
import path from 'path';

// Load .env from project root (parent of server/)
const __filename_early = _fileURLToPath(import.meta.url);
const __dirname_early = path.dirname(__filename_early);
dotenv.config({ path: path.join(__dirname_early, '..', '.env') });
import express from 'express';
import cors from 'cors';
import ical from 'node-ical';
import bodyParser from 'body-parser';
import fs from 'fs';
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
    addToTrash,
    removeFromTrash,
    migrateFromJson
} from './db/mongodb.js';
import googleCalendar from './googleCalendar.js';

const __filename = _fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// HA Options - MUST be loaded BEFORE CALENDARS array is created
const HA_OPTIONS_FILE_EARLY = '/data/options.json';
if (fs.existsSync(HA_OPTIONS_FILE_EARLY)) {
    try {
        const options = JSON.parse(fs.readFileSync(HA_OPTIONS_FILE_EARLY, 'utf8'));
        if (options.gemini_api_key) {
            process.env.GEMINI_API_KEY = options.gemini_api_key;
            console.log('[Init] Loaded Gemini API Key from HA options');
        }
        if (options.ical_svante) process.env.ICAL_SVANTE = options.ical_svante;
        if (options.ical_sarah) process.env.ICAL_SARAH = options.ical_sarah;
        if (options.ical_family) process.env.ICAL_FAMILY = options.ical_family;
        if (options.calendar_svante) process.env.CALENDAR_SVANTE = options.calendar_svante;
        if (options.calendar_sarah) process.env.CALENDAR_SARAH = options.calendar_sarah;
        if (options.calendar_family) process.env.CALENDAR_FAMILY = options.calendar_family;

        // Google Service Account credentials (JSON string OR filename in /config/)
        if (options.google_credentials) {
            const credentialsDir = path.join(process.cwd(), 'server', 'credentials');
            if (!fs.existsSync(credentialsDir)) {
                fs.mkdirSync(credentialsDir, { recursive: true });
            }
            const credentialsPath = path.join(credentialsDir, 'google-service-account.json');

            // Check if it's a filename (not JSON)
            if (!options.google_credentials.trim().startsWith('{')) {
                // It's a filename - try to read from /config/
                const configFilePath = path.join('/config', options.google_credentials);
                if (fs.existsSync(configFilePath)) {
                    try {
                        const fileContent = fs.readFileSync(configFilePath, 'utf8');
                        JSON.parse(fileContent); // Validate JSON
                        fs.writeFileSync(credentialsPath, fileContent);
                        console.log(`[Init] Copied Google credentials from ${configFilePath}`);
                    } catch (readErr) {
                        console.error(`[Init] Failed to read credentials file ${configFilePath}:`, readErr.message);
                    }
                } else {
                    console.error(`[Init] Credentials file not found: ${configFilePath}`);
                }
            } else {
                // It's JSON content directly
                try {
                    const creds = JSON.parse(options.google_credentials);
                    fs.writeFileSync(credentialsPath, JSON.stringify(creds, null, 2));
                    console.log('[Init] Wrote Google credentials from HA options (inline JSON)');
                } catch (credErr) {
                    console.error('[Init] Invalid google_credentials JSON:', credErr.message);
                }
            }
        }

        console.log('[Init] Loaded calendar config from HA options');
    } catch (e) { console.error('[Init] Failed to load HA options:', e.message); }
}
const app = express();

// DEBUG LOGGER
const LOG_FILE = path.join(__dirname, 'server_debug.log');
function logToFile(msg) {
    try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch { /* ignore */ }
}
logToFile('--- SERVER STARTING ---');
console.log('--- FAMILY OPS SERVER V5 DIAGNOSTIC START ---');

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

// Calendar sources - private calendars loaded from environment variables
// Calendar sources configuration
// - viewOnly: Only displayed in Centralen (Arsenal, ÖIS)
// - syncToGoogle: Events auto-pushed to Google Family Calendar (laget.se, sportadmin, vklass)
const CALENDARS = [
    // View-only subscriptions (NOT synced to Google)
    {
        id: 'arsenal_fc',
        name: 'Arsenal FC',
        url: 'https://ics.fixtur.es/v2/arsenal.ics',
        viewOnly: true
    },
    {
        id: 'ois_fotboll',
        name: 'Örgryte IS',
        url: 'https://calendar.google.com/calendar/ical/nahppp38tiqn7nbsahk6l0qncno1rahs%40import.calendar.google.com/public/basic.ics',
        viewOnly: true
    },
    // Subscription calendars - synced to Google Family Calendar
    // Training events go directly to calendar, other events go to inbox
    {
        id: 'hkl_p11_p10',
        name: 'HK Lidköping P11/P10',
        url: 'https://cal.laget.se/HKL-P11-P10.ics',
        syncToGoogle: true,
        child: 'Algot',
        category: 'Handboll'
    },
    {
        id: 'hkl_handbollsskola',
        name: 'HK Lidköping Handbollsskola',
        url: 'https://cal.laget.se/HKLidkoping-Handbollsskola.ics',
        syncToGoogle: true,
        child: 'Tuva',
        category: 'Handboll'
    },
    {
        id: 'rada_bk_f7',
        name: 'Råda BK F7',
        url: 'https://cal.laget.se/RadaBK-F7.ics',
        syncToGoogle: true,
        child: 'Tuva',
        category: 'Fotboll'
    },
    {
        id: 'rada_bk_p2015',
        name: 'Råda BK P2015',
        url: 'https://cal.laget.se/RadaBK-P2015.ics',
        syncToGoogle: true,
        child: 'Algot',
        category: 'Fotboll'
    },
    {
        id: 'villa_lidkoping_algot',
        name: 'Villa Lidköping (Algot)',
        url: 'https://portalweb.sportadmin.se/webcal?id=d9a0805a-8cb5-4c5c-8eb9-679ecb6c70c0',
        syncToGoogle: true,
        child: 'Algot',
        category: 'Bandy'
    },
    {
        id: 'vklass_skola',
        name: 'Vklass (Skola)',
        url: 'https://cal.vklass.se/d0cc0c1d-b064-40b8-a82c-0b2c90ba41c4.ics?custodian=true',
        syncToGoogle: true,
        isVklass: true
    },
    {
        id: 'vklass_skola_tuva',
        name: 'Vklass (Skola Tuva)',
        url: 'https://cal.vklass.se/5bfb5374-1d00-4dc0-b688-4dc5a60765a9.ics?custodian=true',
        syncToGoogle: true,
        isVklass: true
    }
];

// ============ ROBUST KALENDER-CACHE ============
// 1. Disk persistence - survives restarts
// 2. 1-hour cache duration
// 3. Background scheduled refresh
// 4. Graceful error handling

// Datakatalog
// HA-Aware Configuration
const HA_DATA_DIR = '/data';

// Determine DATA_DIR
let dataPath = process.env.DATA_DIR || __dirname;

// If we are in HA (indicated by /data existence), use it for persistence
if (fs.existsSync(HA_DATA_DIR)) {
    console.log('[Init] Detected HA /data directory, using for persistence');
    dataPath = HA_DATA_DIR;
}

const DATA_DIR = dataPath;


// Se till att katalogen finns (om den inte är root)
if (process.env.DATA_DIR && !fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`[Init] Created data directory: ${DATA_DIR}`);
    } catch (e) {
        console.error(`[Init] Failed to create data directory: ${e.message}`);
    }
}

// === VERSION UPGRADE CLEANUP ===
// One-time cleanup when upgrading to prevent duplicates
// This clears sync-related files but preserves user data (tasks, local_events, etc.)
const VERSION_FILE = path.join(DATA_DIR, 'last_version.txt');
const CURRENT_VERSION = '6.0.2'; // Matches package.json
function performVersionUpgradeCleanup() {
    let lastVersion = '';
    try {
        if (fs.existsSync(VERSION_FILE)) {
            lastVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
        }
    } catch { /* ignore */ }

    // Only run cleanup if upgrading from older version to 4.0.2+
    if (lastVersion && lastVersion >= CURRENT_VERSION) {
        console.log(`[Upgrade] Already on ${lastVersion}, no cleanup needed`);
        return;
    }

    console.log(`[Upgrade] Upgrading from ${lastVersion || 'unknown'} to ${CURRENT_VERSION}`);
    console.log('[Upgrade] Cleaning sync-related files to prevent duplicates...');

    // Files to clean (sync-related only - NOT user data)
    const filesToClean = [
        path.join(DATA_DIR, 'ignored_events.json'),
        path.join(DATA_DIR, 'trash.json'),
        path.join(DATA_DIR, 'calendar_cache.json'),
        path.join(DATA_DIR, 'approved_events.json'),
        path.join(process.cwd(), 'server', 'google_event_map.json'),
        path.join(DATA_DIR, 'google_event_map.json') // New persistent location
    ];

    filesToClean.forEach(file => {
        if (fs.existsSync(file)) {
            try {
                fs.unlinkSync(file);
                console.log(`[Upgrade] Deleted: ${path.basename(file)}`);
            } catch (e) {
                console.error(`[Upgrade] Failed to delete ${path.basename(file)}: ${e.message}`);
            }
        }
    });

    // Save current version
    try {
        fs.writeFileSync(VERSION_FILE, CURRENT_VERSION);
        console.log(`[Upgrade] Cleanup complete. Version set to ${CURRENT_VERSION}`);
    } catch (e) {
        console.error('[Upgrade] Failed to save version:', e.message);
    }
}

// Run cleanup before anything else
performVersionUpgradeCleanup();

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
const TRASH_FILE = path.join(DATA_DIR, 'trash.json');
const CACHE_FILE = path.join(DATA_DIR, 'calendar_cache.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const MEALS_FILE = path.join(DATA_DIR, 'meals.json');
const ID_MAPPINGS_FILE = path.join(DATA_DIR, 'google_event_map.json'); // Same name as in googleCalendar.js

// --- HELPER FOR ZOMBIE FIX ---
function readMappings() {
    try {
        if (fs.existsSync(ID_MAPPINGS_FILE)) {
            const map = JSON.parse(fs.readFileSync(ID_MAPPINGS_FILE, 'utf8'));
            // Convert map object to array structure if needed or just return values
            // The map is SourceUID -> { googleEventId, ... }
            return Object.entries(map).map(([localId, data]) => ({
                localId,
                googleEventId: data.googleEventId,
                localIds: data.localIds
            }));
        }
    } catch (e) {
        console.error('[Helper] Failed to read mappings:', e.message);
    }
    return [];
}
// -----------------------------

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

// Promise to track active fetch
let fetchingPromise = null;

// Wrapper to handle concurrent fetches
async function fetchCalendarsFromGoogle() {
    if (fetchingPromise) {
        console.log('[Cache] Already fetching, attaching to existing promise...');
        return fetchingPromise;
    }

    fetchingPromise = (async () => {
        try {
            const result = await _fetchCalendarsInternal();
            return result;
        } finally {
            fetchingPromise = null;
        }
    })();

    return fetchingPromise;
}

// Fetch calendars (internal function)
// Internal fetch logic
async function _fetchCalendarsInternal() {
    if (isFetching) {
        console.log('[Cache] Already fetching, skipping...');
        return false;
    }

    isFetching = true;
    console.log('[Cache] Fetching calendar data...');
    const freshEvents = [];
    const inboxEvents = []; // Events that need approval (non-training subscription events)
    const eventsToSyncToGoogle = []; // Events to push to Google (training/match from subscriptions)
    const scheduleOnlyEvents = []; // Vklass lessons for ScheduleViewer
    let successCount = 0;
    let errorCount = 0;

    // ============ STEP 1: Fetch ICS subscriptions ============
    for (const cal of CALENDARS) {
        try {
            console.log(`[Cache] Fetching: ${cal.name}...`);

            const opts = {
                headers: { 'User-Agent': 'Mac OS X/10.15.7 (19H2) CalendarAgent/954' }
            };

            const data = await ical.async.fromURL(cal.url, opts);
            const eventsFound = Object.values(data).filter(e => e.type === 'VEVENT').length;
            console.log(`✓ Fetched ${eventsFound} events from ${cal.name}`);
            successCount++;

            for (const k in data) {
                const ev = data[k];
                if (ev.type === 'VEVENT') {
                    let summary = ev.summary || '';
                    const summaryLower = summary.toLowerCase();

                    // Detect training - various spellings
                    let isTraining = summaryLower.includes('träning') ||
                        summaryLower.includes('training') ||
                        summaryLower.includes('övning');

                    // Detect match/game events
                    let isMatch = summaryLower.includes('match') ||
                        summaryLower.includes('seriematch') ||
                        summaryLower.includes('cup') ||
                        summaryLower.includes('turnering') ||
                        summaryLower.includes(' - ') ||  // "Team A - Team B" format
                        summaryLower.includes(' vs ') ||
                        summaryLower.includes(' mot ');
                    let goesToInbox = false;
                    let child = cal.child || null;
                    let category = cal.category || null;
                    let isLesson = false;
                    let scheduleOnly = false;

                    // View-only calendars (Arsenal, ÖIS) - always visible, never synced
                    if (cal.viewOnly) {
                        freshEvents.push({
                            uid: ev.uid,
                            summary: `Svante: ${summary}`,
                            start: ev.start,
                            end: ev.end,
                            location: ev.location || '',
                            description: ev.description || '',
                            source: cal.name,
                            originalSource: cal.name,
                            inboxOnly: false,
                            assignees: ['Svante'],
                            category: 'Sport',
                            todoList: [],
                            tags: [],
                            deleted: false,
                            scheduleOnly: false,
                            isViewOnly: true
                        });
                        continue;
                    }

                    // Vklass - parse student codes
                    if (cal.isVklass) {
                        let match = summary.match(/\((.*?)\)/);
                        if (!match && ev.description) {
                            match = ev.description.match(/\((.*?)\)/);
                        }
                        if (match) {
                            const content = match[1].toLowerCase();
                            if (content.includes('sth15')) child = 'Algot';
                            else if (content.includes('sth18')) child = 'Tuva';

                            // Check if it's a lesson code
                            if (content.includes('__') || /^[a-z]+\d+$/i.test(content)) {
                                isLesson = true;
                                scheduleOnly = true;
                                category = 'Skola';
                                summary = summary.replace(/\s*\(.*?\)/, '').trim();
                            }
                        }
                        // Non-lesson Vklass events go to inbox
                        if (!isLesson && !isTraining && !isMatch) {
                            goesToInbox = true;
                        }
                    }

                    // Sport calendars - training/match goes directly, other to inbox
                    if (cal.syncToGoogle && !cal.isVklass) {
                        if (!isTraining && !isMatch) {
                            goesToInbox = true;
                        }
                        // Fix Villa Lidköping labeling
                        if (cal.id === 'villa_lidkoping_algot') {
                            summary = summary.replace(/Handboll/gi, 'Bandy');
                        }
                    }

                    // Add child prefix to summary for Google
                    const googleSummary = child ? `${child}: ${summary}` : summary;

                    const eventData = {
                        uid: ev.uid,
                        summary: googleSummary,
                        start: ev.start,
                        end: ev.end,
                        location: ev.location || '',
                        description: ev.description || '',
                        source: cal.name,
                        originalSource: cal.name,
                        inboxOnly: goesToInbox,
                        assignees: child ? [child] : [],
                        student: child || null, // For ScheduleViewer filtering
                        category: category,
                        todoList: [],
                        tags: [],
                        deleted: false,
                        scheduleOnly: scheduleOnly,
                        isLesson: isLesson,
                        syncToGoogle: cal.syncToGoogle && !goesToInbox && !scheduleOnly
                    };

                    if (goesToInbox) {
                        inboxEvents.push(eventData);
                    } else if (!scheduleOnly) {
                        // If Google API is enabled, syncToGoogle events go to separate array
                        // They will be pushed to Google in STEP 2 and fetched back in STEP 3
                        if (eventData.syncToGoogle && googleCalendar.isEnabled()) {
                            eventsToSyncToGoogle.push(eventData);
                        } else {
                            freshEvents.push(eventData);
                        }
                    } else {
                        // scheduleOnly events (Vklass lessons) - add to dedicated array
                        scheduleOnlyEvents.push(eventData);
                    }
                }
            }
        } catch (e) {
            console.error(`✗ Failed to fetch ${cal.name}: ${e.message}`);
            errorCount++;
        }
    }

    // ============ STEP 2: Auto-push subscription events to Google ============
    if (googleCalendar.isEnabled() && eventsToSyncToGoogle.length > 0) {
        console.log(`[Sync] ${eventsToSyncToGoogle.length} events to potentially sync to Google`);
        let pushedCount = 0;
        let updatedCount = 0;

        for (const event of eventsToSyncToGoogle) {
            // Skip past events
            if (new Date(event.start) < new Date()) continue;

            // Check if already in Google
            const existingMapping = googleCalendar.getMapping(event.uid);

            if (existingMapping) {
                // Event exists - check if time has changed
                try {
                    const googleEvent = await googleCalendar.getEvent(
                        existingMapping.googleEventId,
                        existingMapping.calendarId
                    );

                    if (googleEvent) {
                        const googleStart = new Date(googleEvent.start.dateTime || googleEvent.start.date);
                        const icsStart = new Date(event.start);
                        const googleEnd = new Date(googleEvent.end.dateTime || googleEvent.end.date);
                        const icsEnd = new Date(event.end);

                        // Check if time changed (allow 1 minute tolerance)
                        const startDiff = Math.abs(googleStart - icsStart);
                        const endDiff = Math.abs(googleEnd - icsEnd);

                        if (startDiff > 60000 || endDiff > 60000) {
                            // Time changed - update Google event
                            console.log(`[Sync] Time changed for "${event.summary}": ${googleStart.toISOString()} → ${icsStart.toISOString()}`);

                            await googleCalendar.updateEvent(existingMapping.googleEventId, existingMapping.calendarId, {
                                summary: event.summary,
                                start: event.start,
                                end: event.end,
                                location: event.location,
                                description: `Källa: ${event.originalSource}`
                            });
                            updatedCount++;
                        }
                    }
                } catch (err) {
                    // Event might have been deleted from Google - skip
                    console.log(`[Sync] Could not check/update ${event.summary}: ${err.message}`);
                }
                await delay(200);
                continue;
            }

            // New event - but first check if duplicate already exists in Google
            // This prevents duplicates when google_event_map.json was cleared
            try {
                const eventStart = new Date(event.start);
                const searchStart = new Date(eventStart);
                searchStart.setHours(0, 0, 0, 0);
                const searchEnd = new Date(eventStart);
                searchEnd.setHours(23, 59, 59, 999);

                // Search for events on the same day
                const existingEvents = await googleCalendar.listEvents(
                    googleCalendar.CALENDAR_CONFIG.familjen,
                    searchStart.toISOString(),
                    searchEnd.toISOString()
                );

                // Check if event with same summary and start time already exists
                const duplicate = existingEvents.find(e => {
                    const eSummary = (e.summary || '').toLowerCase().trim();
                    const newSummary = (event.summary || '').toLowerCase().trim();
                    const eStart = new Date(e.start.dateTime || e.start.date);
                    const newStart = new Date(event.start);

                    // Strip child prefix for comparison (e.g., "Algot: Träning" -> "träning")
                    const stripPrefix = (s) => s.replace(/^(algot|tuva|leon|svante|sarah):\s*/i, '');
                    const eStripped = stripPrefix(eSummary);
                    const newStripped = stripPrefix(newSummary);

                    // Match if summary is same (with or without prefix) and start time within 5 minutes
                    const summaryMatch = eSummary === newSummary ||
                        eStripped === newStripped ||
                        eSummary.includes(newStripped) ||
                        newSummary.includes(eStripped);
                    const timeMatch = Math.abs(eStart - newStart) < 5 * 60 * 1000; // 5 min tolerance

                    return summaryMatch && timeMatch;
                });

                if (duplicate) {
                    // Found existing event - save mapping and skip creation
                    console.log(`[Sync] Found existing event in Google: "${duplicate.summary}" - linking instead of creating`);
                    await googleCalendar.saveMapping(event.uid, duplicate.id, googleCalendar.CALENDAR_CONFIG.familjen);
                    await delay(100);
                    continue;
                }

                // No duplicate found - create new event
                const googleEvent = {
                    summary: event.summary,
                    start: event.start,
                    end: event.end,
                    location: event.location,
                    description: `Källa: ${event.originalSource}`,
                    assignees: event.assignees
                };

                const created = await googleCalendar.createEvent(googleEvent);
                if (created) {
                    await googleCalendar.saveMapping(event.uid, created.id, googleCalendar.CALENDAR_CONFIG.familjen);
                    pushedCount++;
                }
                await delay(300);
            } catch (err) {
                console.error(`[Sync] Failed to push ${event.summary}:`, err.message);
            }
        }

        if (pushedCount > 0 || updatedCount > 0) {
            console.log(`[Sync] Pushed ${pushedCount} new, updated ${updatedCount} changed events in Google`);
        }
    }

    // ============ STEP 3: Fetch ALL events from Google Calendar API ============
    // This is the SINGLE SOURCE OF TRUTH for family events
    if (googleCalendar.isEnabled()) {
        const startTime = new Date();
        startTime.setMonth(startTime.getMonth() - 3);
        const endTime = new Date();
        endTime.setFullYear(endTime.getFullYear() + 1);

        // Fetch Family Calendar
        try {
            console.log('[Cache] Fetching Family Calendar via API...');
            const apiEvents = await googleCalendar.listEvents(
                googleCalendar.CALENDAR_CONFIG.familjen,
                startTime.toISOString(),
                endTime.toISOString()
            );
            console.log(`[Cache] Found ${apiEvents.length} events from Family Calendar`);

            for (const ev of apiEvents) {
                let summary = ev.summary || 'Utan rubrik';
                let assignees = [];
                let category = null;

                // Parse "Name: " prefix to restore assignees
                const assigneeMatch = summary.match(/^([A-Za-zÅÄÖåäö]+):\s/);
                if (assigneeMatch) {
                    const name = assigneeMatch[1];
                    const validNames = ['Svante', 'Sarah', 'Algot', 'Leon', 'Tuva'];
                    if (validNames.includes(name)) {
                        assignees = [name];
                        // Auto-categorize based on keywords
                        const s = summary.toLowerCase();
                        if (s.includes('handboll')) category = 'Handboll';
                        else if (s.includes('fotboll')) category = 'Fotboll';
                        else if (s.includes('bandy')) category = 'Bandy';
                    }
                }

                freshEvents.push({
                    uid: ev.id,
                    summary: summary,
                    start: new Date(ev.start.dateTime || ev.start.date),
                    end: new Date(ev.end.dateTime || ev.end.date),
                    location: ev.location || '',
                    description: ev.description || '',
                    source: 'Örtendahls familjekalender',
                    originalSource: 'family_group_api',
                    inboxOnly: false,
                    assignees: assignees,
                    category: category,
                    todoList: [],
                    tags: [],
                    deleted: false,
                    scheduleOnly: false,
                    isExternalSource: false
                });
            }
            successCount++;
        } catch (apiError) {
            console.error('[Cache] Family Calendar API failed:', apiError.message);
            errorCount++;
        }

        // Fetch Sarah's Calendar
        try {
            console.log('[Cache] Fetching Sarah Calendar via API...');
            const sarahEvents = await googleCalendar.listEvents(
                googleCalendar.CALENDAR_CONFIG.sarah,
                startTime.toISOString(),
                endTime.toISOString()
            );
            console.log(`[Cache] Found ${sarahEvents.length} events from Sarah's calendar`);

            for (const ev of sarahEvents) {
                freshEvents.push({
                    uid: ev.id,
                    summary: ev.summary || 'Utan rubrik',
                    start: new Date(ev.start.dateTime || ev.start.date),
                    end: new Date(ev.end.dateTime || ev.end.date),
                    location: ev.location || '',
                    description: ev.description || '',
                    source: 'Sarah',
                    originalSource: 'sara_api',
                    inboxOnly: false,
                    assignees: ['Sarah'],
                    category: null,
                    todoList: [],
                    tags: [],
                    deleted: false,
                    scheduleOnly: false,
                    isExternalSource: false
                });
            }
            successCount++;
        } catch (apiError) {
            console.error('[Cache] Sarah Calendar API failed:', apiError.message);
            errorCount++;
        }

        // Fetch Svante's Calendar
        try {
            console.log('[Cache] Fetching Svante Calendar via API...');
            const svanteEvents = await googleCalendar.listEvents(
                googleCalendar.CALENDAR_CONFIG.svante,
                startTime.toISOString(),
                endTime.toISOString()
            );
            console.log(`[Cache] Found ${svanteEvents.length} events from Svante's calendar`);

            for (const ev of svanteEvents) {
                freshEvents.push({
                    uid: ev.id,
                    summary: ev.summary || 'Utan rubrik',
                    start: new Date(ev.start.dateTime || ev.start.date),
                    end: new Date(ev.end.dateTime || ev.end.date),
                    location: ev.location || '',
                    description: ev.description || '',
                    source: 'Svante',
                    originalSource: 'svante_api',
                    inboxOnly: false,
                    assignees: ['Svante'],
                    category: null,
                    todoList: [],
                    tags: [],
                    deleted: false,
                    scheduleOnly: false,
                    isExternalSource: false
                });
            }
            successCount++;
        } catch (apiError) {
            console.error('[Cache] Svante Calendar API failed:', apiError.message);
            errorCount++;
        }
    } else {
        console.log('[Cache] Google Calendar API not enabled - no events fetched');
    }

    isFetching = false;

    // ============ STEP 4: Update cache ============
    // Include inbox events and schedule-only events in cache
    const allEvents = [...freshEvents, ...inboxEvents, ...scheduleOnlyEvents];

    if (allEvents.length > 0) {
        cachedCalendarEvents = allEvents;
        cacheTimestamp = Date.now();
        saveCacheToDisk();
        console.log(`[Cache] Updated with ${allEvents.length} events (${freshEvents.length} calendar + ${inboxEvents.length} inbox + ${scheduleOnlyEvents.length} schedule, ${successCount} sources OK, ${errorCount} failed)`);
        return true;
    } else if (cachedCalendarEvents.length > 0) {
        console.log(`[Cache] Fetch returned 0 events, keeping old cache`);
        return false;
    }

    return false;
}

// Public function to get cached calendars
async function fetchAndCacheCalendars(forceRefresh = false) {
    const now = Date.now();
    const cacheAge = now - cacheTimestamp;

    // Return cache if still valid (and not forced)
    if (!forceRefresh && cachedCalendarEvents.length > 0 && cacheAge < CACHE_DURATION_MS) {
        console.log(`[Cache] Returning cached data (age: ${Math.round(cacheAge / 1000 / 60)} min)`);
        return cachedCalendarEvents;
    }

    if (forceRefresh) {
        console.log('[Cache] FORCE REFRESH requested - bypassing cache limit');
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
    logToFile('[Scheduler] Starting hourly calendar refresh...');

    // Initial fetch after 10 seconds (reduced from 30 for debug)
    setTimeout(async () => {
        console.log('[Scheduler] Running initial calendar fetch...');
        logToFile('[Scheduler] Running initial calendar fetch...');
        await fetchCalendarsFromGoogle();
    }, 10000);


    // Then refresh every hour
    setInterval(async () => {
        console.log('[Scheduler] Running scheduled calendar refresh...');
        await fetchCalendarsFromGoogle();
    }, CACHE_DURATION_MS);
}

// Schedule daily cache reset at 03:00 to prevent stale data buildup
function scheduleDailyCacheReset() {
    const now = new Date();
    const resetHour = 3; // 03:00

    // Calculate next 03:00
    let nextReset = new Date(now);
    nextReset.setHours(resetHour, 0, 0, 0);

    // If it's already past 03:00 today, schedule for tomorrow
    if (now >= nextReset) {
        nextReset.setDate(nextReset.getDate() + 1);
    }

    const msUntilReset = nextReset - now;
    console.log(`[Scheduler] Daily cache reset scheduled for ${nextReset.toLocaleString('sv-SE')} (in ${Math.round(msUntilReset / 1000 / 60)} min)`);

    setTimeout(() => {
        console.log('[Scheduler] Running daily cache reset...');

        // Clear in-memory cache
        cachedCalendarEvents = [];
        cacheTimestamp = 0;

        // Delete cache file
        if (fs.existsSync(CACHE_FILE)) {
            try {
                fs.unlinkSync(CACHE_FILE);
                console.log('[Scheduler] Cache file deleted');
            } catch (e) {
                console.error('[Scheduler] Failed to delete cache file:', e.message);
            }
        }

        // Fetch fresh data
        fetchCalendarsFromGoogle().then(() => {
            console.log('[Scheduler] Fresh data fetched after reset');
        });

        // Schedule next reset (24 hours from now)
        scheduleDailyCacheReset();
    }, msUntilReset);
}

// Start the daily reset scheduler
scheduleDailyCacheReset();

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
    } catch { return []; }
};

const writeIgnoredEvents = (data) => {
    fs.writeFileSync(IGNORED_EVENTS_FILE, JSON.stringify(data, null, 2));
};

// Sync version for startup migration (no MongoDB check needed at startup)
const readIgnoredEventsSync = () => {
    if (!fs.existsSync(IGNORED_EVENTS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(IGNORED_EVENTS_FILE, 'utf8'));
    } catch { return []; }
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
        const {
            recentMeals: _recentMeals = [],
            preferences: _preferences = '',
            weekEvents = [],
            dates = [],
            customInstructions = '',
            targetDate = null,
            targetTypes = ['dinner'] // ['lunch', 'dinner'] or just ['dinner']
        } = req.body;

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // Use gemini-2.5-flash for better rate limits
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: "application/json" }
        });

        // Prepare schedule context for AI
        const scheduleContext = dates.map(date => {
            const dayEvents = weekEvents.filter(e => {
                const s = new Date(e.start);
                const dStr = s.toISOString().split('T')[0];
                return dStr === date;
            });

            // Format events for AI
            const eventsList = dayEvents.map(e => {
                const start = new Date(e.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                const end = new Date(e.end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                return `${start}-${end} ${e.summary}`;
            }).join(', ');

            return { date, events: eventsList };
        });

        const scheduleText = scheduleContext.map(d => `${d.date}: ${d.events || 'Inga bokade aktiviteter'}`).join('\n');

        let prompt = '';

        if (targetDate) {
            // SINGLE DAY PROMPT
            const daySchedule = scheduleContext.find(d => d.date === targetDate);
            prompt = `Du är en smart matplanerare för familjen Örtendahl.
Datum: ${targetDate}
Schema: ${daySchedule ? daySchedule.events : 'Tomt'}

UPPGIFT:
Generera matförslag för följande måltider: ${targetTypes.join(', ')}.

REGLER:
1. Måltider tar ca 30 minuter att laga/äta.
2. Föreslå en TID (time) för varje måltid.
   - Lunch: Mellan 11:30 - 14:00.
   - Middag: Mellan 17:00 - 20:00.
   - VIKTIGT: Tiden får INTE krocka med aktiviteter i schemat.
   - Om en aktivitet slutar 17:00, föreslå middag 17:30 eller 18:00.
3. Lunch: Enklare mat (rester, soppa, sallad, lättlagat).
4. Middag: Varierad husmanskost/varmrätt.
5. VIKTIGT: ${customInstructions ? `INSTRUKTION: ${customInstructions}` : 'Ge bra, vardagliga förslag.'}

Svara ENDAST med JSON i detta format (inga code blocks):
{
  ${targetTypes.map(type => `"${type}": { "meal": "Maträttens namn", "time": "HH:MM" }`).join(',\n  ')}
}`;

        } else {
            // FULL WEEK PROMPT (Updated for v3.1.0)
            prompt = `Du är en svensk familjs matplanerare.
Föreslå ${dates.length} middagsrätter för datumen: ${dates.join(', ')}.

SCHEMA:
${scheduleText}

REGLER:
1. Svara ENDAST med en JSON-array.
2. Varje objekt i arrayen ska innehålla:
   - "meal": Maträttens namn.
   - "time": Förslag på tid (ca kl 17-20, anpassat efter schemat så det ej krockar).
3. Maten ska vara varierad och barnvänlig.
4. ${customInstructions}

Exempel på format:
[
  { "meal": "Köttbullar", "time": "17:30" },
  { "meal": "Lax", "time": "18:00" }
]`;
        }

        console.log('[AI] Sending prompt:', prompt.substring(0, 200) + '...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();

        console.log('[AI] Response:', text);
        const json = JSON.parse(text);

        res.json({ suggestions: json });

    } catch (error) {
        console.error('Gemini API Error:', error);
        // Fallback or nice error
        if (error.status === 429) {
            res.status(429).json({ error: 'AI-tjänsten är överbelastad. Försök igen om en stund.' });
        } else {
            res.status(500).json({ error: 'Kunde inte generera förslag' });
        }
    }
});

// ============ AI RECIPE GENERATION ============
app.post('/api/meals/recipe', async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
        const { meal, currentRecipe, refinement } = req.body;
        if (!meal) {
            return res.status(400).json({ error: 'Meal name required' });
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: "application/json" }
        });

        let prompt;
        if (refinement && currentRecipe) {
            // Refinement mode - modify existing recipe
            prompt = `Du är en svensk familjekock. Användaren vill anpassa detta recept:

NUVARANDE RECEPT:
${currentRecipe}

ANVÄNDARENS ÖNSKEMÅL: "${refinement}"

UPPGIFT:
1. Skapa ett uppdaterat recept baserat på önskemålet.
2. UPPDATERA RÄTTENS NAMN (titeln) om huvudingredienser eller karaktär ändras (t.ex. Lax -> Kyckling).
3. Returnera svaret som strikt JSON.

JSON Format:
{
  "title": "Namnet på rätten (uppdaterat om nödvändigt)",
  "recipe": "Hela recepttexten i markdown format (Ingredienser, Tillagning, Tips)"
}

Recept-texten ska vara snyggt formatterad med markdown (utan # rubrik för titeln då den ligger separat).
`;
        } else {
            // Initial recipe generation
            prompt = `Du är en svensk familjekock. Skapa ett recept för: "${meal}"

REGLER:
1. Max 6 ingredienser
2. Max 5 steg
3. Skriv på svenska
4. Barnvänligt
5. Returnera svaret som strikt JSON.

JSON Format:
{
  "title": "${meal}",
  "recipe": "Hela recepttexten i markdown format (Ingredienser, Tillagning, Tips)"
}
`;
        }

        console.log('[AI] Recipe request for:', meal, refinement ? `(refinement: ${refinement})` : '');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textResponse = response.text();

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(textResponse);
        } catch {
            console.error('Failed to parse AI JSON response:', textResponse);
            // Fallback if AI fails valid JSON for some reason
            jsonResponse = {
                title: meal,
                recipe: textResponse
            };
        }

        console.log('[AI] Recipe generated for:', jsonResponse.title);
        res.json({
            recipe: jsonResponse.recipe,
            title: jsonResponse.title
        });

    } catch (error) {
        console.error('Recipe API Error:', error);
        if (error.status === 429) {
            res.status(429).json({ error: 'AI-tjänsten är överbelastad.' });
        } else {
            res.status(500).json({ error: 'Kunde inte generera recept' });
        }
    }
});

// ============ SAVED RECIPES COLLECTION ============
const recipesFilePath = path.join(DATA_DIR, 'recipes.json');

const loadRecipes = () => {
    try {
        if (fs.existsSync(recipesFilePath)) {
            return JSON.parse(fs.readFileSync(recipesFilePath, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading recipes:', error);
    }
    return [];
};

const saveRecipesToFile = (recipes) => {
    try {
        fs.writeFileSync(recipesFilePath, JSON.stringify(recipes, null, 2));
    } catch (error) {
        console.error('Error saving recipes:', error);
    }
};

// Get all saved recipes
app.get('/api/recipes', (req, res) => {
    const recipes = loadRecipes();
    res.json(recipes);
});

// Save new recipe
app.post('/api/recipes', (req, res) => {
    const { mealName, recipe, date, type } = req.body;
    const recipes = loadRecipes();

    const newRecipe = {
        id: Date.now().toString(),
        mealName,
        recipe,
        date,
        type,
        savedAt: new Date().toISOString()
    };

    recipes.push(newRecipe);
    saveRecipesToFile(recipes);

    console.log('[Recipes] Saved:', mealName);
    res.json(newRecipe);
});

// Delete recipe
app.delete('/api/recipes/:id', (req, res) => {
    const recipes = loadRecipes();
    const filtered = recipes.filter(r => r.id !== req.params.id);
    saveRecipesToFile(filtered);
    res.json({ success: true });
});

// Update recipe (edit content and notes)
app.put('/api/recipes/:id', (req, res) => {
    const { recipe, notes, category } = req.body;
    const recipes = loadRecipes();
    const index = recipes.findIndex(r => r.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Recipe not found' });
    }

    recipes[index] = {
        ...recipes[index],
        recipe: recipe !== undefined ? recipe : recipes[index].recipe,
        notes: notes !== undefined ? notes : recipes[index].notes,
        category: category !== undefined ? category : recipes[index].category,
        updatedAt: new Date().toISOString()
    };

    saveRecipesToFile(recipes);
    console.log('[Recipes] Updated:', recipes[index].mealName);
    res.json(recipes[index]);
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
        const forceRefresh = req.query.force === 'true';

        // Get events from Google Calendar cache
        const fetchedEvents = await fetchAndCacheCalendars(forceRefresh);

        // Get LOCAL events (includes shadow edits and locally created events)
        const localEvents = await readLocalEvents();

        console.log(`[Debug] Events: Fetched=${fetchedEvents.length} from Google, Local=${localEvents.length}`);

        // Log local events UIDs for debugging
        if (localEvents.length > 0) {
            console.log('[Debug] Local event UIDs:', localEvents.map(le => le.uid?.substring(0, 20) + '...'));
        }

        // Create a map of local events by UID for quick lookup
        const localEventsMap = {};
        localEvents.forEach(le => {
            if (le.uid) localEventsMap[le.uid] = le;
        });

        // Merge: Apply local overrides to Google events
        let mergedCount = 0;
        let allEvents = fetchedEvents.map(googleEvent => {
            const localOverride = localEventsMap[googleEvent.uid];
            if (localOverride) {
                mergedCount++;

                // Check if this should be "isTrashed" instead of "cancelled"
                // For subscription events, we use isTrashed to show "EJ AKTUELL" label
                const effectiveSource = localOverride.source || googleEvent.source || '';
                const isSubscription = effectiveSource.toLowerCase().includes('hk lidköping') ||
                    effectiveSource.toLowerCase().includes('villa lidköping') ||
                    effectiveSource.toLowerCase().includes('råda') ||
                    effectiveSource.toLowerCase().includes('vklass') ||
                    effectiveSource.toLowerCase().includes('arsenal') ||
                    effectiveSource.toLowerCase().includes('örgryte') ||
                    googleEvent.isExternalSource;

                const shouldBeTrash = localOverride.cancelled && isSubscription;

                console.log(`[Debug] Merging override for event: ${googleEvent.summary?.substring(0, 30)}... | cancelled=${localOverride.cancelled} | isTrashed=${shouldBeTrash} | uid=${googleEvent.uid?.substring(0, 25)}`);

                // Merge local overrides into the Google event
                return {
                    ...googleEvent,
                    // Apply local overrides for editable fields
                    assignee: localOverride.assignee || googleEvent.assignee,
                    assignees: localOverride.assignees || googleEvent.assignees || [],
                    category: localOverride.category || googleEvent.category,
                    todoList: localOverride.todoList || googleEvent.todoList || [],
                    // Convert cancelled to isTrashed for subscription events
                    cancelled: shouldBeTrash ? false : (localOverride.cancelled !== undefined ? localOverride.cancelled : googleEvent.cancelled),
                    isTrashed: shouldBeTrash ? true : (localOverride.isTrashed || googleEvent.isTrashed),
                    deleted: localOverride.deleted !== undefined ? localOverride.deleted : googleEvent.deleted,
                    // CRITICAL: Apply inboxOnly override (allows importing from inbox)
                    inboxOnly: localOverride.inboxOnly !== undefined ? localOverride.inboxOnly : googleEvent.inboxOnly,
                    // If this was a shadow edit, mark the source as edited
                    source: localOverride.source || googleEvent.source
                };
            }
            return googleEvent;
        });

        console.log(`[Debug] Merged ${mergedCount} events with local overrides`);

        // Read trashed event UIDs to prevent "zombie" events from reappearing
        const trashedUids = new Set(readTrashFile().map(t => t.eventId));

        // V2 Fix: Also read mappings to check if the Google ID (mapped from local UID) is in trash
        let localToGoogleMap = {}; // UID -> GoogleID
        try {
            const mappings = await readMappings(); // Helper needed to read id_mappings.json
            mappings.forEach(m => {
                if (m.localIds && Array.isArray(m.localIds)) {
                    m.localIds.forEach(lid => localToGoogleMap[lid] = m.googleEventId);
                } else if (m.localId) {
                    localToGoogleMap[m.localId] = m.googleEventId;
                }
            });
            console.log(`[Debug] Trashed UIDs count: ${trashedUids.size}, Mappings count: ${mappings.length}`);
        } catch (mapErr) {
            console.error('[Debug] Failed to process mappings for zombie check:', mapErr);
        }

        // Add LOCAL-ONLY events (created in FamilyOps, not from Google)
        localEvents.forEach(le => {
            // Check if this is a purely local event (not just an override of a Google event)
            const existsInGoogle = fetchedEvents.some(ge => ge.uid === le.uid);

            // Skip if event is in trash (prevents zombie events)
            // CHECK 1: Local UID in trash?
            // CHECK 2: Mapped Google ID in trash?
            const mappedGoogleId = localToGoogleMap[le.uid];
            if (trashedUids.has(le.uid) || (mappedGoogleId && trashedUids.has(mappedGoogleId))) {
                console.log(`[Debug] Skipping trashed local event: ${le.summary} (UID: ${le.uid}, Mapped: ${mappedGoogleId})`);
                return;
            }

            // Logic to include local event:
            // 1. Not already in Google list
            // 2. AND (Marked as FamilyOps OR has createdBy (user created) OR Source is missing (assume local))
            const isLocalSource = !le.source || le.source.includes('FamilyOps') || le.source.includes('Familjen');
            const isUserCreated = !!le.createdBy;

            if (!existsInGoogle && (isLocalSource || isUserCreated)) {
                allEvents.push(le);
            }
        });

        // NOTE: Sync-check for Google deletions removed - was causing issues with newly created events.
        // Manual refresh button still works to pull latest data from Google.
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

        // DEBUG: Log events for Jan 28 BEFORE dedupe
        const debugEvents = allEvents.filter(e => {
            if (!e.start) return false;
            const dateStr = (e.start instanceof Date) ? e.start.toISOString() : e.start;
            return dateStr.startsWith('2026-01-28') || dateStr.startsWith('2025-01-28');
        });
        if (debugEvents.length > 0) {
            const logLines = [`[Debug API] Jan 28 Events BEFORE dedupe: ${debugEvents.length}`];
            debugEvents.forEach(e => {
                logLines.push(`  - ${e.summary} (UID: ${e.uid}) Source: ${e.source} Assignees: ${e.assignees} InboxOnly: ${e.inboxOnly}`);
            });
            try {
                fs.writeFileSync(path.join(__dirname, 'debug_trace.txt'), logLines.join('\n'));
            } catch (err) { console.error('Failed to write debug trace', err); }
        }

        // ============ DEDUPLICATION (Mirror Sync) ============
        // Filter out source events (ICS) that have already been pushed to Google
        if (googleCalendar.isEnabled()) {
            const googleMap = googleCalendar.getAllMappings(); // Source UID -> Google ID

            // Create Set of Normalized UIDs (remove @google.com suffix which ical adds)
            // But ALSO include UIDs found directly in the API events (extendedProperties)
            const currentUids = new Set();

            // 1. Add Google IDs from current API events
            allEvents.forEach(e => {
                // Check all API sources
                if (e.originalSource === 'family_group_api' ||
                    e.originalSource === 'svante_api' ||
                    e.originalSource === 'sara_api') {

                    currentUids.add(e.uid.replace(/@google\.com$/, ''));

                    // 2. Add the Linked Source UID if present
                    if (e.linkedSourceUid) {
                        currentUids.add(e.linkedSourceUid);
                    }
                }
            });

            // FUZZY MATCHING & ENRICHMENT
            // 1. Create a map of "StartTime_Summary" -> Google API Event Object
            // This allows us to quickly find the API event that masks a source event
            const apiEventMap = new Map();

            // Helper to normalize summary for matching
            const normalizeSummary = (summary) => {
                if (!summary) return '';
                return summary
                    .toLowerCase()
                    .replace(/^[a-zåäö]+:\s+/, '') // Remove "Algot: " prefix
                    .replace(/\s+/g, ' ')          // Normalize whitespace
                    .trim();
            };

            allEvents.forEach(e => {
                if ((e.originalSource === 'family_group_api' ||
                    e.originalSource === 'svante_api' ||
                    e.originalSource === 'sara_api') && e.start) {

                    const time = new Date(e.start).getTime();
                    const cleanSummary = normalizeSummary(e.summary);
                    apiEventMap.set(`${time}_${cleanSummary}`, e);
                    // console.log(`[Dedupe] API event: ${time}_${cleanSummary}`);
                }
            });

            // 2. Iterate through NON-API events to find matches and enrich the API event
            allEvents.forEach(ev => {
                if (ev.originalSource !== 'family_group_api' &&
                    ev.originalSource !== 'svante_api' &&
                    ev.originalSource !== 'sara_api' &&
                    ev.start) {
                    // Check mapping
                    let apiEvent = null;

                    // By ID Map
                    if (googleMap[ev.uid] && currentUids.has(googleMap[ev.uid])) {
                        // Find the API event object with this Google ID
                        apiEvent = allEvents.find(e => e.uid.includes(googleMap[ev.uid]));
                    }
                    // By Fuzzy Match
                    else {
                        const time = new Date(ev.start).getTime();
                        const cleanSummary = normalizeSummary(ev.summary);
                        const signature = `${time}_${cleanSummary}`;
                        apiEvent = apiEventMap.get(signature);
                    }

                    if (apiEvent) {
                        // ENRICH THE API EVENT!
                        // Overlay the source from the specific feed so UI shows "HK Lidköping" instead of "Familjen"
                        apiEvent.source = ev.source;
                        apiEvent.isExternalSource = true; // Mark as external so it gets locked by default
                        // console.log(`[Dedupe] Enriched API event ${apiEvent.summary} with source: ${ev.source}`);
                    }
                }
            });

            const initialCount = allEvents.length; // Keep track for logging
            allEvents = allEvents.filter(ev => {
                // If this is an API event, always keep it (unless filtered by other rules)
                if (ev.originalSource === 'family_group_api' ||
                    ev.originalSource === 'svante_api' ||
                    ev.originalSource === 'sara_api') {
                    return true;
                }

                // EXEMPTION REMOVED: User-created events should NOT be exempt from deduplication. 
                // If they exist in Google, we want to show the Google version (or hide the local one).
                // if (ev.source === 'Familjen' || ev.source === 'FamilyOps' || ev.createdBy) {
                //    return true;
                // }

                // Check 1: Does this event map to a known Google Event ID that is currently present?
                if (googleMap[ev.uid] && currentUids.has(googleMap[ev.uid])) {
                    // console.log(`[Dedupe] Hiding mapped event: ${ev.summary} (Mapped to: ${googleMap[ev.uid]})`);
                    return false;
                }

                // Check 1b: ZOMBIE DETECTION (Ghost Events)
                // If event HAS a mapping, but the Google ID is NOT in currentUids, 
                // it means it was deleted from Google (or not fetched).
                // We should hide it unless it's very new (grace period for sync lag).
                if (googleMap[ev.uid] && !currentUids.has(googleMap[ev.uid])) {
                    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
                    const createdAt = ev.createdAt ? new Date(ev.createdAt).getTime() : 0;
                    const now = Date.now();

                    if (now - createdAt > STALE_THRESHOLD_MS) {
                        console.log(`[Dedupe] Hiding ZOMBIE event (Deleted in Google): ${ev.summary} (${ev.uid})`);
                        return false;
                    }
                }

                // Check 2: Is this event's UID directly present in the active set (via linkedSourceUid)?
                if (currentUids.has(ev.uid)) {
                    // console.log(`[Dedupe] Hiding event via Link: ${ev.summary} (UID: ${ev.uid})`);
                    return false;
                }

                // Check 3: FUZZY MATCH - Same time and similar title?
                if (ev.start) {
                    const time = new Date(ev.start).getTime();
                    const cleanSummary = normalizeSummary(ev.summary);
                    const signature = `${time}_${cleanSummary}`;

                    if (apiEventMap.has(signature)) {
                        // console.log(`[Dedupe] Hiding Fuzzily Matched event: ${ev.summary} (${ev.source})`);
                        return false;
                    }
                }

                // New Logic: If we rely fully on API for "Familjen",
                // and this event is destined for "Familjen" but comes from an ICS feed,
                // strictly speaking we wait for it to appear in API.

                return true;
            });

            const removed = initialCount - allEvents.length;
            if (removed > 0) {
                console.log(`[Dedupe] Hidden ${removed} duplicate source events (already in Google)`);
            }
        }

        // Filter out ignored/trashed events - BUT keep subscription events with isTrashed flag
        const ignoredEventIds = await readIgnoredEvents();
        const ignoredSet = new Set(ignoredEventIds);

        // "Ej aktuell" events are removed from ALL views (and from Google)
        // They go to papperskorgen and can be restored from there
        allEvents = allEvents.filter(e => {
            // Remove if in ignored list
            if (ignoredSet.has(e.uid)) return false;
            // Remove if linked source UID is ignored (for API events pushed from ICS)
            if (e.linkedSourceUid && ignoredSet.has(e.linkedSourceUid)) return false;
            return true;
        });

        // Filter out deleted events (unless includeTrash is true)
        if (!includeTrash) {
            allEvents = allEvents.filter(e => !e.deleted);
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
        console.error('Events fetch error:', error);
        try {
            fs.appendFileSync(path.join(__dirname, 'debug_crash.txt'), `[GET /api/events] ${new Date().toISOString()} - ${error.stack}\n`);
        } catch (e) { console.error('Failed to log crash', e); }
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
        const ignoredEvents = await readIgnoredEvents();
        const ignoredSet = new Set(ignoredEvents);

        const feedEvents = [];

        // Add Local Events (excluding deleted, but mark trashed as cancelled)
        localEvents.forEach(ev => {
            if (!ev.deleted) {
                if (ignoredSet.has(ev.uid)) {
                    feedEvents.push({ ...ev, cancelled: true });
                } else {
                    feedEvents.push(ev);
                }
            }
        });

        // Sport source IDs to include (same as sportochskola.ics)
        const sportSourceIds = [
            'villa_lidkoping_algot',
            'rada_bk_p2015',
            'rada_bk_f7',
            'hkl_p11_p10',
            'hkl_handbollsskola',
            'arsenal_fc',
            'ois_fotboll'
        ];

        // Add Auto-Approved External Events (from cache)
        // Also read approved inbox events
        const approvedEventIds = readApprovedEvents();
        const approvedSet = new Set(approvedEventIds);

        cachedCalendarEvents.forEach(ev => {
            const originCal = CALENDARS.find(c => c.name === ev.source || c.name === ev.originalSource);

            // Check if from sport source
            const isFromSportSource = originCal && sportSourceIds.includes(originCal.id);

            // Check if from inbox-only source that was auto-approved
            const isAutoApprovedInbox = originCal && originCal.inboxOnly && !ev.inboxOnly;

            // Include Vklass activities that are NOT lessons
            const isVklassActivity = (originCal?.id === 'vklass_skola' || originCal?.id === 'vklass_skola_tuva') && !ev.isLesson && !ev.scheduleOnly;

            // Check if user manually approved this inbox event
            const isUserApproved = approvedSet.has(ev.uid);

            if (isFromSportSource || isAutoApprovedInbox || isVklassActivity || isUserApproved) {
                if (!feedEvents.find(fe => fe.uid === ev.uid)) {
                    if (ignoredSet.has(ev.uid)) {
                        feedEvents.push({ ...ev, cancelled: true });
                    } else {
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

            // Add STATUS:CANCELLED for ignored/trashed events per RFC 5545
            if (ev.cancelled) {
                icsContent.push('STATUS:CANCELLED');
                icsContent.push('METHOD:CANCEL');
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

// Approve inbox event (marks it for feed.ics inclusion)
const APPROVED_EVENTS_FILE = path.join(DATA_DIR, 'approved_events.json');

function readApprovedEvents() {
    try {
        if (fs.existsSync(APPROVED_EVENTS_FILE)) {
            return JSON.parse(fs.readFileSync(APPROVED_EVENTS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Approved] Failed to read file:', e.message);
    }
    return [];
}

function writeApprovedEvents(data) {
    fs.writeFileSync(APPROVED_EVENTS_FILE, JSON.stringify(data, null, 2));
}

app.post('/api/approve-inbox', async (req, res) => {
    try {
        const { uid, event } = req.body;
        if (!uid) return res.status(400).json({ error: 'UID krävs' });

        console.log(`[Inbox] Approving event ${uid} for feed.ics and Google Calendar`);

        // Save UID to approved list (for feed.ics)
        const approved = readApprovedEvents();
        if (!approved.includes(uid)) {
            approved.push(uid);
            writeApprovedEvents(approved);
        }

        // Push to Google Calendar if API is enabled and event data provided
        let googleResult = null;
        if (googleCalendar.isEnabled() && event) {
            try {
                // Check if already in Google (avoid duplicates)
                const existingMapping = googleCalendar.getMapping(uid);

                if (existingMapping) {
                    console.log(`[Inbox] Event ${uid} already in Google (${existingMapping.googleEventId})`);
                } else {
                    const googleEvent = { ...event };

                    // Determine target calendar
                    const calendarId = googleCalendar.getTargetCalendarId(event.assignees);

                    // If pushing to the shared Family Calendar and we have a specific assignee,
                    // prefix the summary with their name so we can identify them later.
                    if (calendarId === googleCalendar.CALENDAR_CONFIG.familjen && event.assignees && event.assignees.length === 1) {
                        const assignee = event.assignees[0];
                        if (['Algot', 'Leon', 'Tuva'].includes(assignee)) {
                            googleEvent.summary = `${assignee}: ${googleEvent.summary}`;
                            console.log(`[Inbox] prefixed summary for Google: ${googleEvent.summary}`);
                        }
                    }

                    const createdEvent = await googleCalendar.createEvent(googleEvent);

                    if (createdEvent) {
                        await googleCalendar.saveMapping(uid, createdEvent.id, calendarId);
                        console.log(`[Inbox] Mirrored to Google & Map saved: ${uid} -> ${createdEvent.id}`);
                        googleResult = createdEvent;
                    }
                }
            } catch (err) {
                console.error('[Inbox] Google Mirror Log Error:', err);
                // Don't fail the approval if Google sync fails, but log it
            }
        }

        res.json({
            success: true,
            message: 'Händelse godkänd för kalendersynk',
            googlePushed: !!googleResult
        });
    } catch (error) {
        console.error('Approve inbox error:', error);
        res.status(500).json({ error: 'Kunde inte godkänna händelse' });
    }
});

// ============ TRASH / PAPPERSKORG ============

// Helper: Read trash from file
function readTrashFile() {
    try {
        if (fs.existsSync(TRASH_FILE)) {
            return JSON.parse(fs.readFileSync(TRASH_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Trash] Failed to read trash.json:', e.message);
    }
    return [];
}

// Helper: Write trash to file
function writeTrashFile(items) {
    try {
        fs.writeFileSync(TRASH_FILE, JSON.stringify(items, null, 2));
    } catch (e) {
        console.error('[Trash] Failed to write trash.json:', e.message);
    }
}

// Get all trashed events
app.get('/api/trash', async (req, res) => {
    try {
        // Return trash.json which now includes trashType
        const trashItems = readTrashFile();
        return res.json(trashItems);
    } catch (error) {
        console.error('Get trash error:', error);
        res.status(500).json({ error: 'Kunde inte hämta papperskorgen' });
    }
});

// Add event to trash
app.post('/api/trash', async (req, res) => {
    try {
        const { uid, summary, start, source } = req.body;
        if (!uid) return res.status(400).json({ error: 'UID krävs' });

        console.log(`[Trash] Adding event ${uid} to trash: "${summary}"`);
        console.log(`[Trash] DATA_DIR: ${DATA_DIR}, MongoDB: ${isMongoConnected() ? 'connected' : 'not connected'}`);

        // Add to ignored_events.json (for feed.ics filtering)
        const ignored = await readIgnoredEvents();
        console.log(`[Trash] Current ignored count: ${ignored.length}`);

        if (!ignored.includes(uid)) {
            ignored.push(uid);
            try {
                writeIgnoredEvents(ignored);
                console.log(`[Trash] Successfully wrote to ${IGNORED_EVENTS_FILE} (now ${ignored.length} events)`);
            } catch (writeError) {
                console.error(`[Trash] FAILED to write ignored_events.json:`, writeError);
                throw writeError;
            }
        } else {
            console.log(`[Trash] Event ${uid} already in ignored list`);
        }

        // Add to trash.json with full metadata
        const trashItems = readTrashFile();
        if (!trashItems.find(t => t.eventId === uid)) {
            trashItems.push({
                eventId: uid,
                summary: summary || 'Okänd händelse',
                start: start,
                source: source,
                trashType: 'not_relevant',
                trashedAt: new Date().toISOString()
            });
            writeTrashFile(trashItems);
            console.log(`[Trash] Added to trash.json with trashType: not_relevant`);
        }

        if (isMongoConnected()) {
            await addToTrash(uid, { summary, start, source });
            await addIgnoredEvent(uid); // Also add to ignored events in MongoDB
            console.log(`[Trash] Event ${uid} added to MongoDB ignored list`);
        }

        // DELETE from Google Calendar (not just cancel - actually remove it)
        let googleDeleted = false;
        if (googleCalendar.isEnabled()) {
            // Method 1: Try via mapping (for events we pushed from ICS feeds)
            const mapping = googleCalendar.getMapping(uid);
            if (mapping) {
                try {
                    await googleCalendar.deleteEvent(mapping.googleEventId, mapping.calendarId);
                    console.log(`[Trash] Event DELETED from Google via mapping: ${mapping.googleEventId}`);
                    googleDeleted = true;
                } catch (googleError) {
                    console.error('[Trash] Failed to delete from Google via mapping:', googleError.message);
                }
            }

            // Method 2: If UID is a Google Event ID (from API fetch), delete directly from all calendars
            if (!googleDeleted && uid && !uid.includes('@') && uid.length > 10) {
                const calendarsToTry = [
                    { id: googleCalendar.CALENDAR_CONFIG.familjen, name: 'Familjen' },
                    { id: googleCalendar.CALENDAR_CONFIG.svante, name: 'Svante' },
                    { id: googleCalendar.CALENDAR_CONFIG.sarah, name: 'Sarah' }
                ].filter(c => c.id); // Only try calendars that are configured

                for (const cal of calendarsToTry) {
                    if (googleDeleted) break;
                    try {
                        console.log(`[Trash] Trying to delete Google Event ID ${uid} from ${cal.name}...`);
                        await googleCalendar.deleteEvent(uid, cal.id);
                        console.log(`[Trash] Event DELETED from ${cal.name} calendar`);
                        googleDeleted = true;
                    } catch (deleteError) {
                        // 404 = not in this calendar, try next
                        if (!deleteError.message?.includes('404')) {
                            console.error(`[Trash] Delete from ${cal.name} failed:`, deleteError.message);
                        }
                    }
                }
            }

            // Method 3: For events with @google.com suffix (from ICS feeds pointing to Google)
            if (!googleDeleted && uid && uid.includes('@google.com')) {
                const eventId = uid.replace(/@google\.com$/, '');
                const calendarsToTry = [
                    { id: googleCalendar.CALENDAR_CONFIG.familjen, name: 'Familjen' },
                    { id: googleCalendar.CALENDAR_CONFIG.svante, name: 'Svante' },
                    { id: googleCalendar.CALENDAR_CONFIG.sarah, name: 'Sarah' }
                ].filter(c => c.id);

                for (const cal of calendarsToTry) {
                    if (googleDeleted) break;
                    try {
                        console.log(`[Trash] Trying to delete ${eventId} from ${cal.name}...`);
                        await googleCalendar.deleteEvent(eventId, cal.id);
                        console.log(`[Trash] Event DELETED from ${cal.name} calendar`);
                        googleDeleted = true;
                    } catch (deleteError) {
                        if (!deleteError.message?.includes('404')) {
                            console.error(`[Trash] Delete from ${cal.name} failed:`, deleteError.message);
                        }
                    }
                }
            }

            if (!googleDeleted) {
                console.log(`[Trash] Event ${uid} could not be deleted from any Google Calendar`);
            }
        }

        // Invalidate cache for instant UI refresh
        cacheTimestamp = 0;
        console.log(`[Trash] SUCCESS - Event "${summary}" marked as ej aktuell (Google deleted: ${googleDeleted})`);
        console.log('[Trash] Cache invalidated for instant refresh');
        res.json({ success: true, message: 'Händelse flyttad till papperskorgen', googleDeleted });
    } catch (error) {
        console.error('[Trash] ERROR:', error);
        res.status(500).json({ error: 'Kunde inte ta bort händelse: ' + error.message });
    }
});

// Permanently delete from trash (and local storage)
app.delete('/api/trash/:uid/permanent', async (req, res) => {
    try {
        const { uid } = req.params;
        if (!uid) return res.status(400).json({ error: 'UID krävs' });

        console.log(`[Trash] Permanently deleting event ${uid}`);

        // 1. Remove from trash.json
        const trashItems = readTrashFile();
        const updatedTrash = trashItems.filter(t => t.eventId !== uid);
        writeTrashFile(updatedTrash);

        // 2. Remove from local_events.json (if it exists)
        const localEvents = await readLocalEvents();
        const updatedLocal = localEvents.filter(e => e.uid !== uid);
        if (localEvents.length !== updatedLocal.length) {
            await writeLocalEvents(updatedLocal);
            console.log(`[Trash] Removed ${uid} from local_events.json`);
        }

        // 3. DO NOT remove from ignored_events.json (we want to keep ignoring it from feeds)

        if (isMongoConnected()) {
            await removeFromTrash(uid);
            // Optionally remove from MongoDB local events if you sync them
        }

        res.json({ success: true, message: 'Händelse permanent borttagen' });
    } catch (error) {
        console.error('[Trash] Permanent delete error:', error);
        res.status(500).json({ error: 'Kunde inte ta bort händelse permanent' });
    }
});

// Restore event from trash
app.delete('/api/trash/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        if (!uid) return res.status(400).json({ error: 'UID krävs' });

        console.log(`[Trash] Restoring event ${uid} from trash`);

        // Remove from ignored_events.json
        const ignored = await readIgnoredEvents();
        const updatedIgnored = ignored.filter(id => id !== uid);
        writeIgnoredEvents(updatedIgnored);

        // Remove from trash.json
        const trashItems = readTrashFile();
        const updatedTrash = trashItems.filter(t => t.eventId !== uid);
        writeTrashFile(updatedTrash);

        if (isMongoConnected()) {
            await removeFromTrash(uid);
        }

        // Clear cancelled flag in local_events.json
        const localEvents = await readLocalEvents();
        const localEvent = localEvents.find(e => e.uid === uid);
        if (localEvent) {
            localEvent.cancelled = false;
            localEvent.deleted = false;
            delete localEvent.deletedAt;
            await writeLocalEvents(localEvents);
            console.log(`[Trash] Cleared cancelled/deleted flags for ${uid}`);
        }

        // RE-CREATE in Google Calendar (since we deleted it when cancelling)
        let googleRecreated = false;
        if (googleCalendar.isEnabled() && localEvent && localEvent.cancelledEventData) {
            try {
                const eventData = localEvent.cancelledEventData;
                console.log(`[Trash] Re-creating event in Google Calendar: ${eventData.summary}`);

                // Build Google event object
                const googleEvent = {
                    summary: eventData.summary,
                    start: eventData.start,
                    end: eventData.end,
                    location: eventData.location || '',
                    description: eventData.description || ''
                };

                // Determine target calendar
                const calendarId = googleCalendar.getTargetCalendarId(eventData.assignees);

                // Create the event
                const createdEvent = await googleCalendar.createEvent(googleEvent, calendarId);

                if (createdEvent) {
                    await googleCalendar.saveMapping(uid, createdEvent.id, calendarId);
                    console.log(`[Trash] Event re-created in Google Calendar: ${createdEvent.id}`);
                    googleRecreated = true;
                }

                // Clear the cancelledEventData since it's been restored
                delete localEvent.cancelledEventData;
                await writeLocalEvents(localEvents);
            } catch (googleError) {
                console.error('[Trash] Failed to re-create in Google:', googleError.message);
            }
        } else if (googleCalendar.isEnabled()) {
            console.log(`[Trash] No cancelledEventData found for ${uid}, cannot re-create in Google`);
        }

        // Invalidate cache for instant UI refresh
        cacheTimestamp = 0;
        console.log(`[Trash] SUCCESS - Event restored from trash`);
        console.log('[Trash] Cache invalidated for instant refresh');
        res.json({ success: true, message: 'Händelse återställd', googleRecreated });
    } catch (error) {
        console.error('Restore from trash error:', error);
        res.status(500).json({ error: 'Kunde inte återställa händelse' });
    }
});

// Cancel event (DELETE from Google, show strikethrough locally)
app.post('/api/cancel-event', async (req, res) => {
    try {
        const { uid, summary, source, start, end, location, description, assignees } = req.body;
        if (!uid) return res.status(400).json({ error: 'UID krävs' });

        console.log(`[Cancel] Marking event ${uid} as cancelled and deleting from Google`);

        // Store full event data in local_events for potential restore
        const localEvents = await readLocalEvents();
        const existing = localEvents.find(e => e.uid === uid);
        if (existing) {
            existing.cancelled = true;
            // Store event data for restore
            existing.cancelledEventData = { summary, start, end, location, description, assignees, source };
        } else {
            localEvents.push({
                uid,
                cancelled: true,
                cancelledEventData: { summary, start, end, location, description, assignees, source }
            });
        }
        await writeLocalEvents(localEvents);

        // DELETE from Google Calendar
        let googleDeleted = false;
        if (googleCalendar.isEnabled()) {
            // First try via mapping (for events we pushed)
            const mapping = googleCalendar.getMapping(uid);
            if (mapping) {
                try {
                    await googleCalendar.deleteEvent(mapping.googleEventId, mapping.calendarId);
                    console.log(`[Cancel] Event deleted from Google via mapping: ${mapping.googleEventId}`);
                    googleDeleted = true;
                } catch (googleError) {
                    console.error('[Cancel] Failed to delete from Google via mapping:', googleError.message);
                }
            }

            // For events from personal calendars (Svante/Sarah/Family) - delete directly
            if (!googleDeleted && source && (source.toLowerCase().includes('svante') || source.toLowerCase().includes('sarah') || source.toLowerCase().includes('familje') || source.toLowerCase().includes('örtendahl'))) {
                try {
                    const eventId = uid.replace(/@google.com$/, '');
                    let calendarId = null;

                    // Determine calendar from source
                    if (source.toLowerCase().includes('svante')) {
                        calendarId = googleCalendar.CALENDAR_CONFIG.svante;
                    } else if (source.toLowerCase().includes('sarah')) {
                        calendarId = googleCalendar.CALENDAR_CONFIG.sarah;
                    } else if (source.toLowerCase().includes('familje') || source.toLowerCase().includes('örtendahl')) {
                        calendarId = googleCalendar.CALENDAR_CONFIG.familjen;
                    }

                    if (calendarId) {
                        console.log(`[Cancel] Trying direct delete for personal calendar event: ${eventId} in ${calendarId}`);
                        await googleCalendar.deleteEvent(eventId, calendarId);
                        googleDeleted = true;
                        console.log(`[Cancel] Event deleted from personal calendar`);
                    }
                } catch (directError) {
                    console.error('[Cancel] Direct delete failed:', directError.message);
                }
            }

            // Fallback: If UID looks like a Google Event ID, try to delete from family calendar
            // This handles auto-pushed events that may not have mappings or matching source patterns
            if (!googleDeleted && uid && !uid.includes('@') && uid.length > 10) {
                try {
                    console.log(`[Cancel] Trying fallback delete for Google Event ID: ${uid}`);
                    await googleCalendar.deleteEvent(uid, googleCalendar.CALENDAR_CONFIG.familjen);
                    googleDeleted = true;
                    console.log(`[Cancel] Event deleted from family calendar via fallback`);
                } catch (fallbackError) {
                    console.error('[Cancel] Fallback delete failed:', fallbackError.message);
                }
            }
        }

        // Invalidate cache for instant UI refresh
        cacheTimestamp = 0;
        console.log('[Cancel] Cache invalidated for instant refresh');
        res.json({ success: true, message: 'Händelse markerad som ej aktuell', googleDeleted });
    } catch (error) {
        console.error('[Cancel] ERROR:', error);
        res.status(500).json({ error: 'Kunde inte markera händelse som ej aktuell' });
    }
});

// Delete event permanently (remove from Google Calendar)
// Delete event permanently (remove from Google Calendar)
app.post('/api/delete-event', async (req, res) => {
    try {
        const { uid, summary, start, source } = req.body;
        if (!uid) return res.status(400).json({ error: 'UID krävs' });

        console.log(`[Delete] Permanently deleting event ${uid}`);

        // Mark as deleted in local storage (for trash view)
        const localEvents = await readLocalEvents();
        const existing = localEvents.find(e => e.uid === uid);
        if (existing) {
            existing.deleted = true;
            existing.deletedAt = new Date().toISOString();
        } else {
            localEvents.push({
                uid,
                deleted: true,
                deletedAt: new Date().toISOString(),
                summary,
                start,
                source
            });
        }
        await writeLocalEvents(localEvents);

        // Add to trash.json for trash view
        const trashItems = readTrashFile();
        if (!trashItems.find(t => t.eventId === uid)) {
            trashItems.push({
                eventId: uid,
                summary: summary || 'Okänd händelse',
                start: start,
                source: source,
                trashType: 'deleted',
                trashedAt: new Date().toISOString()
            });
            writeTrashFile(trashItems);
        }

        // DELETE from Google Calendar (permanent)
        let googleDeleted = false;
        if (googleCalendar.isEnabled()) {
            // 1. Try via mapping (for events we pushed from ICS feeds or created locally)
            const mapping = googleCalendar.getMapping(uid);
            if (mapping) {
                try {
                    await googleCalendar.deleteEvent(mapping.googleEventId, mapping.calendarId);
                    console.log(`[Delete] Event deleted from Google via mapping: ${mapping.googleEventId}`);
                    // Remove mapping since it's gone
                    googleCalendar.removeMapping(uid);
                    googleDeleted = true;
                } catch (googleError) {
                    console.error('[Delete] Failed to delete from Google via mapping:', googleError.message);
                }
            }

            // 1.5. Fallback: Search for event by Extended Property (familjecentralenUid)
            // This catches cases where mapping is lost but event exists in Google with our UID
            if (!googleDeleted) {
                const calendarsToSearch = [
                    googleCalendar.CALENDAR_CONFIG.familjen,
                    googleCalendar.CALENDAR_CONFIG.svante,
                    googleCalendar.CALENDAR_CONFIG.sarah
                ].filter(c => c);

                for (const calId of calendarsToSearch) {
                    if (googleDeleted) break;
                    try {
                        const foundEvent = await googleCalendar.findEventByUid(uid, calId);
                        if (foundEvent) {
                            console.log(`[Delete] Found lost event in Google (${calId}) via extended property. Deleting ID: ${foundEvent.id}`);
                            const success = await googleCalendar.deleteEvent(foundEvent.id, calId);
                            if (success) {
                                googleDeleted = true;
                                // Restore mapping momentarily just to ensure it's clean (optional, but good practice if we had it)
                            }
                        }
                    } catch (searchError) {
                        console.error('[Delete] Search fallback failed:', searchError.message);
                    }
                }
            }

            // 2. Fallback: If UID looks like a Google Event ID (no @, long string), delete directly
            // This handles events that were pulled FROM Google (where uid = google event id)
            if (!googleDeleted && uid && !uid.includes('@') && uid.length > 10) {
                const calendarsToTry = [
                    googleCalendar.CALENDAR_CONFIG.familjen,
                    googleCalendar.CALENDAR_CONFIG.svante,
                    googleCalendar.CALENDAR_CONFIG.sarah
                ].filter(c => c);

                for (const calId of calendarsToTry) {
                    if (googleDeleted) break;
                    try {
                        console.log(`[Delete] Trying direct delete from calendar ${calId}...`);
                        const wasDeleted = await googleCalendar.deleteEvent(uid, calId);

                        if (wasDeleted) {
                            console.log(`[Delete] Event deleted from Google directly (${calId})`);
                            googleDeleted = true;
                        } else {
                            console.log(`[Delete] Could not delete from ${calId} (not found or error)`);
                        }
                    } catch (deleteError) {
                        // Ignore 404 (not found in this calendar)
                        if (!deleteError.message?.includes('404')) {
                            console.error(`[Delete] Direct delete failed type:`, deleteError.message);
                        }
                    }
                }
            }
        }

        res.json({ success: true, message: 'Händelse borttagen', googleDeleted });
    } catch (error) {
        console.error(`[Delete] ERROR for UID ${req.body.uid}:`, error.message);
        if (error.response) {
            console.error('[Delete] Google API Error:', JSON.stringify(error.response.data));
        }
        res.status(500).json({ error: 'Kunde inte ta bort händelse' });
    }
});

// Ignore inbox event (don't add to Google, just mark as ignored)
app.post('/api/ignore-inbox', async (req, res) => {
    try {
        const { uid, summary, start, source } = req.body;
        if (!uid) return res.status(400).json({ error: 'UID krävs' });

        console.log(`[Ignore] Ignoring inbox event ${uid}`);

        // Add to ignored_events.json
        const ignored = await readIgnoredEvents();
        if (!ignored.includes(uid)) {
            ignored.push(uid);
            writeIgnoredEvents(ignored);
        }

        // Add to trash.json for trash view
        const trashItems = readTrashFile();
        if (!trashItems.find(t => t.eventId === uid)) {
            trashItems.push({
                eventId: uid,
                summary: summary || 'Okänd händelse',
                start: start,
                source: source,
                trashType: 'ignored',
                trashedAt: new Date().toISOString()
            });
            writeTrashFile(trashItems);
        }

        res.json({ success: true, message: 'Händelse ignorerad' });
    } catch (error) {
        console.error('[Ignore] ERROR:', error);
        res.status(500).json({ error: 'Kunde inte ignorera händelse' });
    }
});



// V6.0: Seen Events Logic
const SEEN_EVENTS_FILE = path.join(DATA_DIR, 'seen_events.json');

const readSeenEventsSync = (username) => {
    if (!fs.existsSync(SEEN_EVENTS_FILE)) return [];
    try {
        const data = JSON.parse(fs.readFileSync(SEEN_EVENTS_FILE, 'utf8'));
        return data[username] || []; // Returns array of UIDs
    } catch { return []; }
};

const addSeenEventSync = (username, uid) => {
    let data = {};
    if (fs.existsSync(SEEN_EVENTS_FILE)) {
        try { data = JSON.parse(fs.readFileSync(SEEN_EVENTS_FILE, 'utf8')); } catch { /* ignore */ }
    }
    if (!data[username]) data[username] = [];
    if (!data[username].includes(uid)) {
        data[username].push(uid);
        fs.writeFileSync(SEEN_EVENTS_FILE, JSON.stringify(data, null, 2));
    }
};

const markAllSeenSync = (username, uids) => {
    let data = {};
    if (fs.existsSync(SEEN_EVENTS_FILE)) {
        try { data = JSON.parse(fs.readFileSync(SEEN_EVENTS_FILE, 'utf8')); } catch { /* ignore */ }
    }
    // Merge new UIDs
    const existing = new Set(data[username] || []);
    uids.forEach(uid => existing.add(uid));
    data[username] = Array.from(existing);
    fs.writeFileSync(SEEN_EVENTS_FILE, JSON.stringify(data, null, 2));
};

// V6.0: New Events API

// Sources/Keywords to exclude from notifications (Spam filter)
const IGNORED_NOTIFICATION_SOURCES = ['Arsenal', 'ÖIS', 'Örgryte', 'Superettan'];

app.get('/api/new-events', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: 'Username required' });

        const allEvents = await fetchAndCacheCalendars(); // Get fresh/cached data
        const seenIds = new Set(readSeenEventsSync(username));

        // V6.0 MIGRATION LOGIC:
        // If user has NO seen history (first run after update), assume everything is seen.
        // This prevents showing 1000+ old events as "new".
        if (seenIds.size === 0) {
            console.log(`[Migration] First run for user '${username}'. Marking all ${allEvents.length} events as seen.`);
            const allUids = allEvents.map(e => e.uid);
            markAllSeenSync(username, allUids);
            return res.json([]); // Start fresh
        }

        // Filter helper
        const shouldNotify = (e) => {
            // Basic checks
            if (seenIds.has(e.uid)) return false;
            if (e.deleted || e.cancelled) return false;

            const textToCheck = ((e.source || '') + (e.summary || '')).toLowerCase();

            // 1. Check general ignored sources (Arsenal, ÖIS etc)
            if (IGNORED_NOTIFICATION_SOURCES.some(s => textToCheck.includes(s.toLowerCase()))) return false;

            // 2. Special logic for Vklass: Ignore schedule lessons
            // The backend already marks lessons with isLesson=true based on regex (e.g. ma12a)
            if (e.isLesson) return false;

            return true;
        };

        const newEvents = allEvents.filter(shouldNotify);

        res.json(newEvents);
    } catch (e) {
        console.error("Error fetching new events:", e);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/mark-seen', (req, res) => {
    const { username, uid } = req.body;
    if (!username || !uid) return res.status(400).json({ error: 'Missing fields' });
    addSeenEventSync(username, uid);
    res.json({ success: true });
});

app.post('/api/mark-all-seen', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing fields' });

    try {
        // We mark ALL CURRENTLY VISIBLE events as seen
        const allEvents = await fetchAndCacheCalendars();
        const uids = allEvents.map(e => e.uid);
        markAllSeenSync(username, uids);
        res.json({ success: true });
    } catch (e) {
        console.error("Mark all seen error:", e);
        res.status(500).json({ error: 'Failed' });
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
    } catch {
        res.status(500).json({ error: 'Kunde inte hämta papperskorgen' });
    }
});

app.post('/api/create-event', async (req, res) => {
    const { summary, location, coords, start, end, description, createdBy, assignee, assignees, category, assignments, recurrence } = req.body;

    if (!summary || !start) {
        return res.status(400).json({ error: 'Titel och starttid krävs' });
    }

    try {
        fs.appendFileSync(path.join(__dirname, 'debug_log.txt'), `[CreateEvent] Received recurrence: ${recurrence}\n`);
    } catch { /* ignore */ }

    console.log('[CreateEvent] Received recurrence:', recurrence);

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
            assignments: assignments || {}, // Save assignments
            category: category || null,
            todoList: [],
            createdBy,
            createdAt: new Date().toISOString(),
            // CRITICAL: Set source so it survives filter in GET /api/events
            source: 'Familjen',
            deleted: false,
            cancelled: false,
            recurrence: recurrence || null // Save recurrence RRULE
        };

        // Save to MongoDB if connected
        if (isMongoConnected()) {
            await createLocalEvent(newEvent);
        }

        events.push(newEvent);
        await writeLocalEvents(events);

        // Also create in Google Calendar via API
        let googleResult = null;
        if (googleCalendar.isEnabled()) {
            try {
                const googleEvent = { ...newEvent };

                // Determine target calendar based on assignees
                const calendarId = googleCalendar.getTargetCalendarId(newEvent.assignees);

                // If pushing to Family Calendar with single child assignee, prefix with their name
                // But ONLY if the summary doesn't already start with their name (to prevent double prefix)
                if (calendarId === googleCalendar.CALENDAR_CONFIG.familjen && newEvent.assignees && newEvent.assignees.length === 1) {
                    const assignee = newEvent.assignees[0];
                    if (['Algot', 'Leon', 'Tuva'].includes(assignee)) {
                        const prefixPattern = new RegExp(`^${assignee}:\\s*`, 'i');
                        if (!prefixPattern.test(googleEvent.summary)) {
                            googleEvent.summary = `${assignee}: ${googleEvent.summary}`;
                            console.log(`[CreateEvent] Prefixed summary for Google: ${googleEvent.summary}`);
                        } else {
                            console.log(`[CreateEvent] Summary already has prefix, skipping: ${googleEvent.summary}`);
                        }
                    }
                }

                const createdEvent = await googleCalendar.createEvent(googleEvent);

                if (createdEvent) {
                    await googleCalendar.saveMapping(newEvent.uid, createdEvent.id, calendarId);
                    console.log(`[CreateEvent] Created in Google Calendar: ${newEvent.summary} -> ${createdEvent.id}`);
                    googleResult = createdEvent;
                }
            } catch (err) {
                console.error('[CreateEvent] Failed to create in Google Calendar:', err.message);
                // Don't fail the local creation if Google sync fails
            }
        }

        // Invalidate cache for instant UI refresh
        cacheTimestamp = 0;
        console.log('[CreateEvent] Cache invalidated for instant refresh');

        res.json({ success: true, event: newEvent, googlePushed: !!googleResult });
    } catch (error) {
        console.error('Events fetch error:', error);
        try {
            fs.appendFileSync(path.join(__dirname, 'debug_crash.txt'), `${new Date().toISOString()} - ${error.stack}\n`);
        } catch (e) { console.error('Failed to log crash', e); }
        res.status(500).json({ error: 'Kunde inte hämta händelser' });
    }
});

app.post('/api/update-event', async (req, res) => {
    const { uid, summary, location, coords, start, end, description, todoList, cancelled, assignments, assignee, assignees, category, source } = req.body;

    try {
        let events = await readLocalEvents();
        const existingIndex = events.findIndex(e => e.uid === uid);

        console.log('Update Event called for:', uid);

        // Check if event is cancelled (skip Google sync for cancelled events)
        const existingEvent = events[existingIndex];
        const isCancelled = cancelled || (existingEvent && existingEvent.cancelled);

        // ============ GOOGLE CALENDAR SYNC ============
        // Skip sync for cancelled events - they should be deleted, not updated
        if (googleCalendar.isEnabled() && !isCancelled) {
            try {
                let googleId = null;
                let calendarId = googleCalendar.CALENDAR_CONFIG.familjen; // Default

                // 1. Check if mapped (ICS -> Google)
                const mapping = googleCalendar.getMapping(uid);
                if (mapping) {
                    googleId = mapping.googleEventId;
                    calendarId = mapping.calendarId;
                }
                // 2. Check if it's a direct Google API event (UID ends with @google.com)
                else if (uid.includes('@google.com')) {
                    googleId = uid.replace(/@google\.com$/, '');
                }
                // 3. Fallback: Assume it's a raw Google ID if it looks like one
                else if (!uid.includes('@') && uid.length > 5) { // Simple heuristic
                    googleId = uid;
                }

                if (googleId) {
                    console.log(`[Update] Pushing changes to Google Calendar (ID: ${googleId}, Cal: ${calendarId})...`);
                    await googleCalendar.updateEvent(googleId, {
                        summary,
                        location,
                        description,
                        start: { dateTime: start, timeZone: 'Europe/Stockholm' },
                        end: { dateTime: end, timeZone: 'Europe/Stockholm' }
                    }, calendarId);
                }
            } catch (syncError) {
                console.error('[Update] Google Sync Failed:', syncError.message);
                // We optimize for UX: Continue to update local shadow so user sees change immediately
            }
        } else if (isCancelled) {
            console.log(`[Update] Skipping Google sync for cancelled event: ${uid}`);
        }
        // ==============================================

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
                assignments: assignments || events[existingIndex].assignments || { driver: null, packer: null },
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
                assignments: assignments || { driver: null, packer: null },
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

        // Invalidate cache for instant UI refresh
        cacheTimestamp = 0;
        console.log('[Update] Cache invalidated for instant refresh');

        res.json({ success: true });
    } catch (error) {
        console.error('Update event error:', error);
        res.status(500).json({ error: 'Kunde inte uppdatera händelse' });
    }
});

app.post('/api/restore-event', async (req, res) => {
    const { uid } = req.body;
    console.log(`[Restore] Request received for UID: ${uid}`);

    try {
        let events = await readLocalEvents();
        const existingIndex = events.findIndex(e => e.uid === uid);

        let oldEvent = null;

        if (existingIndex >= 0) {
            oldEvent = events[existingIndex];
        } else {
            // Fallback: Check in trash.json
            const trashItems = readTrashFile();
            const trashItem = trashItems.find(t => t.eventId === uid);
            if (trashItem) {
                console.log(`[Restore] Found event in trash.json: ${uid}`);

                // Handle missing end date - default to start + 1 hour
                let endDate = trashItem.end;
                if (!endDate && trashItem.start) {
                    const startMs = new Date(trashItem.start).getTime();
                    endDate = new Date(startMs + 60 * 60 * 1000).toISOString(); // +1 hour
                    console.log(`[Restore] Missing end date, defaulting to: ${endDate}`);
                }

                oldEvent = {
                    ...trashItem,
                    uid: trashItem.eventId,
                    source: trashItem.source || 'Papperskorgen',
                    summary: trashItem.summary || 'Återställd händelse',
                    start: trashItem.start,
                    end: endDate
                };
            }
        }

        if (oldEvent) {
            // 1. Create Fresh Event (Clone)
            const newUid = uuidv4();
            const newEvent = {
                ...oldEvent,
                uid: newUid,
                deleted: false,
                cancelled: false,
                source: 'Örtendahls familjekalender',
                originalSource: oldEvent.source || 'Återställd',
                createdBy: 'restored',
                description: `Återställd från: ${oldEvent.summary}\nKälla: ${oldEvent.source || 'Okänd'}`,
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            // Cleanup internal fields
            delete newEvent.deletedAt;
            delete newEvent._id;

            console.log(`[Restore] Cloning event ${uid} -> ${newUid}`);

            // 2. Migrate Assignments (Database)
            const db = await readDb();
            if (db[uid]) {
                db[newUid] = { ...db[uid] };
                await writeDb(newUid, db[newUid]);
                console.log(`[Restore] Migrated assignments to new UID`);
            }

            // 3. Google Calendar Sync (Create as NEW)
            if (googleCalendar.isEnabled()) {
                try {
                    // Date validation
                    const sDate = new Date(newEvent.start);
                    const eDate = new Date(newEvent.end);

                    if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
                        console.warn(`[Restore] Invalid dates for Google Sync: ${newEvent.start} - ${newEvent.end}`);
                    } else {
                        const googleEvent = await googleCalendar.createEvent(newEvent);
                        if (googleEvent) {
                            await googleCalendar.saveMapping(newUid, googleEvent.id, googleCalendar.getTargetCalendarId(newEvent.assignees));
                            console.log(`[Restore] Created new event in Google Calendar: ${googleEvent.id}`);
                        }
                    }
                } catch (googleError) {
                    console.error('[Restore] Failed to sync to Google:', googleError.message);
                }
            }

            // 4. Persistence
            // Add new
            events.push(newEvent);
            if (isMongoConnected()) {
                await createLocalEvent(newEvent);
            }

            // Remove old (Hard delete from list) IF it existed locally
            if (existingIndex >= 0) {
                events.splice(existingIndex, 1);
                if (isMongoConnected()) {
                    await deleteLocalEvent(uid);
                }
            }

            // Always remove from trash (DB and File)
            if (isMongoConnected()) {
                await removeFromTrash(uid);
            }
            const trashItems = readTrashFile();
            const newTrashItems = trashItems.filter(t => t.eventId !== uid);
            writeTrashFile(newTrashItems);

            await writeLocalEvents(events);

            // Invalidate cache
            cacheTimestamp = 0;

            res.json({ success: true, newUid });
            return;
        }

        // Not found
        res.status(404).json({ error: 'Event not found in local db' });

    } catch (error) {
        console.error('RESTORE CRASH DIAGNOSTIC:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'CRITCAL ERROR: ' + error.message });
        }
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

// ============ GOOGLE CALENDAR API ============
app.get('/api/test-google-calendar', async (req, res) => {
    try {
        const result = await googleCalendar.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

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

    // ============ MIGRATION: Clean up subscription events from local_events ============
    // Subscription events should NEVER be stored locally - they come from ICS feeds
    // This removes any subscription events that were incorrectly saved locally
    try {
        console.log('[Migration] Cleaning up local_events.json...');
        const localEvents = await readLocalEvents();
        const originalCount = localEvents.length;

        // Filter out events that are from subscription sources (should not be local)
        const isSubscriptionUid = (uid) => {
            if (!uid) return false;
            return uid.includes('@laget.se') ||
                uid.includes('@sportadmin') ||
                uid.includes('vklass') ||
                uid.includes('@maak-agenda.nl');
        };

        const cleanedEvents = localEvents.filter(event => {
            // Remove subscription events - they should come from ICS, not local storage
            if (isSubscriptionUid(event.uid)) {
                console.log(`[Migration] Removing subscription event: ${event.uid?.substring(0, 40)}`);
                return false;
            }
            // Also remove events with cancelled flag that are in ignored list
            if (event.cancelled === true) {
                const ignoredEvents = readIgnoredEventsSync();
                if (ignoredEvents.includes(event.uid)) {
                    console.log(`[Migration] Removing cancelled event: ${event.uid?.substring(0, 40)}`);
                    return false;
                }
            }
            return true;
        });

        const removedCount = originalCount - cleanedEvents.length;
        if (removedCount > 0) {
            await writeLocalEvents(cleanedEvents);
            console.log(`[Migration] Removed ${removedCount} subscription/cancelled events from local_events.json`);
        } else {
            console.log('[Migration] No subscription events to clean');
        }

        // Always clear the calendar cache to force fresh fetch
        if (fs.existsSync(CACHE_FILE)) {
            fs.unlinkSync(CACHE_FILE);
            console.log('[Migration] Cleared calendar cache for fresh data');
        }
    } catch (migrationError) {
        console.error('[Migration] Error during cleanup:', migrationError);
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Family Ops Backend körs på http://0.0.0.0:${PORT}`);
        console.log(`MongoDB status: ${isMongoConnected() ? 'CONNECTED ✓' : 'NOT CONNECTED (using files)'}`);
        console.log(`Google Calendar API: ${googleCalendar.isEnabled() ? 'ENABLED ✓' : 'DISABLED (no credentials)'}`);
        console.log(`DATA_DIR: ${DATA_DIR}`);

        // Log ignored events count
        const ignoredCount = readIgnoredEventsSync().length;
        console.log(`Ignored events: ${ignoredCount} events in ignored_events.json`);

        // Start the background calendar refresh scheduler
        startScheduledRefresh();
    });
}

startServer();
// Trigger restart
