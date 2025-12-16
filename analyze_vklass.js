
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join('server', 'calendar_cache.json');
try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const events = data.events.filter(e => e.source === 'Vklass (Skola)');

    console.log(`Total Vklass events: ${events.length}`);

    // Group by simple patterns
    const withCode = events.filter(e => e.summary.match(/\(.*\)/));
    const withoutCode = events.filter(e => !e.summary.match(/\(.*\)/));

    console.log(`Events with possible code (parenthesis): ${withCode.length}`);
    console.log('Sample with code:');
    withCode.slice(0, 10).forEach(e => console.log(`  ${e.summary}`));

    console.log(`\nEvents WITHOUT parenthesis (potential special events): ${withoutCode.length}`);
    if (withoutCode.length > 0) {
        withoutCode.forEach(e => console.log(`  ${e.summary} (${e.start})`));
    } else {
        console.log("  None found.");
    }

} catch (e) {
    console.error(e);
}
