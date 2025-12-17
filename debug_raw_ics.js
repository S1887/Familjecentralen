
import https from 'https';
import fs from 'fs';

const url = 'https://ics.fixtur.es/v2/arsenal.ics';

console.log('Fetching RAW text...');
https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        let output = `Data length: ${data.length}\n\n`;

        // Check for LOCATION
        const lines = data.split('\n');
        const locLines = lines.filter(l => l.includes('LOCATION'));

        output += `Found ${locLines.length} lines with 'LOCATION':\n`;
        locLines.slice(0, 20).forEach(l => output += l + '\n');

        output += '\n--- First 50 lines of file ---\n';
        lines.slice(0, 50).forEach(l => output += l + '\n');

        fs.writeFileSync('raw_debug.txt', output);
        console.log('Done writing raw_debug.txt');
    });
}).on('error', (e) => console.error(e));
