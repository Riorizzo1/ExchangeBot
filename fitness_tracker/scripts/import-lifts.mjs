import path from 'node:path';
import { openDatabase } from '../src/db.mjs';
import { importLegacyJson } from '../src/importer.mjs';

const positionalArguments = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
const sourcePath = positionalArguments[0] || path.resolve('../workout_tracker/lifts.json');
const db = openDatabase();
const result = importLegacyJson(db, sourcePath, { replace: process.argv.includes('--replace') });
console.log(JSON.stringify(result, null, 2));
