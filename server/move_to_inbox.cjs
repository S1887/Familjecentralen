// Script to move non-training events from subscription sources back to inbox
// by removing them from local_events.json

const fs = require('fs');
const path = require('path');

const LOCAL_EVENTS_FILE = path.join(__dirname, 'local_events.json');

// Read local events
let localEvents = [];
try {
    if (fs.existsSync(LOCAL_EVENTS_FILE)) {
        localEvents = JSON.parse(fs.readFileSync(LOCAL_EVENTS_FILE, 'utf8'));
    }
} catch (e) {
    console.error('Failed to read local_events.json:', e.message);
    process.exit(1);
}

console.log(`Total events before cleanup: ${localEvents.length}`);

// Sources to check (from inboxOnly calendars)
const inboxSources = [
    'laget.se',
    'laget',
    'sportadmin',
    'villa lidköping',
    'råda',
    'hk lidköping',
    'vklass',
    'skola'
];

// Filter out events that should be in inbox
const eventsToRemove = localEvents.filter(event => {
    const source = (event.source || '').toLowerCase();
    const summary = (event.summary || '').toLowerCase();

    // Check if from an inbox source
    const isFromInboxSource = inboxSources.some(src => source.includes(src));

    if (!isFromInboxSource) {
        return false; // Keep it
    }

    // If it's a training, keep it (these should auto-approve)
    if (summary.includes('träning')) {
        console.log(`KEEPING (training): ${event.summary} | Source: ${event.source}`);
        return false;
    }

    // Arsenal and ÖIS - keep ALL of them (they auto-import)
    if (source.includes('arsenal') || source.includes('örgryte') || source.includes('öis')) {
        console.log(`KEEPING (Arsenal/ÖIS): ${event.summary} | Source: ${event.source}`);
        return false;
    }

    // Otherwise, remove it (send back to inbox)
    console.log(`REMOVING (non-training): ${event.summary} | Source: ${event.source}`);
    return true;
});

console.log(`\nEvents to remove: ${eventsToRemove.length}`);

// Keep only events that should stay
const filteredEvents = localEvents.filter(event => {
    const source = (event.source || '').toLowerCase();
    const summary = (event.summary || '').toLowerCase();

    const isFromInboxSource = inboxSources.some(src => source.includes(src));

    if (!isFromInboxSource) {
        return true; // Keep all non-inbox source events
    }

    // Keep trainings
    if (summary.includes('träning')) {
        return true;
    }

    // Keep Arsenal and ÖIS
    if (source.includes('arsenal') || source.includes('örgryte') || source.includes('öis')) {
        return true;
    }

    // Remove everything else from inbox sources
    return false;
});

console.log(`Total events after cleanup: ${filteredEvents.length}`);

// Backup original file
const backupFile = LOCAL_EVENTS_FILE + '.backup';
fs.copyFileSync(LOCAL_EVENTS_FILE, backupFile);
console.log(`\nBackup created: ${backupFile}`);

// Write filtered events back
fs.writeFileSync(LOCAL_EVENTS_FILE, JSON.stringify(filteredEvents, null, 2));
console.log(`Updated ${LOCAL_EVENTS_FILE}`);

console.log('\n✓ Done! Non-training events from subscription sources have been moved back to inbox.');
console.log('  Refresh the calendar to see changes.');
