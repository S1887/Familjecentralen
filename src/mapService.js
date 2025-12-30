
// mapService.js
// Enkel service för att hämta koordinater och restider via OpenStreetMap/OSRM
// OBS: Detta är gratis-tjänster som kräver att man respekterar deras Usage Policy (User-Agent, rate limiting etc.)

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const OSRM_BASE = 'http://router.project-osrm.org/route/v1';

// Hemma-koordinater: Cypressvägen 8, 53158 Lidköping
// Vi försöker cacha dessa. Defaultar till Lidköping centrum om geocoding misslyckas.
let HOME_COORDS = { lat: 58.5035, lon: 13.1570 };

const cache = {}; // Enkel cache för adress -> koordinat

export const getCoordinates = async (address) => {
    if (!address) return null;
    if (cache[address]) return cache[address];

    try {
        // Använd liknande parametrar som searchAddress som vi vet fungerar bra
        const url = `${NOMINATIM_BASE}?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=se`;

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'FamilyOps/1.0'
            }
        });
        const data = await res.json();

        if (data && data.length > 0) {
            const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            cache[address] = coords;
            return coords;
        }
    } catch (err) {
        console.error("Geocoding error:", err);
    }
    return null;
};

// Initiera hem-koordinater
(async () => {
    try {
        // Testa utan postnummer först, ibland funkar det bättre i OpenStreetMap
        let coords = await getCoordinates("Cypressvägen 8, Lidköping");
        if (!coords) {
            coords = await getCoordinates("Cypressvägen 8, 53158 Lidköping");
        }

        if (coords) {
            console.log("Hittade hem-koordinater:", coords);
            HOME_COORDS = coords;
        } else {
            console.log("Kunde inte hitta exakta koordinater för hemmet, använder default.");
        }
    } catch (e) {
        console.error("Fel vid hämtning av hem-koordinater:", e);
    }
})();

// Uppdatera HOME_COORDS om man vill
export const setHomeAddress = async (address) => {
    const coords = await getCoordinates(address);
    if (coords) {
        HOME_COORDS = coords;
        return true;
    }
    return false;
};

// Helper
export const getHomeCoords = () => HOME_COORDS;

// Helper för distans
export const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
};

export const getTravelTime = async (toCoords, mode = 'driving') => {
    // Force HTTPS for OSRM to avoid Mixed Content errors
    let baseUrl = 'https://router.project-osrm.org/route/v1';
    let profile = 'driving';

    // Välj rätt server beroende på färdsätt
    if (mode === 'walking' || mode === 'walk' || mode === 'foot') {
        baseUrl = 'https://routing.openstreetmap.de/routed-foot/route/v1';
        profile = 'driving'; // Servern är specialiserad
    } else if (mode === 'cycling' || mode === 'bike' || mode === 'bicycle') {
        // "routed-bike" ger ofta för snabba tider (t.ex. 30km/h). 
        // Vi kör standard OSRM för cykel som verkar mer realistisk (~17km/h),
        // men om den är nere kan vi behöva fallback. Vi testar standard först.
        baseUrl = 'https://router.project-osrm.org/route/v1';
        profile = 'cycling';
    } else {
        // Default car
        baseUrl = 'https://router.project-osrm.org/route/v1';
        profile = 'driving';
    }

    try {
        // Lägg till geometries=geojson för att få linjen
        const url = `${baseUrl}/${profile}/${HOME_COORDS.lon},${HOME_COORDS.lat};${toCoords.lon},${toCoords.lat}?overview=full&geometries=geojson`;
        console.log("Fetching route:", url);
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            return {
                duration: route.duration,
                distance: route.distance,
                geometry: route.geometry // GeoJSON LineString
            };
        }
    } catch (err) {
        console.error("Routing error:", err);
    }
    return null;
};

export const formatDuration = (seconds) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
};

export const searchAddress = async (query) => {
    if (!query || query.length < 3) return []; // Don't search for too short strings

    try {
        // q=<query>&format=json&addressdetails=1&limit=5&countrycodes=se
        const url = `${NOMINATIM_BASE}?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&countrycodes=se`;

        const res = await fetch(url, {
            headers: { 'User-Agent': 'FamilyOps/1.0' }
        });
        const data = await res.json();

        return data.map(item => ({
            display_name: item.display_name,
            lat: item.lat,
            lon: item.lon,
            type: item.type
        }));
    } catch (err) {
        console.error("Address search error:", err);
        return [];
    }
};
