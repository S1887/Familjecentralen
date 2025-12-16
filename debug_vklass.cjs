const https = require('https');
const ICAL = require('node-ical');

https.get('https://cal.vklass.se/d0cc0c1d-b064-40b8-a82c-0b2c90ba41c4.ics?custodian=true', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        const parsed = ICAL.parseICS(data);
        const allItems = Object.values(parsed);
        const vevents = allItems.filter(e => e.type === 'VEVENT');

        console.log('Total items in ICS:', allItems.length);
        console.log('VEVENT items:', vevents.length);

        // Show types
        const types = {};
        allItems.forEach(e => {
            const t = e.type || 'UNKNOWN';
            types[t] = (types[t] || 0) + 1;
        });
        console.log('Types:', types);

        // Show sample VEVENT
        if (vevents.length > 0) {
            console.log('\nFirst VEVENT summary:', vevents[0].summary);
            console.log('First VEVENT description:', vevents[0].description?.substring(0, 100));
        }
    });
});
