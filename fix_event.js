
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'server');
const LOCAL_EVENTS_FILE = path.join(DATA_DIR, 'local_events.json');

const targetUid = '17c1robf8hg57gal322gc1olpo';

console.log('Reading local_events.json...');
const events = JSON.parse(fs.readFileSync(LOCAL_EVENTS_FILE, 'utf8'));

const event = events.find(e => e.uid === targetUid);

if (event) {
    console.log('Found event:', event.summary);
    event.createdBy = 'manual_fix'; // Add flag to bypass filter
    event.source = 'Familjen'; // Normalize source just in case

    fs.writeFileSync(LOCAL_EVENTS_FILE, JSON.stringify(events, null, 2));
    console.log('Successfully patched event!');
} else {
    console.log('Event not found!');
}
