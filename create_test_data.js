
// Script to inject a test event
// Usage: node create_test_data.js

const eventData = {
    summary: "Testmatch HKLP11/P10 (lokalt test)",
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(), // +1 hour
    location: "Lidköping Arena",
    description: "Detta är ett test-event för Algot för att verifiera 'Nya händelser' funktionen.",
    assignees: ["Algot"], // Array of names
    source: "FamilyOps",   // Makes it editable
    category: "Idrott"
};

const PORTS = [3010, 3000, 3001, 8080];

async function createEvent() {
    console.log("Försöker skapa test-event...");

    for (const port of PORTS) {
        try {
            const url = `http://localhost:${port}/api/create-event`;
            console.log(`Testar ${url}...`);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });

            if (res.ok) {
                const json = await res.json();
                console.log(`✅ Event skapat på port ${port}!`);
                console.log("Svar:", json);
                return; // Done
            } else {
                console.log(`❌ Port ${port} svarade ${res.status} ${res.statusText}`);
            }
        } catch (e) {
            // console.log(`Inget svar på port ${port} (${e.code})`);
        }
    }
    console.error("Kunde inte skapa event på någon port. Är servern igång?");
}

createEvent();
