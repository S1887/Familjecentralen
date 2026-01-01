
async function testAI() {
    console.log('Testing AI endpoint...');
    try {
        const response = await fetch('http://localhost:3001/api/meals/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dates: ['2025-01-01'],
                targetTypes: ['dinner']
            })
        });

        console.log('Response status:', response.status);
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            console.log('Response data:', JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('Response text:', text);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testAI();
