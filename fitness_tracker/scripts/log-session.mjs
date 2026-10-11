import fs from 'node:fs';
import crypto from 'node:crypto';

const endpoint = process.env.FITNESS_API_URL || 'http://127.0.0.1:4318';
const fileArgumentIndex = process.argv.indexOf('--file');
const sourcePath = fileArgumentIndex >= 0 ? process.argv[fileArgumentIndex + 1] : null;

let raw = '';
if (sourcePath) {
  raw = fs.readFileSync(sourcePath, 'utf8');
} else if (!process.stdin.isTTY) {
  raw = fs.readFileSync(0, 'utf8');
} else {
  throw new Error('Provide a JSON payload with --file <path> or stdin.');
}

const payload = JSON.parse(raw);
const idempotencyKey = payload.idempotency_key || `telegram-${payload.date_logged}-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
delete payload.idempotency_key;
payload.source ||= 'telegram';

const response = await fetch(`${endpoint}/api/sessions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  },
  body: JSON.stringify(payload),
});
const body = await response.json();
if (!response.ok) throw new Error(body.error || `Fitness API returned ${response.status}.`);

console.log(JSON.stringify({
  saved: true,
  idempotency_key: idempotencyKey,
  session: body.session,
  next_workout: body.next_workout,
}, null, 2));
