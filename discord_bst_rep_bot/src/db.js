import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || './data/exchangebot.sqlite';
const absPath = path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(absPath), { recursive: true });

export const db = new Database(absPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  created_by_user_id TEXT NOT NULL,
  buyer_user_id TEXT NOT NULL,
  seller_user_id TEXT NOT NULL,
  item TEXT NOT NULL,
  price_text TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending_confirmations',
  buyer_confirmed_at TEXT,
  seller_confirmed_at TEXT,
  admin_approved_at TEXT,
  admin_approved_by_user_id TEXT,
  admin_rejected_at TEXT,
  admin_rejected_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_buyer ON deals (buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_deals_seller ON deals (seller_user_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals (status);
`);

export function nowIso() {
  return new Date().toISOString();
}

export function createDeal({ guildId, channelId, createdByUserId, buyerUserId, sellerUserId, item, priceText, notes }) {
  const now = nowIso();
  const stmt = db.prepare(`
    INSERT INTO deals (
      guild_id, channel_id, created_by_user_id, buyer_user_id, seller_user_id,
      item, price_text, notes, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_confirmations', ?, ?)
  `);
  const result = stmt.run(guildId, channelId, createdByUserId, buyerUserId, sellerUserId, item, priceText || '', notes || '', now, now);
  return getDealById(result.lastInsertRowid);
}

export function getDealById(id) {
  return db.prepare('SELECT * FROM deals WHERE id = ?').get(String(id));
}

export function confirmDeal(id, userId) {
  const deal = getDealById(id);
  if (!deal) return null;
  const now = nowIso();
  let buyerConfirmedAt = deal.buyer_confirmed_at;
  let sellerConfirmedAt = deal.seller_confirmed_at;

  if (userId === deal.buyer_user_id && !buyerConfirmedAt) buyerConfirmedAt = now;
  if (userId === deal.seller_user_id && !sellerConfirmedAt) sellerConfirmedAt = now;

  let status = 'pending_confirmations';
  if (buyerConfirmedAt && sellerConfirmedAt) status = 'pending_admin_approval';

  db.prepare(`
    UPDATE deals
    SET buyer_confirmed_at = ?, seller_confirmed_at = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(buyerConfirmedAt, sellerConfirmedAt, status, now, String(id));

  return getDealById(id);
}

export function cancelDeal(id) {
  db.prepare(`UPDATE deals SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(nowIso(), String(id));
  return getDealById(id);
}

export function approveDeal(id, adminUserId) {
  const now = nowIso();
  db.prepare(`
    UPDATE deals
    SET status = 'approved', admin_approved_at = ?, admin_approved_by_user_id = ?, updated_at = ?
    WHERE id = ?
  `).run(now, adminUserId, now, String(id));
  return getDealById(id);
}

export function rejectDeal(id, adminUserId) {
  const now = nowIso();
  db.prepare(`
    UPDATE deals
    SET status = 'rejected', admin_rejected_at = ?, admin_rejected_by_user_id = ?, updated_at = ?
    WHERE id = ?
  `).run(now, adminUserId, now, String(id));
  return getDealById(id);
}

export function getApprovedDealsForUser(userId, limit = 10) {
  return db.prepare(`
    SELECT * FROM deals
    WHERE status = 'approved' AND (buyer_user_id = ? OR seller_user_id = ?)
    ORDER BY admin_approved_at DESC, id DESC
    LIMIT ?
  `).all(userId, userId, limit);
}

export function getRepSummary(userId) {
  const bought = db.prepare(`SELECT COUNT(*) c FROM deals WHERE status = 'approved' AND buyer_user_id = ?`).get(userId).c;
  const sold = db.prepare(`SELECT COUNT(*) c FROM deals WHERE status = 'approved' AND seller_user_id = ?`).get(userId).c;
  return { bought, sold, total: bought + sold };
}
