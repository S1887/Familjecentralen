
import ical from 'node-ical';
import fs from 'fs';

const url = 'https://ics.fixtur.es/v2/arsenal.ics';

ical.async.fromURL(url).then(data => {
    const events = Object.values(data).filter(e => e.type === 'VEVENT');
    const now = new Date();
    const future = events
        .filter(e => new Date(e.start) > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 5);

    let output = `Found ${events.length} total events.\n`;
    output += `Next 5 matches:\n`;

    future.forEach((e, i) => {
        output += `\nMatch ${i + 1}:\n`;
        output += `Summary: ${e.summary}\n`;
        output += `Location: '${e.location}'\n`; // Quote to see empty strings
        output += `Keys: ${Object.keys(e).join(', ')}\n`;
    });

    fs.writeFileSync('debug_output.txt', output);
    console.log('Done writing debug_output.txt');

}).catch(err => {
    fs.writeFileSync('debug_output.txt', 'Error: ' + err.message);
    console.error(err);
});
