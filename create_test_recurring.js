
// Script to inject multiple recurring test events
// Usage: node create_test_recurring.js

const PORTS = [3010, 3000, 3001, 8080];
const COUNT = 5;

async function createRecurringEvents() {
    console.log(`Skapar ${COUNT} återkommande händelser...`);

    // Find working port first
    let port = 3010;
    for (const p of PORTS) {
        try {
            await fetch(`http://localhost:${p}/api/schedule`); // Just probe
            port = p;
            break;
        } catch (e) { }
    }
    console.log(`Använder port ${port}`);

    const baseDate = new Date();

    for (let i = 0; i < COUNT; i++) {
        const start = new Date(baseDate);
        start.setDate(start.getDate() + (i * 7)); // +1 week each
        start.setHours(18, 0, 0, 0);

        const end = new Date(start);
        end.setHours(19, 30, 0, 0);

        const eventData = {
            summary: "Handbollsträning P10",
            start: start.toISOString(),
            end: end.toISOString(),
            location: "Idrottens Hus",
            description: "Veckoträning",
            assignees: ["Algot"],
            source: "Laget.se (Simulated)",
            category: "Idrott"
        };

        try {
            await fetch(`http://localhost:${port}/api/create-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
            console.log(`Skapade event ${i + 1}/${COUNT}: ${start.toISOString().split('T')[0]}`);
        } catch (e) {
            console.error(`Fel vid skapande av event ${i + 1}:`, e.message);
        }
    }
    console.log("Klart!");
}

createRecurringEvents();
