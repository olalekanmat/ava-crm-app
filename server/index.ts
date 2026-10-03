/**
 * Ava server: sign-in, role-scoped data, the same business rules as the app, an audit log,
 * and the web app itself. One process, one SQLite file. Run with `npm run server`.
 *
 * Environment:
 *   PORT            default 8080
 *   DATA_DIR        where ava.db lives (mount a persistent volume here), default ./data
 *   WEB_DIR         static web build to serve, default ./dist
 *   SEED_DEMO       "true" (default) loads the fictional demo organisation on first start
 *   DEMO_PASSWORD   password for the demo users, default "ava-demo"
 *   ADMIN_EMAIL / ADMIN_PASSWORD   creates this administrator on start if it does not exist
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scopeSnapshot } from '../src/data/access';
import { applyMutation, describeMutation, RuleError, type Mutation } from '../src/data/mutations';
import { buildSeed } from '../src/data/seed';
import { DEFAULT_SETTINGS, type Snapshot, type User } from '../src/data/types';
import { sanitizeMutation } from './sanitize';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');
const WEB_DIR = resolve(process.env.WEB_DIR ?? './dist');
const SESSION_DAYS = 30;
const MAX_BODY = 8 * 1024 * 1024;

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'ava.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS auth (user_id TEXT PRIMARY KEY, hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, user_agent TEXT);
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL,
    summary TEXT NOT NULL, ok INTEGER NOT NULL, error TEXT, payload TEXT NOT NULL, client TEXT
  );
`);

// ---------- passwords and sessions ----------

function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, 32).toString('base64')}`;
}

function checkPassword(pw: string, stored: string): boolean {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = scryptSync(pw, Buffer.from(salt, 'base64'), want.length);
  return timingSafeEqual(want, got);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function setPassword(userId: string, pw: string) {
  db.prepare('INSERT INTO auth (user_id, hash) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET hash = excluded.hash').run(userId, hashPassword(pw));
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// ---------- state ----------

let state: Snapshot;

function save() {
  db.prepare('INSERT INTO state (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(
    JSON.stringify(state),
    new Date().toISOString(),
  );
}

function boot() {
  const row = db.prepare('SELECT data FROM state WHERE id = 1').get() as { data: string } | undefined;
  if (row) {
    state = JSON.parse(row.data);
  } else if ((process.env.SEED_DEMO ?? 'true') !== 'false') {
    state = buildSeed();
    const pw = process.env.DEMO_PASSWORD ?? 'ava-demo';
    for (const u of state.users) setPassword(u.id, pw);
    console.log(`Loaded demo organisation. Demo users sign in with password "${pw}".`);
  } else {
    state = { users: [], accounts: [], calls: [], plans: [], cycles: [], products: [], settings: { ...DEFAULT_SETTINGS } };
  }
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD && !state.users.some((u) => u.email === ADMIN_EMAIL.toLowerCase())) {
    const admin: User = { id: `usr_${randomBytes(6).toString('hex')}`, name: 'Administrator', email: ADMIN_EMAIL.toLowerCase(), role: 'Admin', active: true, createdAt: new Date().toISOString() };
    state = { ...state, users: [...state.users, admin] };
    setPassword(admin.id, ADMIN_PASSWORD);
    console.log(`Created administrator ${admin.email}.`);
  }
  save();
}

// ---------- http helpers ----------

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

function authenticate(req: IncomingMessage): { user: User; tokenHash: string } {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!m) throw new HttpError(401, 'Sign in required.');
  const tokenHash = sha(m[1]);
  const row = db.prepare('SELECT user_id, created_at FROM sessions WHERE token_hash = ?').get(tokenHash) as { user_id: string; created_at: string } | undefined;
  if (!row || Date.now() - new Date(row.created_at).getTime() > SESSION_DAYS * 86400000) throw new HttpError(401, 'Your session has expired. Sign in again.');
  const user = state.users.find((u) => u.id === row.user_id);
  if (!user || !user.active) throw new HttpError(401, 'This account is not active.');
  return { user, tokenHash };
}

// Simple brute-force protection: 10 failed sign-ins per email per 15 minutes.
const failures = new Map<string, number[]>();
function throttle(email: string) {
  const recent = (failures.get(email) ?? []).filter((t) => Date.now() - t < 15 * 60000);
  failures.set(email, recent);
  if (recent.length >= 10) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
}

// ---------- routes ----------

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string) {
  if (path === '/api/health') return send(res, 200, { ok: true, name: 'ava', users: state.users.length });

  if (path === '/api/login' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    const key = String(email ?? '').trim().toLowerCase();
    throttle(key);
    const user = state.users.find((u) => u.email === key);
    const auth = user && (db.prepare('SELECT hash FROM auth WHERE user_id = ?').get(user.id) as { hash: string } | undefined);
    if (!user || !auth || !checkPassword(String(password ?? ''), auth.hash)) {
      failures.get(key)?.push(Date.now());
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    if (!user.active) throw new HttpError(403, 'This account is not active. Contact your administrator.');
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, user_agent) VALUES (?, ?, ?, ?)').run(sha(token), user.id, new Date().toISOString(), String(req.headers['user-agent'] ?? '').slice(0, 200));
    return send(res, 200, { token, user });
  }

  const { user, tokenHash } = authenticate(req);

  if (path === '/api/logout' && req.method === 'POST') {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return send(res, 200, { ok: true });
  }

  if (path === '/api/snapshot' && req.method === 'GET') {
    return send(res, 200, { user, snapshot: scopeSnapshot(state, user) });
  }

  if (path === '/api/mutations' && req.method === 'POST') {
    const body = await readBody(req);
    if (!Array.isArray(body.mutations) || body.mutations.length > 200) throw new HttpError(400, 'Send up to 200 changes at a time.');
    const results: ({ ok: true } | { ok: false; error: string })[] = [];
    const audit = db.prepare('INSERT INTO audit (at, user_id, type, summary, ok, error, payload, client) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const client = String(req.headers['user-agent'] ?? '').slice(0, 200);
    db.exec('BEGIN');
    try {
      for (const raw of body.mutations) {
        // The actor is re-read every time: an earlier change in the batch may affect them.
        const actor = state.users.find((u) => u.id === user.id)!;
        let m: Mutation | undefined;
        try {
          m = sanitizeMutation(raw);
          if (m.type === 'user.upsert' && m.password !== undefined && m.password.length < 8) throw new RuleError('Passwords need at least 8 characters.');
          state = applyMutation(state, m, actor);
          if (m.type === 'user.upsert' && m.password) setPassword(m.user.id, m.password);
          if (m.type === 'user.upsert' && !m.user.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(m.user.id);
          results.push({ ok: true });
          audit.run(new Date().toISOString(), user.id, m.type, describeMutation(m), 1, null, JSON.stringify(redact(m)), client);
        } catch (e) {
          const error = e instanceof RuleError ? e.message : 'This change was not valid and was not saved.';
          if (!(e instanceof RuleError)) console.warn('Rejected mutation', e);
          results.push({ ok: false, error });
          audit.run(new Date().toISOString(), user.id, String(raw?.type ?? 'unknown'), m ? describeMutation(m) : 'invalid', 0, error, JSON.stringify(redact(raw)).slice(0, 20000), client);
        }
      }
      save();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return send(res, 200, { results });
  }

  if (path === '/api/audit' && req.method === 'GET') {
    if (user.role !== 'Admin') throw new HttpError(403, 'Only an administrator can read the audit log.');
    const rows = db.prepare('SELECT id, at, user_id, type, summary, ok, error FROM audit ORDER BY id DESC LIMIT 500').all();
    return send(res, 200, { entries: rows });
  }

  throw new HttpError(404, 'Not found.');
}

function redact(m: any) {
  return m && typeof m === 'object' && 'password' in m ? { ...m, password: '***' } : m;
}

// ---------- static web app ----------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json',
};

function serveStatic(res: ServerResponse, path: string) {
  if (!existsSync(WEB_DIR)) return send(res, 404, { error: 'Web app not built. Run npm run build:web.' });
  const file = normalize(join(WEB_DIR, decodeURIComponent(path)));
  const inside = file.startsWith(WEB_DIR + sep);
  const target = inside && existsSync(file) && statSync(file).isFile() ? file : join(WEB_DIR, 'index.html');
  const immutable = target.includes(`${join(WEB_DIR, '_expo')}`) || target.includes(join(WEB_DIR, 'assets'));
  res.writeHead(200, {
    'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(readFileSync(target));
}

// ---------- server ----------

boot();

createServer(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  try {
    if (path.startsWith('/api/')) await handleApi(req, res, path);
    else serveStatic(res, path);
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { error: e.message });
    else {
      console.error(e);
      send(res, 500, { error: 'Something went wrong on the server.' });
    }
  }
}).listen(PORT, () => console.log(`Ava server on http://localhost:${PORT}  (data: ${DATA_DIR})`));
