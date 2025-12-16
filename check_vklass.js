
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join('server', 'calendar_cache.json');
try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const events = data.events.filter(e => e.source === 'Vklass (Skola)');
    console.log(`Found ${events.length} Vklass events.`);
    if (events.length > 0) {
        console.log('Sample events:');
        events.slice(0, 5).forEach(e => {
            console.log(`- ${e.summary} (${e.start})`);
        });
    } else {
        console.log('No Vklass events found. Sources available:', [...new Set(data.events.map(e => e.source))]);
    }
} catch (e) {
    console.error(e);
}
