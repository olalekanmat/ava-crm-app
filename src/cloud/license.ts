import nacl from 'tweetnacl';

/**
 * Licences come from the approval server (default https://avahealthcareltd.com/AvaCRM).
 * The server signs a token with its Ed25519 key; the app checks the signature with the public
 * key built into it, so a licence cannot be forged by editing a file or pointing the app at
 * another server. Tokens last at most 14 days and are renewed on every sync, so a revoked or
 * expired subscription stops working within that time even on a phone that stays offline.
 */

export const DEFAULT_LICENSE_SERVER = 'https://avahealthcareltd.com/AvaCRM';
export const LICENSE_PUBLIC_KEY = process.env.EXPO_PUBLIC_AVA_LICENSE_PUBKEY ?? '';

export type LicenseStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'unknown';

export interface LicensePayload {
  v: 1;
  companyId: string;
  company: string;
  adminEmail: string;
  issuedAt: string;
  expiresAt: string;
  subscriptionEnd: string;
  /** Active users the company has paid for; absent means no limit. */
  seats?: number;
}

/** Stored in the company folder as ava-license.json, so every device sees the latest licence. */
export interface LicenseFile {
  companyId: string;
  server: string;
  /** Secret shared with the approval server; lets any device in the company renew the licence. */
  statusKey: string;
  status: LicenseStatus;
  token?: string;
  requestedAt: string;
  updatedAt: string;
}

export function parseLicenseFile(text: string): LicenseFile | undefined {
  try {
    const l = JSON.parse(text);
    if (typeof l?.companyId !== 'string' || typeof l.server !== 'string' || typeof l.statusKey !== 'string') return undefined;
    return l as LicenseFile;
  } catch {
    return undefined;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function b64urlDecode(s: string): Uint8Array {
  const clean = s.replace(/-/g, '+').replace(/_/g, '/');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Bad base64');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

function utf8(bytes: Uint8Array): string {
  return decodeURIComponent(
    Array.from(bytes)
      .map((b) => `%${b.toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

/** Checks a token's signature and returns its payload, or undefined when it is not genuine. */
export function verifyToken(token: string, publicKey = LICENSE_PUBLIC_KEY): LicensePayload | undefined {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig || !publicKey) return undefined;
    const ok = nacl.sign.detached.verify(ascii(body), b64urlDecode(sig), b64urlDecode(publicKey));
    if (!ok) return undefined;
    const p = JSON.parse(utf8(b64urlDecode(body)));
    return p?.v === 1 && typeof p.companyId === 'string' && typeof p.expiresAt === 'string' ? (p as LicensePayload) : undefined;
  } catch {
    return undefined;
  }
}

export type LicenseState =
  | { state: 'active'; payload: LicensePayload; daysLeft: number }
  | { state: 'none' | 'pending' | 'expired' | 'revoked' | 'invalid'; payload?: LicensePayload };

/** What the company may do right now, from the licence file alone (works offline). */
export function licenseState(file: LicenseFile | undefined, companyId: string, now = new Date(), publicKey = LICENSE_PUBLIC_KEY): LicenseState {
  if (!file) return { state: 'none' };
  if (file.status === 'revoked') return { state: 'revoked' };
  if (!file.token) return { state: file.status === 'expired' ? 'expired' : 'pending' };
  const payload = verifyToken(file.token, publicKey);
  if (!payload || payload.companyId !== companyId) return { state: 'invalid' };
  const left = Date.parse(payload.expiresAt) - now.getTime();
  if (left <= 0) return { state: 'expired', payload };
  // Show days to the end of the subscription, not to the token's 14-day renewal.
  const subLeft = Date.parse(payload.subscriptionEnd) - now.getTime();
  return { state: 'active', payload, daysLeft: Math.max(0, Math.ceil(subLeft / 86400000)) };
}

export interface RegisterRequest {
  companyId: string;
  statusKey: string;
  company: { name: string; address?: string; country?: string; phone?: string; email?: string; website?: string };
  admin: { name: string; email: string };
  drive: { provider: string; folderUrl: string };
  server: string;
  appVersion?: string;
}

const base = (server: string) => server.trim().replace(/\/+$/, '');

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `The approval server answered ${res.status}.`);
  return data as T;
}

export const licenseApi = {
  register: (server: string, req: RegisterRequest) => post<{ status: LicenseStatus }>(`${base(server)}/api/register`, req),
  status: (server: string, companyId: string, statusKey: string) =>
    post<{ status: LicenseStatus; expiresAt?: string; token?: string }>(`${base(server)}/api/status`, { companyId, statusKey }),
};

/** Asks the approval server for the current licence and returns the updated file. */
export async function refreshLicense(file: LicenseFile, now = new Date()): Promise<LicenseFile> {
  const r = await licenseApi.status(file.server, file.companyId, file.statusKey);
  return { ...file, status: r.status, token: r.token ?? (r.status === 'active' ? file.token : undefined), updatedAt: now.toISOString() };
}
