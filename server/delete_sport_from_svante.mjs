import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVANTE_CALENDAR_ID = 'svante.ortendahl@gmail.com';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'google-service-account.json');

async function main() {
    // Load credentials
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('Credentials file not found:', CREDENTIALS_PATH);
        process.exit(1);
    }
    
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    
    // Create auth client
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });
    
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Read calendar cache
    const cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'calendar_cache.json'), 'utf8'));
    const events = cache.events || [];
    
    // Find Arsenal/ÖIS events from Svante's API
    const toDelete = events.filter(e => {
        const s = (e.summary || '').toLowerCase();
        const isMatch = s.includes('arsenal') || s.includes('örgryte') || s.includes('öis') || s.includes('allsvenskan');
        const isFromSvanteAPI = e.originalSource === 'svante_api';
        return isMatch && isFromSvanteAPI;
    });
    
    console.log(`Found ${toDelete.length} events to delete from Svante's calendar`);
    
    let deleted = 0;
    let failed = 0;
    
    for (const event of toDelete) {
        // The UID for API events is the Google event ID
        const eventId = event.uid.replace(/@google\.com$/, '');
        
        try {
            await calendar.events.delete({
                calendarId: SVANTE_CALENDAR_ID,
                eventId: eventId
            });
            console.log(`✓ Deleted: ${event.summary}`);
            deleted++;
        } catch (error) {
            if (error.code === 404 || error.code === 410) {
                console.log(`- Already gone: ${event.summary}`);
            } else {
                console.error(`✗ Failed: ${event.summary} - ${error.message}`);
                failed++;
            }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`\nDone! Deleted: ${deleted}, Failed: ${failed}`);
}

main().catch(console.error);
