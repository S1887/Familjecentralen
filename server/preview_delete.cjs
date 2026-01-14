const fs = require('fs');
const path = require('path');

// Read from cache to see what we'd delete
const cacheData = JSON.parse(fs.readFileSync('calendar_cache.json'));
const events = cacheData.events || cacheData;

// Sources that should only have training events in calendar
const inboxSources = ['Villa Lidköping', 'Råda', 'HK Lidköping', 'laget', 'sportadmin', 'Vklass', 'Skola'];

// Find events from Google Calendar (already approved/synced)
const eventsToDelete = events.filter(e => {
    // Must be from Google Calendar API (already synced there)
    if (!e.originalSource) return false;
    if (!e.originalSource.includes('api')) return false;

    const summary = (e.summary || '').toLowerCase();
    const source = e.source || '';

    // Keep trainings - they're always OK
    if (summary.includes('träning')) return false;

    // Keywords that indicate it's a match/cup/tournament (not training)
    const matchKeywords = [
        'match',
        'matcher',
        'cup',
        'turnering',
        'festival',
        'poolspel',
        'kvalmatch',
        'slutspel',
        'semifinal',
        'final',
        'tävling',
        'spel'
    ];

    const hasMatchKeyword = matchKeywords.some(keyword => summary.includes(keyword));

    // If it has match keywords, it's likely from sport sources
    if (hasMatchKeyword) {
        // If from family calendar (already synced), likely a sport event
        if (e.originalSource === 'family_group_api') {
            return true; // Delete it
        }

        // Or if it has sport indicators
        const sportSourceIndicators = [
            'villa',
            'lidköping',
            'råda',
            'hk ',
            'bandy',
            'handboll',
            'fotboll'
        ];

        const hasSportIndicator = sportSourceIndicators.some(indicator =>
            summary.includes(indicator) || source.toLowerCase().includes(indicator)
        );

        if (hasSportIndicator) {
            return true; // Delete it
        }
    }

    return false;
});

console.log(`\n========================================`);
console.log(`PREVIEW: Events to delete from Google Calendar`);
console.log(`========================================\n`);
console.log(`Found ${eventsToDelete.length} events to delete:\n`);

// Group by type for clarity
const matches = eventsToDelete.filter(e =>
    e.summary.toLowerCase().includes('match') ||
    e.summary.toLowerCase().includes('spel')
);
const cups = eventsToDelete.filter(e =>
    e.summary.toLowerCase().includes('cup') ||
    e.summary.toLowerCase().includes('turnering') ||
    e.summary.toLowerCase().includes('festival')
);
const other = eventsToDelete.filter(e => !matches.includes(e) && !cups.includes(e));

if (matches.length > 0) {
    console.log(`📍 MATCHER (${matches.length}):`);
    matches.slice(0, 10).forEach(e => {
        console.log(`   - ${e.summary} | ${new Date(e.start).toLocaleDateString('sv-SE')}`);
    });
    if (matches.length > 10) console.log(`   ... och ${matches.length - 10} fler matcher\n`);
    else console.log('');
}

if (cups.length > 0) {
    console.log(`🏆 CUPER/TURNERINGAR (${cups.length}):`);
    cups.slice(0, 10).forEach(e => {
        console.log(`   - ${e.summary} | ${new Date(e.start).toLocaleDateString('sv-SE')}`);
    });
    if (cups.length > 10) console.log(`   ... och ${cups.length - 10} fler cuper\n`);
    else console.log('');
}

if (other.length > 0) {
    console.log(`📋 ÖVRIGT (${other.length}):`);
    other.slice(0, 10).forEach(e => {
        console.log(`   - ${e.summary} | ${new Date(e.start).toLocaleDateString('sv-SE')}`);
    });
    if (other.length > 10) console.log(`   ... och ${other.length - 10} fler\n`);
    else console.log('');
}

console.log(`========================================`);
console.log(`TOTAL: ${eventsToDelete.length} händelser kommer tas bort från Google Calendar`);
console.log(`========================================\n`);

console.log(`Dessa händelser kommer att:`);
console.log(`  ✓ Tas bort från Google Calendar`);
console.log(`  ✓ Försvinna från Familjecentralen`);
console.log(`  ✓ Dyka upp i inkorgen igen från källorna`);
console.log(`  ✓ Kunna godkännas igen individuellt\n`);

// Save UIDs to file for the actual delete script
const uidsToDelete = eventsToDelete.map(e => e.uid);
fs.writeFileSync(
    path.join(__dirname, 'events_to_delete.json'),
    JSON.stringify(uidsToDelete, null, 2)
);

console.log(`UIDs sparade till events_to_delete.json`);
console.log(`\nKör "node delete_from_google.cjs" för att verkställa borttagningen.`);
