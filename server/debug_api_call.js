// Simulate API call to fetch events
import fetch from 'node-fetch';

async function testApi() {
    try {
        const res = await fetch('http://localhost:3001/api/events');
        const events = await res.json();
        console.log(`Fetched ${events.length} events from API`);

        // Filter for Jan 28
        const dateStr = '2026-01-28';
        const jan28 = events.filter(e => e.start && e.start.startsWith(dateStr));
        console.log(`Events for ${dateStr}:`);
        jan28.forEach(e => {
            console.log(`- ${e.summary} (${e.start}) [UID: ${e.uid}] Source: ${e.source}`);
        });

    } catch (e) {
        console.error('API Test Failed:', e.message);
    }
}

testApi();
