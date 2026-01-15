/**
 * Cleanup Duplicates in Google Family Calendar
 * 
 * This script:
 * 1. Fetches all events from the Family calendar
 * 2. Identifies duplicates (same summary + start time within 5 min)
 * 3. Deletes the extras, keeping the oldest one
 * 
 * RUN WITH: node cleanup_family_calendar.mjs
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Settings
const DRY_RUN = false; // Set to true to preview without deleting
const CREDENTIALS_PATH = path.join(__dirname, 'server', 'credentials', 'google-service-account.json');

// Load .env if available
import 'dotenv/config';

const FAMILY_CALENDAR_ID = process.env.CALENDAR_FAMILY;

if (!FAMILY_CALENDAR_ID) {
    console.error('❌ CALENDAR_FAMILY not set in .env');
    process.exit(1);
}

async function main() {
    console.log('🔧 Google Family Calendar Duplicate Cleanup');
    console.log('============================================');
    console.log(`Calendar: ${FAMILY_CALENDAR_ID}`);
    console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🗑️ LIVE (will delete duplicates)'}`);
    console.log('');

    // Load credentials
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('❌ Credentials not found:', CREDENTIALS_PATH);
        process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Fetch events from past 3 months to 1 year ahead
    const startTime = new Date();
    startTime.setMonth(startTime.getMonth() - 3);
    const endTime = new Date();
    endTime.setFullYear(endTime.getFullYear() + 1);

    console.log(`📅 Fetching events from ${startTime.toISOString().split('T')[0]} to ${endTime.toISOString().split('T')[0]}...`);

    let allEvents = [];
    let pageToken = null;

    do {
        const res = await calendar.events.list({
            calendarId: FAMILY_CALENDAR_ID,
            timeMin: startTime.toISOString(),
            timeMax: endTime.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 2500,
            pageToken: pageToken
        });

        allEvents = allEvents.concat(res.data.items || []);
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    console.log(`✅ Found ${allEvents.length} total events`);

    // Group events by signature (summary normalized + start time rounded to 5 min)
    const groups = {};

    const normalize = (s) => (s || '').toLowerCase().trim();
    const roundTime = (d) => Math.floor(new Date(d).getTime() / (5 * 60 * 1000));

    for (const event of allEvents) {
        const summary = normalize(event.summary);
        const startTime = event.start?.dateTime || event.start?.date;
        if (!startTime) continue;

        const signature = `${summary}_${roundTime(startTime)}`;

        if (!groups[signature]) {
            groups[signature] = [];
        }
        groups[signature].push(event);
    }

    // Find duplicates (groups with more than 1 event)
    const duplicateGroups = Object.entries(groups).filter(([_, events]) => events.length > 1);

    console.log(`🔍 Found ${duplicateGroups.length} groups with duplicates`);
    console.log('');

    if (duplicateGroups.length === 0) {
        console.log('✨ No duplicates found! Calendar is clean.');
        return;
    }

    let totalDeleted = 0;

    for (const [signature, events] of duplicateGroups) {
        // Sort by creation time (keep oldest)
        events.sort((a, b) => new Date(a.created) - new Date(b.created));

        const keep = events[0];
        const toDelete = events.slice(1);

        console.log(`📋 "${keep.summary}" (${keep.start?.dateTime || keep.start?.date})`);
        console.log(`   ✓ Keeping: ${keep.id}`);

        for (const event of toDelete) {
            console.log(`   🗑️ Deleting: ${event.id}`);

            if (!DRY_RUN) {
                try {
                    await calendar.events.delete({
                        calendarId: FAMILY_CALENDAR_ID,
                        eventId: event.id
                    });
                    totalDeleted++;
                    // Small delay to avoid rate limiting
                    await new Promise(r => setTimeout(r, 100));
                } catch (err) {
                    console.log(`   ❌ Failed to delete: ${err.message}`);
                }
            } else {
                totalDeleted++;
            }
        }
    }

    console.log('');
    console.log('============================================');
    if (DRY_RUN) {
        console.log(`🔍 DRY RUN: Would have deleted ${totalDeleted} duplicate events`);
        console.log('Set DRY_RUN = false and run again to actually delete.');
    } else {
        console.log(`✅ Deleted ${totalDeleted} duplicate events from Family Calendar!`);
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
