
import ical from 'node-ical';
import https from 'https';

const url = 'https://ics.fixtur.es/v2/arsenal.ics';

// 1. Fetch RAW text to see if LOCATION line exists
console.log('--- RAW TEXT CHECK ---');
https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        // Check for first few LOCATION lines
        const locLines = data.split('\n').filter(line => line.startsWith('LOCATION:'));
        console.log(`Found ${locLines.length} 'LOCATION:' lines in raw text.`);
        if (locLines.length > 0) {
            console.log('First 3 locations:', locLines.slice(0, 3));
        } else {
            console.log('NO LOCATION lines found in raw text.');
        }

        // 2. Parse with node-ical
        console.log('\n--- PARSED DATA CHECK ---');
        const parsed = ical.sync.parseICS(data);
        const events = Object.values(parsed).filter(e => e.type === 'VEVENT');

        // Find upcoming matches
        const now = new Date();
        const future = events.filter(e => new Date(e.start) > now).sort((a, b) => new Date(a.start) - new Date(b.start));

        if (future.length > 0) {
            const next = future[0];
            console.log('Next Match:', next.summary);
            console.log('Location prop:', next.location);
            console.log('Geo prop:', next.geo);
            console.log('All keys:', Object.keys(next));
        } else {
            console.log('No future parsed events found.');
        }
    });
}).on('error', (err) => {
    console.error('Error fetching URL:', err.message);
});
