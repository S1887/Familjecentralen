import 'dotenv/config';
import googleCalendar from './server/googleCalendar.js';

async function cleanupOldAutoPushedEvents() {
    try {
        console.log('Cleaning up old auto-pushed events from Family calendar...\n');

        await googleCalendar.initializeClient();

        const startTime = new Date();
        startTime.setMonth(startTime.getMonth() - 1);
        const endTime = new Date();
        endTime.setMonth(endTime.getMonth() + 6);

        const events = await googleCalendar.listEvents(
            googleCalendar.CALENDAR_CONFIG.familjen,
            startTime.toISOString(),
            endTime.toISOString()
        );

        console.log(`Found ${events.length} events in Family calendar`);

        // Delete Arsenal and ÖIS events (should be in Svante's calendar)
        let deleted = 0;
        for (const event of events) {
            const summary = event.summary || '';
            if (summary.includes('Arsenal') || summary.includes('ÖIS') || summary.includes('Örgryte')) {
                console.log(`Deleting: ${summary}`);
                await googleCalendar.deleteEvent(event.id, googleCalendar.CALENDAR_CONFIG.familjen);
                deleted++;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`\nDeleted ${deleted} Arsenal/ÖIS events from Family calendar`);
        console.log('These will be re-synced to Svantes calendar on next refresh');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

cleanupOldAutoPushedEvents();
