
import http from 'http';

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/events',
    method: 'GET',
    headers: { 'x-api-key': 'fam-ops-key' }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const events = JSON.parse(data);
            const week4 = events.filter(e => {
                const d = e.start;
                return d.includes('2026-01-19') || d.includes('2026-01-20') || d.includes('2026-01-21') || d.includes('2026-01-24') || d.includes('2026-01-25');
            });

            console.log(`Events in Week 4: ${week4.length}`);
            week4.forEach(e => {
                console.log(`- [${e.source}] ${e.summary}`);
                console.log(`  Start: ${e.start}`);
                console.log(`  UID: ${e.uid}`);
                // console.log(`  Props: ${JSON.stringify(e)}`); 
            });

        } catch (e) { console.error(e); }
    });
});
req.on('error', (e) => console.error(e));
req.end();
