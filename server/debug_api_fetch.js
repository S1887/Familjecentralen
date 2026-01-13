
import googleCalendar from './googleCalendar.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debugFetch() {
    console.log('--- START DEBUG FETCH ---');

    // Initialize
    const client = await googleCalendar.initializeClient();
    if (!client) {
        console.error('Failed to init client');
        return;
    }

    // Settings
    const calendarId = googleCalendar.CALENDAR_CONFIG.familjen;
    const startTime = new Date();
    startTime.setMonth(startTime.getMonth() - 1); // 1 month back
    const endTime = new Date();
    endTime.setFullYear(endTime.getFullYear() + 1); // 1 year forward

    console.log(`fetching ${calendarId} from ${startTime.toISOString()} to ${endTime.toISOString()}`);

    try {
        const events = await googleCalendar.listEvents(calendarId, startTime.toISOString(), endTime.toISOString());
        console.log(`API returned ${events.length} events.`);

        const jan28Events = events.filter(e => {
            const d = e.start.dateTime || e.start.date;
            return d.includes('2025-01-28') || d.includes('2026-01-28'); // Check both years just in case
        });

        console.log(`Events on Jan 28: ${jan28Events.length}`);
        jan28Events.forEach(e => {
            console.log(`- [${e.id}] ${e.summary} (Start: ${e.start.dateTime || e.start.date})`);
        });

        // Write raw dump
        fs.writeFileSync(path.join(__dirname, 'debug_api_dump.json'), JSON.stringify(events, null, 2));
        console.log('Dump written to debug_api_dump.json');

    } catch (e) {
        console.error('Fetch failed:', e);
    }
}

debugFetch();
