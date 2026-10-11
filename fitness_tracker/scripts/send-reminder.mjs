const endpoint = process.env.FITNESS_API_URL || 'http://127.0.0.1:4318';
const response = await fetch(`${endpoint}/api/push/reminder`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}' });
if (!response.ok) throw new Error(await response.text());
console.log(await response.text());
