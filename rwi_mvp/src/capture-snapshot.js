import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.resolve(__dirname, '..');
const dataDir = path.join(baseDir, 'data');
const rawDir = path.join(dataDir, 'raw');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
  console.error('Usage: node src/capture-snapshot.js <input-file> <output-file>');
  process.exit(1);
}

fs.mkdirSync(rawDir, { recursive: true });
const text = fs.readFileSync(inputFile, 'utf8');
fs.writeFileSync(outputFile, text);
console.log(outputFile);
