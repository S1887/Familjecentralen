import ical from 'node-ical';

const url = 'https://ics.fixtur.es/v2/arsenal.ics';

ical.fromURL(url).then(data => {
    const events = Object.values(data)
        .filter(e => e.type === 'VEVENT')
        .sort((a, b) => new Date(a.start) - new Date(b.start));

    const upcoming = events.filter(e => new Date(e.start) > new Date()).slice(0, 10);

    console.log('Upcoming Arsenal matches:');
    upcoming.forEach(e => {
        console.log(`${new Date(e.start).toLocaleDateString('sv-SE')} - ${e.summary}`);
    });
}).catch(err => console.error('Error:', err));
