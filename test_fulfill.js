import fetch from 'node-fetch';

async function testEndpoint() {
  try {
    const res = await fetch('http://localhost:3001/admin/fulfill-request/21', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        donorId: 1,
        unitsProvided: 1,
        scheduledDate: "06/06/2026 10:00 AM",
        notes: "Test notes"
      })
    });
    
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text.substring(0, 100));
  } catch(e) {
    console.error("Error:", e);
  }
}

testEndpoint();
