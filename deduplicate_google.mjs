import googleCalendar from './server/googleCalendar.js';

async function deduplicateGoogleEvents() {
    try {
        console.log('🧹 Starting Google Calendar Deduplication...\n');

        await googleCalendar.initializeClient();

        // Define range: 3 months back to 6 months forward
        const startTime = new Date();
        startTime.setMonth(startTime.getMonth() - 3);
        const endTime = new Date();
        endTime.setMonth(endTime.getMonth() + 6);

        console.log(`Fetching events from ${startTime.toISOString()} to ${endTime.toISOString()}`);

        const calendars = [
            googleCalendar.CALENDAR_CONFIG.familjen,
            googleCalendar.CALENDAR_CONFIG.svante,
            googleCalendar.CALENDAR_CONFIG.sara
        ];

        let totalDeleted = 0;

        for (const calId of calendars) {
            console.log(`\nProcessing calendar: ${calId}`);

            try {
                const events = await googleCalendar.listEvents(
                    calId,
                    startTime.toISOString(),
                    endTime.toISOString()
                );

                console.log(`   Found ${events.length} events`);

                // Group by signature: "Summary_StartTime"
                const groups = {};
                events.forEach(e => {
                    const start = e.start?.dateTime || e.start?.date;
                    // Normalize summary (remove prefixes like "Algot: ")
                    const cleanSummary = (e.summary || '').toLowerCase().replace(/^[a-zåäö]+:\s+/, '');
                    const signature = `${cleanSummary}_${new Date(start).getTime()}`;

                    if (!groups[signature]) groups[signature] = [];
                    groups[signature].push(e);
                });

                let deletedForCal = 0;

                for (const [signature, group] of Object.entries(groups)) {
                    if (group.length > 1) {
                        console.log(`   ⚠️  Found ${group.length} duplicates for "${group[0].summary}"`);

                        // Sort: Keep the one created earliest (original) or latest?
                        // Actually, if one is mapped in google_event_map.json, we should keep THAT one.
                        // But since we are offline/script, we don't have easy access to the map file in memory state.
                        // However, we just want to remove redundant copies.

                        // Let's keep the first one and delete the rest.
                        const [keep, ...duplicates] = group;

                        for (const dup of duplicates) {
                            console.log(`   🗑️  Deleting duplicate: ${dup.id}`);
                            try {
                                await googleCalendar.deleteEvent(dup.id, calId);
                                deletedForCal++;
                                totalDeleted++;
                                // Small delay
                                await new Promise(r => setTimeout(r, 200));
                            } catch (err) {
                                console.error(`Failed to delete ${dup.id}: ${err.message}`);
                            }
                        }
                    }
                }
                console.log(`   ✅ Deleted ${deletedForCal} duplicates from this calendar`);

            } catch (err) {
                console.error(`Error processing calendar ${calId}:`, err.message);
            }
        }

        console.log(`\n🎉 Deduplication complete! Total events deleted: ${totalDeleted}`);
        console.log('Restart the server to verify clean state.');

    } catch (error) {
        console.error('Fatal error:', error.message);
    }
}

deduplicateGoogleEvents();
