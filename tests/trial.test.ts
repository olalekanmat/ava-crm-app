import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { activeTrial, DEFAULT_TRIAL, licenseState, trialEnded, type LicenseFile } from '../src/cloud/license';
import { trialLimitError } from '../src/data/trial';
import { emptySnapshot, type Account, type Product, type Snapshot } from '../src/data/types';

const T0 = Date.parse('2026-10-01T12:00:00Z');
const DAY = 86400000;
const at = (days: number) => new Date(T0 + days * DAY);

function tokens() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'jwk' }).x!;
  const make = (payload: object) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${sign(null, Buffer.from(body, 'ascii'), privateKey).toString('base64url')}`;
  };
  const file = (payload: object, over: Partial<LicenseFile> = {}): LicenseFile => ({ companyId: 'cmp_1', server: 'https://x', statusKey: 'k', status: 'active', token: make(payload), requestedAt: at(0).toISOString(), updatedAt: at(0).toISOString(), ...over });
  return { pub, file };
}
const payload = (over: object = {}) => ({ v: 1, companyId: 'cmp_1', company: 'Acme', adminEmail: 'a@b.c', issuedAt: at(0).toISOString(), expiresAt: at(14).toISOString(), subscriptionEnd: at(30).toISOString(), seats: 5, trial: true, limits: DEFAULT_TRIAL, ...over });

test('a trial licence carries its limits; a paid one does not', () => {
  const { pub, file } = tokens();
  const st = licenseState(file(payload()), 'cmp_1', at(1), pub);
  assert.equal(st.state, 'active');
  assert.deepEqual(activeTrial(st), DEFAULT_TRIAL);
  const paid = licenseState(file(payload({ trial: undefined, limits: undefined })), 'cmp_1', at(1), pub);
  assert.equal(activeTrial(paid), undefined);
});

test('the trial has ended only once its end date has passed', () => {
  const { pub, file } = tokens();
  // Offline for 14 days in the middle of the trial: expired token, but the trial is still running.
  assert.equal(trialEnded(licenseState(file(payload()), 'cmp_1', at(15), pub)), false);
  const last = file(payload({ issuedAt: at(20).toISOString(), expiresAt: at(30).toISOString() }));
  assert.equal(trialEnded(licenseState(last, 'cmp_1', at(29), pub)), false);
  assert.equal(trialEnded(licenseState(last, 'cmp_1', at(30.1), pub)), true);
  // The server answered "expired" for a trial: no token left.
  assert.equal(trialEnded(licenseState(file(payload(), { status: 'expired', token: undefined, trial: true }), 'cmp_1', at(31), pub)), true);
  // A paid subscription that lapsed is not a trial.
  assert.equal(trialEnded(licenseState(file(payload({ trial: undefined })), 'cmp_1', at(31), pub)), false);
});

const acc = (id: string, type: 'HCP' | 'HCO', deletedAt?: string): Account => ({ id, type, name: id, specialty: '', tier: 'T1', address: '', city: '', ownerId: 'u', createdAt: '', updatedAt: '', ...(deletedAt ? { deletedAt } : {}) });
const prod = (id: string, active = true): Product => ({ id, name: id, keyMessages: [], active });
const snap = (accounts: Account[], products: Product[] = []): Snapshot => ({ ...emptySnapshot({ name: 'Acme' }), accounts, products });
const many = (n: number, type: 'HCP' | 'HCO') => Array.from({ length: n }, (_, i) => acc(`${type}${i}`, type));

test('trial caps HCPs, HCOs and active products, but a list over the cap may shrink', () => {
  const l = { ...DEFAULT_TRIAL, hcps: 2, hcos: 1, products: 1 };
  assert.equal(trialLimitError(snap(many(1, 'HCP')), snap(many(2, 'HCP')), l), undefined);
  assert.match(trialLimitError(snap(many(2, 'HCP')), snap(many(3, 'HCP')), l)!, /up to 2 HCPs, and all are in use/);
  assert.match(trialLimitError(snap([]), snap([...many(1, 'HCP'), ...many(2, 'HCO')]), l)!, /1 HCOs and this would make 2/);
  assert.equal(trialLimitError(snap(many(4, 'HCP')), snap(many(3, 'HCP')), l), undefined, 'shrinking is fine');
  assert.equal(trialLimitError(snap(many(2, 'HCP')), snap([...many(2, 'HCP'), acc('x', 'HCP', '2026-10-01')]), l), undefined, 'deleted accounts do not count');
  assert.match(trialLimitError(snap([], [prod('a')]), snap([], [prod('a'), prod('b')]), l)!, /active products/);
  assert.equal(trialLimitError(snap([], [prod('a')]), snap([], [prod('a'), prod('b', false)]), l), undefined, 'inactive products do not count');
});
