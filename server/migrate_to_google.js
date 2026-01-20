/**
 * Migration Script: Push all auto-approved events to Google Calendar
 * 
 * This script:
 * 1. Reads all cached calendar events (sport sources)
 * 2. Filters for auto-approved (sport) events
 * 3. Checks if already in Google (via mapping)
 * 4. Pushes new ones to Familjekalendern
 * 5. Saves mapping for future sync
 * 
 * Run with: node server/migrate_to_google.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import googleCalendar from './googleCalendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const CACHE_FILE = path.join(__dirname, 'calendar_cache.json');
const IGNORED_FILE = path.join(__dirname, 'ignored_events.json');

// Sport sources that should be pushed to Google
// These are auto-approved sport teams
const SPORT_KEYWORDS = [
    'laget',
    'sportsadmin',
    'ibk',
    'hkl',
    'villa',
    'råda',
    'handboll',
    'bandy',
    'innebandy',
    'match',
    'träning',
    'lidköping'
];

// Sources to EXCLUDE (personal calendars, school)
const EXCLUDE_SOURCES = [
    'svante',
    'sarah',
    'örtendahls',
    'familj',
    'vklass'
];

// eslint-disable-next-line no-unused-vars
function isSportSource(source) {
    if (!source) return false;
    const lower = source.toLowerCase();

    // Exclude personal/family calendars and school
    if (EXCLUDE_SOURCES.some(s => lower.includes(s))) return false;

    // Include anything that looks like a sport source
    return SPORT_KEYWORDS.some(s => lower.includes(s));
}

async function migrate() {
    console.log('=== MIGRATION: Push events to Google Calendar ===\n');

    // Check if Google Calendar is enabled
    if (!googleCalendar.isEnabled()) {
        console.error('❌ Google Calendar API not enabled. Add credentials first.');
        process.exit(1);
    }

    // Initialize Google Calendar client
    await googleCalendar.initializeClient();

    // Read cached events
    let cachedEvents = [];
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            cachedEvents = cache.events || [];
        }
    } catch (error) {
        console.error('❌ Failed to read cache:', error.message);
        process.exit(1);
    }

    // Read ignored events
    let ignoredUids = [];
    try {
        if (fs.existsSync(IGNORED_FILE)) {
            ignoredUids = JSON.parse(fs.readFileSync(IGNORED_FILE, 'utf8'));
        }
    } catch {
        console.warn('⚠️ Could not read ignored events');
    }

    console.log(`📊 Found ${cachedEvents.length} cached events`);
    console.log(`🚫 Found ${ignoredUids.length} ignored events\n`);

    // Filter for sport events that are not ignored
    const sportEvents = cachedEvents.filter(ev => {
        if (!ev.uid) return false;
        if (ignoredUids.includes(ev.uid)) return false;

        // Only future events (or today)
        const eventDate = new Date(ev.start || ev.dtstart);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (eventDate < today) return false;

        // Check source OR summary for sport keywords
        const source = (ev.source || '').toLowerCase();
        const summary = (ev.summary || '').toLowerCase();

        // Exclude personal calendars by source
        if (source.includes('svante') && !summary.includes('träning') && !summary.includes('match')) return false;
        if (source.includes('sarah') && !summary.includes('träning') && !summary.includes('match')) return false;
        if (source.includes('vklass')) return false;

        // Include if source OR summary has sport keywords
        const isSportBySource = SPORT_KEYWORDS.some(s => source.includes(s)) &&
            !EXCLUDE_SOURCES.some(s => source.includes(s));
        const isSportBySummary = SPORT_KEYWORDS.some(s => summary.includes(s));

        return isSportBySource || isSportBySummary;
    });

    console.log(`🏃 Found ${sportEvents.length} sport events to migrate\n`);

    // Stats
    let pushed = 0;
    let skipped = 0;
    let errors = 0;

    for (const ev of sportEvents) {
        const uid = ev.uid;

        // Check if already in Google
        const existing = googleCalendar.getMapping(uid);
        if (existing) {
            console.log(`⏭️ Skip: ${ev.summary} (already in Google)`);
            skipped++;
            continue;
        }

        // Prepare event data
        const googleEvent = {
            uid: uid,
            summary: ev.summary || 'Händelse',
            location: ev.location || '',
            description: ev.description || '',
            start: ev.start || ev.dtstart,
            end: ev.end || ev.dtend,
            assignees: ev.assignees || [] // Will route to Familjekalendern
        };

        try {
            const result = await googleCalendar.createEvent(googleEvent);

            if (result && result.id) {
                const calendarId = googleCalendar.getTargetCalendarId(ev.assignees);
                googleCalendar.saveMapping(uid, result.id, calendarId);
                console.log(`✅ Pushed: ${ev.summary}`);
                pushed++;
            } else {
                console.log(`⚠️ No result for: ${ev.summary}`);
                errors++;
            }
        } catch (error) {
            console.error(`❌ Failed: ${ev.summary} - ${error.message}`);
            errors++;
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n=== MIGRATION COMPLETE ===');
    console.log(`✅ Pushed: ${pushed}`);
    console.log(`⏭️ Skipped (already in Google): ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
}

migrate().catch(console.error);
