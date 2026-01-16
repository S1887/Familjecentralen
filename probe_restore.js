
async function probeRestore() {
    const uid = 'non-existent-uid';
    console.log('Probing POST /api/restore-event with UID:', uid);
    try {
        const response = await fetch('http://localhost:3001/api/restore-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid })
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Body:', text);

        try {
            const json = JSON.parse(text);
            if (json.error === 'Event not found in local db') {
                console.log('SUCCESS: Reachable, returned expected logic error.');
            }
        } catch (e) {
            if (text.includes('API endpoint not found')) {
                console.log('FAILURE: Endpoint not defined (Catch-all hit).');
            } else {
                console.log('UNKNOWN: ' + text);
            }
        }

    } catch (e) {
        console.error('Connection error:', e);
    }
}

probeRestore();
