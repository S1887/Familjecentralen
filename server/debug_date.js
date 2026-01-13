/**
 * Debug Script: Analyze events for a specific date
 * 
 * Checks:
 * 1. Google Calendar events (via API)
 * 2. Cached events (server/calendar_cache.json)
 * 3. Ignored events (server/ignored_events.json)
 * 4. Google Event Map (server/google_event_map.json)
 * 
 * Run: node server/debug_date.js
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATE_STR = '2026-01-28'; // Date to debug
const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'google-service-account.json');
const CALENDAR_ID = 'family17438490542731545369@group.calendar.google.com';

async function debugDate() {
    const logData = [];
    const log = (...args) => {
        const line = args.join(' ');
        console.log(line);
        logData.push(line);
    };

    log(`=== DEBUGGING EVENTS FOR ${DATE_STR} ===\n`);

    // 1. Check Google Calendar API (Real truth)
    log('--- 1. GOOGLE CALENDAR (API) ---');
    try {
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });
        const calendar = google.calendar({ version: 'v3', auth });

        const startOfDay = new Date(DATE_STR);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(DATE_STR);
        endOfDay.setHours(23, 59, 59, 999);

        const res = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            singleEvents: true
        });

        const googleEvents = res.data.items || [];
        log(`Found ${googleEvents.length} events in Google:`);
        googleEvents.forEach(e => {
            log(`- [${e.id}] ${e.summary} (${e.start.dateTime || e.start.date})`);
            if (e.extendedProperties?.private) {
                log(`  Properties: ${JSON.stringify(e.extendedProperties.private)}`);
            }
        });

    } catch (e) {
        log('Failed to check Google API:', e.message);
    }

    // 2. Check Local Cache (what frontend gets mostly)
    log('\n--- 2. LOCAL CACHE (index.js source) ---');
    try {
        const cachePath = path.join(__dirname, 'calendar_cache.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

        const cachedOnDate = cache.events.filter(e => {
            const start = e.start || e.dtstart;
            return start && start.startsWith(DATE_STR);
        });

        log(`Found ${cachedOnDate.length} events in Cache:`);
        cachedOnDate.forEach(e => {
            log(`- [${e.uid}] ${e.summary} (${e.start || e.dtstart}) Source: ${e.source}`);
        });

    } catch (e) {
        log('Failed to read cache:', e.message);
    }

    // 3. Check Ignored/Map
    log('\n--- 3. MAPPINGS & IGNORED ---');
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'google_event_map.json'), 'utf8'));
    const ignored = JSON.parse(fs.readFileSync(path.join(__dirname, 'ignored_events.json'), 'utf8'));

    log(`Ignored count: ${ignored.length}`);
    log(`Mapped count: ${Object.keys(map).length}`);

    fs.writeFileSync(path.join(__dirname, 'debug_output.txt'), logData.join('\n'));
}

debugDate().catch(console.error);
