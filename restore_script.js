
async function restore() {
    const uid = '17c1robf8hg57gal322gc1olpo';
    console.log('Restoring event:', uid);

    try {
        const response = await fetch('http://localhost:3001/api/restore-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid })
        });
        const data = await response.json();
        console.log('Restore response:', data);
    } catch (e) {
        console.error('Error:', e);
    }
}

restore();
