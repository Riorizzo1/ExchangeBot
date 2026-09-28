import { openDatabase, transaction } from '../src/db.mjs';
import { backfillDerivedGoals } from '../src/importer.mjs';

const db = openDatabase();
const inserted = transaction(db, () => backfillDerivedGoals(db));
console.log(JSON.stringify({ inserted }, null, 2));
db.close();
