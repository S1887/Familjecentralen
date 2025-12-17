
import ical from 'node-ical';

const url = 'https://calendar.skysports.com/calendars/football/teams/arsenal.ics';

console.log('Fetching SkySports...');
ical.async.fromURL(url).then(data => {
    const events = Object.values(data).filter(e => e.type === 'VEVENT');
    console.log('Events found:', events.length);

    // Find upcoming
    const future = events.filter(e => new Date(e.start) > new Date()).sort((a, b) => new Date(a.start) - new Date(b.start));

    if (future.length > 0) {
        const next = future[0];
        console.log('Next Match:', next.summary);
        console.log('Location:', next.location);
        console.log('Description:', next.description);
    } else {
        console.log('No future events from Sky.');
    }
}).catch(e => console.error(e.message));
