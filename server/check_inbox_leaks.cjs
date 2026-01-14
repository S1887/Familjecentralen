const fs = require('fs');

const cacheData = JSON.parse(fs.readFileSync('calendar_cache.json'));
const cache = cacheData.events || cacheData; // Handle both formats

const inboxSources = ['HK Lidköping', 'Råda', 'Villa', 'Vklass', 'laget'];

const events = cache.filter(e => {
    const source = e.source || '';
    const summary = (e.summary || '').toLowerCase();

    // Check if from inbox source
    const isFromInboxSource = inboxSources.some(src => source.includes(src));
    if (!isFromInboxSource) return false;

    // Check if it's in calendar (inboxOnly: false)
    if (e.inboxOnly !== false) return false;

    // Check if it's NOT a training
    if (summary.includes('träning')) return false;

    // Check if it's NOT a lesson
    if (e.isLesson) return false;

    return true;
});

console.log(`Found ${events.length} non-training events from inbox sources in calendar:\n`);

events.slice(0, 30).forEach(e => {
    console.log(`- ${e.summary} | Source: ${e.source} | ${new Date(e.start).toLocaleDateString('sv-SE')}`);
});

if (events.length > 30) {
    console.log(`\n... and ${events.length - 30} more`);
}
