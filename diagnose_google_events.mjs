import googleCalendar from './server/googleCalendar.js';

async function listFamilyEvents() {
    try {
        await googleCalendar.initializeClient();

        const startTime = new Date();
        startTime.setMonth(startTime.getMonth() - 1); // 1 month back
        const endTime = new Date();
        endTime.setMonth(endTime.getMonth() + 6); // 6 months forward

        console.log(`Fetching events from ${startTime.toISOString()} to ${endTime.toISOString()}`);

        const events = await googleCalendar.listEvents(
            googleCalendar.CALENDAR_CONFIG.familjen,
            startTime.toISOString(),
            endTime.toISOString()
        );

        console.log(`\nTotal events in Familjekalendern: ${events.length}`);

        // Group by source
        const bySource = {};
        events.forEach(e => {
            const summary = e.summary || 'No title';
            let source = 'Unknown';

            if (summary.includes('Arsenal')) source = 'Arsenal';
            else if (summary.includes('ÖIS') || summary.includes('Örgryte')) source = 'ÖIS';
            else if (summary.includes('Villa') || summary.includes('Bandy')) source = 'Villa';
            else if (summary.includes('HK Lidköping') || summary.includes('Handboll')) source = 'HKL';
            else if (summary.includes('Råda')) source = 'Råda';
            else if (summary.includes('Algot:')) source = 'Algot';
            else if (summary.includes('Tuva:')) source = 'Tuva';

            if (!bySource[source]) bySource[source] = [];
            bySource[source].push(e);
        });

        console.log('\nEvents by source:');
        Object.entries(bySource).sort((a, b) => b[1].length - a[1].length).forEach(([source, events]) => {
            console.log(`  ${source}: ${events.length} events`);
            if (['HKL', 'Råda'].includes(source)) {
                console.log(`    Examples:`);
                events.slice(0, 3).forEach(e => {
                    const start = e.start?.dateTime || e.start?.date || 'No date';
                    console.log(`      - ${e.summary} (${start})`);
                });
            }
        });

        // Find Laget.se events specifically
        console.log('\n\nSearching for Laget.se events...');
        const lagetEvents = events.filter(e =>
            e.summary?.toLowerCase().includes('träning') &&
            (e.summary?.includes('HK Lidköping') || e.summary?.includes('Råda'))
        );
        console.log(`Found ${lagetEvents.length} Laget.se training events`);

        if (lagetEvents.length > 0) {
            console.log('\nFirst 5 Laget.se events:');
            lagetEvents.slice(0, 5).forEach(e => {
                const start = e.start?.dateTime || e.start?.date;
                console.log(`  - ${e.summary} (${start}) [Status: ${e.status}]`);
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

listFamilyEvents();
