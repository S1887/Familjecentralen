

// Start: Cypressvägen 8 (58.5035, 13.1570)
// End: Arena (58.4950, 13.1460 ish) - Just a test point.

// Actual points from user screenshot approx:
// Start: Cypressvägen
// End: Villa Giacomina (approx 58.525, 13.130 ?? No, Villa Giacomina is north of Lidköping)
// Actually user screenshot map shows start/end.
// Coordinates: 58.5035, 13.1570 -> 58.52xxxx

const start = "13.1570,58.5035";
const end = "13.1460,58.4950"; // Just a test route

const test = async (name, url) => {
    try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.routes && json.routes.length > 0) {
            console.log(`${name}: Duration=${json.routes[0].duration}s, Dist=${json.routes[0].distance}m`);
        } else {
            console.log(`${name}: No routes found or error`, json);
        }
    } catch (e) {
        console.log(`${name}: Error ${e.message}`);
    }
};

(async () => {
    // Standard OSRM Car
    await test("Generic Car", `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=false`);

    // Standard OSRM Bike
    await test("Generic Bike", `http://router.project-osrm.org/route/v1/cycling/${start};${end}?overview=false`);

    // DE Bike with 'cycling' profile
    await test("DE Bike (cycling)", `https://routing.openstreetmap.de/routed-bike/route/v1/cycling/${start};${end}?overview=false`);
})();
