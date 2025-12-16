
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join('server', 'calendar_cache.json');
try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const events = data.events.filter(e => e.source === 'Vklass (Skola)');

    const patterns = {};

    events.forEach(e => {
        const match = e.summary.match(/\((.*?)\)/);
        if (match) {
            const content = match[1];
            // Check for characteristics of lesson codes
            const hasNumber = /\d/.test(content);
            const hasUnderscore = /__/.test(content);
            const hasSlash = /\//.test(content);

            const type = (hasNumber && (hasUnderscore || hasSlash)) ? 'LIKELY_LESSON_CODE' : 'POTENTIAL_EVENT';

            if (!patterns[type]) patterns[type] = [];
            if (!patterns[type].includes(content)) {
                patterns[type].push(content);
            }
        }
    });

    console.log('--- LIKELY LESSON CODES (Sample) ---');
    console.log(patterns['LIKELY_LESSON_CODE']?.slice(0, 10) || 'None');
    console.log(`Total unique codes: ${patterns['LIKELY_LESSON_CODE']?.length || 0}`);

    console.log('\n--- POTENTIAL EVENTS (Non-standard codes) ---');
    console.log(patterns['POTENTIAL_EVENT'] || 'None');
    console.log(`Total potential events: ${patterns['POTENTIAL_EVENT']?.length || 0}`);

} catch (e) {
    console.error(e);
}
