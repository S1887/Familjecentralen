
import ical from 'node-ical';

// Common public ECAL URL for Arsenal
const url = 'https://sync.ecal.com/button/v1/calendar/58e23a4110b9971715000021/Arsenal%20FC.ics';

console.log('Fetching ECAL...');
ical.async.fromURL(url).then(data => {
    const events = Object.values(data).filter(e => e.type === 'VEVENT');
    console.log('Events found:', events.length);

    const future = events.filter(e => new Date(e.start) > new Date()).sort((a, b) => new Date(a.start) - new Date(b.start));

    if (future.length > 0) {
        const next = future[0];
        console.log('Next Match:', next.summary);
        console.log('Location:', next.location);
    } else {
        console.log('No future events.');
    }
}).catch(e => console.error('Error:', e.message));
