const fs = require('fs');
const path = require('path');

// Import Google Calendar module
const googleCalendarPath = path.join(__dirname, 'googleCalendar.js');

async function main() {
    console.log('\n========================================');
    console.log('Deleting non-training events from Google Calendar');
    console.log('========================================\n');

    // Dynamically import the ES module
    const googleCalendarModule = await import('file://' + googleCalendarPath.replace(/\\/g, '/'));
    const googleCalendar = googleCalendarModule.default || googleCalendarModule;

    // Check if Google Calendar API is enabled
    if (!googleCalendar.isEnabled || !googleCalendar.isEnabled()) {
        console.error('❌ Google Calendar API is not enabled!');
        process.exit(1);
    }

    // Read UIDs to delete
    const uidsFile = path.join(__dirname, 'events_to_delete.json');
    if (!fs.existsSync(uidsFile)) {
        console.error('❌ events_to_delete.json not found! Run preview_delete.cjs first.');
        process.exit(1);
    }

    const uidsToDelete = JSON.parse(fs.readFileSync(uidsFile, 'utf8'));
    console.log(`Found ${uidsToDelete.length} events to delete\n`);

    let successCount = 0;
    let failCount = 0;

    for (const uid of uidsToDelete) {
        try {
            // Get the mapping to find which calendar the event is in
            const mapping = googleCalendar.getMapping(uid);

            if (!mapping) {
                // Event might be directly from Google Calendar (not a synced local event)
                // Try to delete from family calendar
                try {
                    await googleCalendar.deleteEvent(uid, googleCalendar.CALENDAR_CONFIG.familjen);
                    console.log(`✓ Deleted from family calendar: ${uid}`);
                    successCount++;
                } catch (e) {
                    // Try other calendars if family didn't work
                    console.log(`⚠ Could not find event ${uid} in family calendar, might already be deleted`);
                    failCount++;
                }
            } else {
                // Delete using the mapping
                await googleCalendar.deleteEvent(mapping.googleEventId, mapping.calendarId);
                googleCalendar.removeMapping(uid);
                console.log(`✓ Deleted: ${uid} -> ${mapping.googleEventId}`);
                successCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`✗ Failed to delete ${uid}: ${error.message}`);
            failCount++;
        }
    }

    console.log('\n========================================');
    console.log(`DONE: ${successCount} deleted, ${failCount} failed`);
    console.log('========================================\n');

    console.log('Next steps:');
    console.log('  1. Refresh the calendar in 1-2 minutes');
    console.log('  2. Deleted events will disappear from Familjecentralen');
    console.log('  3. They will reappear in inbox from source feeds');
    console.log('  4. Approve only the ones you want\n');

    // Clean up
    fs.unlinkSync(uidsFile);
    console.log('Cleaned up events_to_delete.json');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
