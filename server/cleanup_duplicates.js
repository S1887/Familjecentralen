/**
 * Cleanup Script: Remove duplicate events from Google Calendar
 * 
 * Finds events with same summary and start time, keeps one, deletes rest.
 * 
 * Run with: node server/cleanup_duplicates.js
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'google-service-account.json');
const CALENDAR_ID = 'family17438490542731545369@group.calendar.google.com'; // Familjekalendern

async function cleanup() {
    console.log('=== CLEANUP: Finding duplicate events ===\n');

    // Initialize Google Calendar client
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // Get all future events
    const now = new Date();
    const result = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: now.toISOString(),
        maxResults: 2500,
        singleEvents: true,
        orderBy: 'startTime'
    });

    const events = result.data.items || [];
    console.log(`📊 Found ${events.length} events in Familjekalendern\n`);

    // Group by key (summary + start time)
    const groups = {};
    for (const ev of events) {
        const key = `${ev.summary}|${ev.start?.dateTime || ev.start?.date}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(ev);
    }

    // Find duplicates
    const duplicatesToDelete = [];
    for (const key of Object.keys(groups)) {
        if (groups[key].length > 1) {
            // Keep the first one, mark rest for deletion
            const [keep, ...toDelete] = groups[key];
            console.log(`🔍 Duplicate: ${keep.summary} (${groups[key].length} copies)`);
            duplicatesToDelete.push(...toDelete);
        }
    }

    console.log(`\n🗑️ Found ${duplicatesToDelete.length} duplicate events to delete`);

    if (duplicatesToDelete.length === 0) {
        console.log('✅ No duplicates found!');
        return;
    }

    console.log('\nDeleting duplicates...\n');

    let deleted = 0;
    let errors = 0;

    for (const ev of duplicatesToDelete) {
        try {
            await calendar.events.delete({
                calendarId: CALENDAR_ID,
                eventId: ev.id
            });
            console.log(`✅ Deleted: ${ev.summary}`);
            deleted++;
        } catch (error) {
            console.error(`❌ Failed to delete: ${ev.summary} - ${error.message}`);
            errors++;
        }
        // Small delay
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n=== CLEANUP COMPLETE ===');
    console.log(`✅ Deleted: ${deleted}`);
    console.log(`❌ Errors: ${errors}`);
}

cleanup().catch(console.error);
