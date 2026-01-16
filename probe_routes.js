
async function checkRoutes() {
    try {
        console.log('Checking /api/debug-routes...');
        const response = await fetch('http://localhost:3001/api/debug-routes');
        if (response.ok) {
            const routes = await response.json();
            console.log('Registered Routes:', routes);
            if (routes.some(r => r.includes('/api/restore-event'))) {
                console.log('SUCCESS: /api/restore-event is registered!');
            } else {
                console.log('FAILURE: /api/restore-event is MISSING!');
            }
        } else {
            console.log('Error fetching debug routes:', response.status);
        }
    } catch (e) {
        console.error('Connection error:', e);
    }
}

checkRoutes();
