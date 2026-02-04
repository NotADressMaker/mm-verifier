import fs from 'fs';
import initSqlJs, { Database } from 'sql.js';
import path from 'path';

let db: Database | null = null;

export async function initializeDb(dbPath: string): Promise<Database> {
  if (db) {
    return db;
  }

  const SQL = await initSqlJs();
  const resolvedPath = path.resolve(dbPath);
  const exists = fs.existsSync(resolvedPath);

  if (exists) {
    const fileBuffer = fs.readFileSync(resolvedPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS processed_requests (
    request_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS receipts (
    receipt_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    receipt_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`);

  persistDb(resolvedPath);

  return db;
}

export function markProcessed(requestId: string): void {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO processed_requests (request_id, processed_at) VALUES (?, ?);'
  );
  stmt.run([requestId, new Date().toISOString()]);
  stmt.free();
}

export function isProcessed(requestId: string): boolean {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare('SELECT request_id FROM processed_requests WHERE request_id = ?');
  stmt.bind([requestId]);
  const result = stmt.step();
  stmt.free();
  return result;
}

export function storeReceipt(receiptId: string, requestId: string, receiptJson: string): void {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare(
    'INSERT OR REPLACE INTO receipts (receipt_id, request_id, receipt_json, created_at) VALUES (?, ?, ?, ?);'
  );
  stmt.run([receiptId, requestId, receiptJson, new Date().toISOString()]);
  stmt.free();
}

export function getReceipt(receiptId: string): string | null {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare('SELECT receipt_json FROM receipts WHERE receipt_id = ?');
  stmt.bind([receiptId]);
  let receipt: string | null = null;
  if (stmt.step()) {
    receipt = stmt.getAsObject().receipt_json as string;
  }
  stmt.free();
  return receipt;
}

export function persistDb(dbPath: string): void {
  if (!db) {
    return;
  }

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}
