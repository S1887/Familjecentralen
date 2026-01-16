/**
 * Google Calendar API Integration for Familjecentralen
 * 
 * Uses Service Account authentication to push events directly to Google Calendar.
 * This replaces the slow feed.ics subscription approach with direct API calls.
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calendar IDs configuration - loaded lazily to ensure env vars are set first
let _calendarConfig = null;

function getCalendarConfig() {
    if (!_calendarConfig) {
        _calendarConfig = {
            svante: process.env.CALENDAR_SVANTE || '',
            sarah: process.env.CALENDAR_SARAH || '',
            familjen: process.env.CALENDAR_FAMILY || ''
        };
        console.log('[GoogleCalendar] Config loaded:', {
            svante: _calendarConfig.svante ? '✓ set' : '✗ empty',
            sarah: _calendarConfig.sarah ? '✓ set' : '✗ empty',
            familjen: _calendarConfig.familjen ? '✓ set' : '✗ empty'
        });
    }
    return _calendarConfig;
}

// For backwards compatibility, expose as getter
const CALENDAR_CONFIG = new Proxy({}, {
    get(target, prop) {
        return getCalendarConfig()[prop];
    }
});

// Path to credentials file (set via environment variable or config)
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, 'credentials', 'google-service-account.json');

// Path to UID mapping file (source UID → Google Event ID)
// Use /data/ in HA environment for persistence across container restarts
const HA_DATA_DIR = '/data';
const MAP_PATH = fs.existsSync(HA_DATA_DIR)
    ? path.join(HA_DATA_DIR, 'google_event_map.json')
    : path.join(__dirname, 'google_event_map.json');

let authClient = null;
let calendarClient = null;

// ============ UID MAPPING FUNCTIONS ============

/**
 * Read the event mapping file
 * Maps: source UID → { googleEventId, calendarId, lastUpdated }
 */
function readEventMap() {
    try {
        if (fs.existsSync(MAP_PATH)) {
            return JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
        }
    } catch (error) {
        console.error('[GoogleCalendar] Error reading event map:', error.message);
    }
    return {};
}

/**
 * Write the event mapping file
 */
function writeEventMap(map) {
    try {
        fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
    } catch (error) {
        console.error('[GoogleCalendar] Error writing event map:', error.message);
    }
}

/**
 * Save a mapping from source UID to Google Event ID
 */
function saveMapping(sourceUid, googleEventId, calendarId) {
    const map = readEventMap();
    map[sourceUid] = {
        googleEventId,
        calendarId,
        lastUpdated: new Date().toISOString()
    };
    writeEventMap(map);
    console.log(`[GoogleCalendar] Saved mapping: ${sourceUid} → ${googleEventId}`);
}

/**
 * Get Google Event ID from source UID
 */
function getMapping(sourceUid) {
    const map = readEventMap();
    return map[sourceUid] || null;
}

/**
 * Remove a mapping
 */
function removeMapping(sourceUid) {
    const map = readEventMap();
    if (map[sourceUid]) {
        delete map[sourceUid];
        writeEventMap(map);
        console.log(`[GoogleCalendar] Removed mapping: ${sourceUid}`);
    }
}

/**
 * Initialize the Google Calendar API client
 */
async function initializeClient() {
    if (calendarClient) {
        return calendarClient;
    }

    try {
        // Check if credentials file exists
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            console.log('[GoogleCalendar] Credentials file not found at:', CREDENTIALS_PATH);
            console.log('[GoogleCalendar] Google Calendar API integration disabled');
            return null;
        }

        // Read credentials
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

        // Create auth client
        authClient = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });

        // Create calendar client
        calendarClient = google.calendar({ version: 'v3', auth: authClient });

        console.log('[GoogleCalendar] API client initialized successfully');
        return calendarClient;
    } catch (error) {
        console.error('[GoogleCalendar] Failed to initialize:', error.message);
        return null;
    }
}

/**
 * Get the appropriate calendar ID based on assignees
 * 
 * Routing rules:
 * - Svante (alone) → Svante's calendar
 * - Sarah (alone) → Sarah's calendar
 * - Children (Algot, Leon, Tuva) → Family calendar
 * - Multiple people → Family calendar
 * - Unknown/none → Family calendar
 */
function getTargetCalendarId(assignees = []) {
    if (!assignees || assignees.length === 0) {
        return CALENDAR_CONFIG.familjen; // Default to family calendar
    }

    // If single adult assignee, use their personal calendar
    if (assignees.length === 1) {
        const assignee = assignees[0].toLowerCase();
        if (assignee === 'svante') return CALENDAR_CONFIG.svante;
        if (assignee === 'sarah') return CALENDAR_CONFIG.sarah;
        // Children (Algot, Leon, Tuva) → Family calendar
        // Unknown names → Family calendar
    }

    // Multiple assignees = family calendar (involves more than one person)
    return CALENDAR_CONFIG.familjen;
}

/**
 * Create a new event in Google Calendar
 */
async function createEvent(event) {
    const calendar = await initializeClient();
    if (!calendar) {
        console.log('[GoogleCalendar] Skipping create - API not initialized');
        return null;
    }

    try {
        const calendarId = getTargetCalendarId(event.assignees);

        const googleEvent = {
            summary: event.summary,
            location: event.location || '',
            description: event.description || '',
            start: {
                dateTime: new Date(event.start).toISOString(),
                timeZone: 'Europe/Stockholm'
            },
            end: {
                dateTime: new Date(event.end).toISOString(),
                timeZone: 'Europe/Stockholm'
            },
            // Store original UID for tracking
            extendedProperties: {
                private: {
                    familjecentralenUid: event.uid,
                    source: event.source || 'Familjecentralen'
                }
            }
        };

        const result = await calendar.events.insert({
            calendarId,
            resource: googleEvent
        });

        console.log(`[GoogleCalendar] Created event: ${event.summary} -> ${calendarId}`);
        return result.data;
    } catch (error) {
        console.error('[GoogleCalendar] Create event failed:', error.message);
        return null;
    }
}

/**
 * Get a single event from Google Calendar
 */
async function getEvent(eventId, calendarId = CALENDAR_CONFIG.familjen) {
    const calendar = await initializeClient();
    if (!calendar) return null;

    try {
        const result = await calendar.events.get({
            calendarId,
            eventId
        });

        return result.data;
    } catch (error) {
        console.error('[GoogleCalendar] Get event failed:', error.message);
        return null;
    }
}

/**
 * Update an existing event in Google Calendar
 */
async function updateEvent(eventId, calendarId, updates) {
    const calendar = await initializeClient();
    if (!calendar) return null;

    // Convert our format to Google's format
    const resource = {};
    if (updates.summary) resource.summary = updates.summary;
    if (updates.location) resource.location = updates.location;
    if (updates.description) resource.description = updates.description;

    if (updates.start) {
        const startDate = new Date(updates.start);
        resource.start = {
            dateTime: startDate.toISOString(),
            timeZone: 'Europe/Stockholm'
        };
    }
    if (updates.end) {
        const endDate = new Date(updates.end);
        resource.end = {
            dateTime: endDate.toISOString(),
            timeZone: 'Europe/Stockholm'
        };
    }

    try {
        const result = await calendar.events.patch({
            calendarId,
            eventId,
            resource
        });

        console.log(`[GoogleCalendar] Updated event: ${eventId}`);
        return result.data;
    } catch (error) {
        console.error('[GoogleCalendar] Update event failed:', error.message);
        return null;
    }
}

/**
 * Delete an event from Google Calendar
 */
async function deleteEvent(eventId, calendarId = CALENDAR_CONFIG.familjen) {
    const calendar = await initializeClient();
    if (!calendar) return false;

    try {
        await calendar.events.delete({
            calendarId,
            eventId
        });

        console.log(`[GoogleCalendar] Deleted event: ${eventId}`);
        return true;
    } catch (error) {
        // If event is already gone (404), consider it a success so we can clean up locally
        if (error.code === 404 || (error.message && error.message.includes('404'))) {
            console.log(`[GoogleCalendar] Event ${eventId} already deleted from Google (404)`);
            return true;
        }
        console.error('[GoogleCalendar] Delete event failed:', error.message);
        return false;
    }
}

/**
 * Find an event by its Familjecentralen UID
 */
async function findEventByUid(uid, calendarId = CALENDAR_CONFIG.familjen) {
    const calendar = await initializeClient();
    if (!calendar) return null;

    try {
        // Search for events with matching UID in extended properties
        const result = await calendar.events.list({
            calendarId,
            privateExtendedProperty: `familjecentralenUid=${uid}`,
            singleEvents: true,
            maxResults: 1
        });

        if (result.data.items && result.data.items.length > 0) {
            return result.data.items[0];
        }
        return null;
    } catch (error) {
        console.error('[GoogleCalendar] Find event failed:', error.message);
        return null;
    }
}

/**
 * Cancel an event (mark as cancelled instead of deleting)
 */
async function cancelEvent(eventId, calendarId = CALENDAR_CONFIG.familjen) {
    const calendar = await initializeClient();
    if (!calendar) return false;

    try {
        await calendar.events.patch({
            calendarId,
            eventId,
            resource: {
                status: 'cancelled'
            }
        });

        console.log(`[GoogleCalendar] Cancelled event: ${eventId}`);
        return true;
    } catch (error) {
        console.error('[GoogleCalendar] Cancel event failed:', error.message);
        return false;
    }
}

/**
 * Test connection to Google Calendar API
 */
async function testConnection() {
    const calendar = await initializeClient();
    if (!calendar) {
        return { success: false, message: 'API not initialized' };
    }

    try {
        // Try to list calendars accessible to the service account
        const result = await calendar.calendarList.list();
        const calendars = result.data.items || [];

        console.log('[GoogleCalendar] Connection test successful');
        console.log('[GoogleCalendar] Accessible calendars:', calendars.map(c => c.summary).join(', '));

        return {
            success: true,
            calendars: calendars.map(c => ({ id: c.id, summary: c.summary }))
        };
    } catch (error) {
        console.error('[GoogleCalendar] Connection test failed:', error.message);
        return { success: false, message: error.message };
    }
}

// Check if API is enabled
function isEnabled() {
    // Check if credentials exist AND at least one calendar ID is configured
    const hasCalendarIds = CALENDAR_CONFIG.familjen || CALENDAR_CONFIG.svante || CALENDAR_CONFIG.sarah;
    if (!hasCalendarIds) return false;
    return fs.existsSync(CREDENTIALS_PATH);
}

// List events from a specific calendar
async function listEvents(calendarId, timeMin, timeMax) {
    const calendar = await initializeClient();
    if (!calendar) return [];

    try {
        const res = await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime'
        });
        return res.data.items || [];
    } catch (error) {
        console.error(`[GoogleCalendar] Failed to list events for ${calendarId}:`, error.message);
        return [];
    }
}

export default {
    initializeClient,
    createEvent,
    getEvent,
    updateEvent,
    deleteEvent,
    findEventByUid,
    listEvents,
    cancelEvent,
    testConnection,
    isEnabled,
    // Mapping functions for Mirror Sync
    saveMapping,
    getMapping,
    removeMapping,
    getAllMappings: readEventMap,
    getTargetCalendarId,
    CALENDAR_CONFIG
};
