import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { google } from './google';
import { DEFAULT_LICENSE_SERVER } from './license';
import { graph } from './graph';

/**
 * Sign-in with the company's own Google or Microsoft account. Ava never sees or stores a
 * password: the provider signs the person in and gives Ava a token for their drive. The
 * long-lived refresh token is kept in the phone's secure storage (Keychain / Keystore).
 *
 * Client ids are public (not secrets). They come from the build environment when set
 * (EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID / _IOS / _WEB, EXPO_PUBLIC_MS_CLIENT_ID, EXPO_PUBLIC_MS_TENANT),
 * otherwise from app-config.json on the approval site, so the site owner can register the
 * Google and Microsoft apps later without rebuilding Ava CRM. See docs/SETUP.md.
 */

export type AuthProvider = 'google' | 'microsoft';

export interface CloudAccount {
  provider: AuthProvider;
  email: string;
  name: string;
}

interface Tokens {
  accessToken: string;
  refreshToken?: string;
  /** ms since epoch */
  expiresAt: number;
}

export interface AuthConfig {
  googleWebClientId?: string;
  googleAndroidClientId?: string;
  googleIosClientId?: string;
  microsoftClientId?: string;
  microsoftTenant?: string;
}

const env = process.env;
const BUILT_IN: AuthConfig = {
  googleWebClientId: env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
  googleAndroidClientId: env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
  googleIosClientId: env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
  microsoftClientId: env.EXPO_PUBLIC_MS_CLIENT_ID,
  microsoftTenant: env.EXPO_PUBLIC_MS_TENANT,
};
let config: AuthConfig = BUILT_IN;
const CONFIG_KEY = 'ava.authConfig';
const nonEmpty = (o: AuthConfig) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string' && v.trim())) as AuthConfig;

/** Loads the sign-in settings published on the approval site (cached for offline starts). */
export async function loadAuthConfig(): Promise<void> {
  const { loadJson, saveJson } = await import('../data/storage');
  const cached = await loadJson<AuthConfig>(CONFIG_KEY);
  if (cached) config = { ...nonEmpty(cached), ...nonEmpty(BUILT_IN) };
  try {
    const res = await fetch(`${DEFAULT_LICENSE_SERVER}/app-config.json`, { cache: 'no-store' });
    if (res.ok) {
      const remote = nonEmpty(await res.json());
      await saveJson(CONFIG_KEY, remote);
      config = { ...remote, ...nonEmpty(BUILT_IN) };
    }
  } catch {
    // Offline: keep the cached settings.
  }
}

const GOOGLE_ID = () => Platform.select({ android: config.googleAndroidClientId, ios: config.googleIosClientId, default: config.googleWebClientId }) ?? '';
const MS_ID = () => config.microsoftClientId ?? '';

const discovery = (p: AuthProvider): AuthSession.DiscoveryDocument => {
  const tenant = config.microsoftTenant || 'common';
  return p === 'google'
    ? { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth', tokenEndpoint: 'https://oauth2.googleapis.com/token', revocationEndpoint: 'https://oauth2.googleapis.com/revoke' }
    : { authorizationEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, tokenEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token` };
};

const SCOPES: Record<AuthProvider, string[]> = {
  google: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive'],
  microsoft: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Files.ReadWrite.All'],
};

export const providerConfigured = (p: AuthProvider) => !!(p === 'google' ? GOOGLE_ID() : MS_ID());

/** The address the provider sends the person back to; register exactly these (docs/SETUP.md). */
export function redirectUri(p: AuthProvider): string {
  if (Platform.OS === 'web') {
    const base = (Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/$/, '');
    return `${window.location.origin}${base}/oauthredirect`;
  }
  // Google's Android and iOS clients only accept the app's package name as the scheme.
  return p === 'google' ? 'com.avacrm.app:/oauthredirect' : 'ava://oauthredirect';
}

const clientId = (p: AuthProvider) => (p === 'google' ? GOOGLE_ID() : MS_ID());
const STORE_KEY = 'ava.auth.v1';

let current: { account: CloudAccount; tokens: Tokens } | null = null;

async function persist() {
  if (!current) return;
  const value = JSON.stringify({ account: current.account, refreshToken: current.tokens.refreshToken });
  if (Platform.OS === 'web') {
    // Browsers have no keychain; keep the short-lived access token for this tab only.
    sessionStorage.setItem(STORE_KEY, JSON.stringify(current));
    return;
  }
  await SecureStore.setItemAsync(STORE_KEY, value);
}

/** Restores the account saved on this device, if any. */
export async function restoreAuth(): Promise<CloudAccount | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = sessionStorage.getItem(STORE_KEY);
      current = raw ? JSON.parse(raw) : null;
      return current?.account ?? null;
    }
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { account: CloudAccount; refreshToken?: string };
    current = { account: saved.account, tokens: { accessToken: '', refreshToken: saved.refreshToken, expiresAt: 0 } };
    return saved.account;
  } catch {
    return null;
  }
}

export class AuthExpired extends Error {
  constructor() {
    super('Your sign-in has expired. Sign in again to sync.');
  }
}

/** A valid access token for the drive, refreshed when it is about to expire. */
export async function getAccessToken(): Promise<string> {
  if (!current) throw new AuthExpired();
  const { tokens, account } = current;
  if (tokens.accessToken && tokens.expiresAt - Date.now() > 120_000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new AuthExpired();
  try {
    const r = await AuthSession.refreshAsync({ clientId: clientId(account.provider), refreshToken: tokens.refreshToken, scopes: SCOPES[account.provider] }, discovery(account.provider));
    current = { account, tokens: { accessToken: r.accessToken, refreshToken: r.refreshToken ?? tokens.refreshToken, expiresAt: Date.now() + (r.expiresIn ?? 3600) * 1000 } };
    await persist();
    return r.accessToken;
  } catch {
    throw new AuthExpired();
  }
}

/** Opens the provider's sign-in page. Returns null when the person cancels. */
export async function signInWith(p: AuthProvider, loginHint?: string): Promise<CloudAccount | null> {
  if (!providerConfigured(p)) throw new Error(`${p === 'google' ? 'Google' : 'Microsoft'} sign-in is not set up in this build yet. See docs/SETUP.md.`);
  const redirect = redirectUri(p);
  // Google's web clients cannot exchange a code without a secret, so the browser gets a token directly.
  const implicit = p === 'google' && Platform.OS === 'web';
  const request = new AuthSession.AuthRequest({
    clientId: clientId(p),
    scopes: SCOPES[p],
    redirectUri: redirect,
    responseType: implicit ? AuthSession.ResponseType.Token : AuthSession.ResponseType.Code,
    usePKCE: !implicit,
    prompt: AuthSession.Prompt.SelectAccount,
    extraParams: { ...(p === 'google' && !implicit ? { access_type: 'offline' } : {}), ...(loginHint ? { login_hint: loginHint } : {}) },
  });
  const res = await request.promptAsync(discovery(p));
  if (res.type === 'cancel' || res.type === 'dismiss') return null;
  if (res.type !== 'success') throw new Error(res.type === 'error' ? res.error?.message ?? 'Sign-in failed.' : 'Sign-in failed.');

  let tokens: Tokens;
  if (implicit) {
    tokens = { accessToken: res.params.access_token, expiresAt: Date.now() + Number(res.params.expires_in ?? 3600) * 1000 };
  } else {
    const t = await AuthSession.exchangeCodeAsync(
      { clientId: clientId(p), code: res.params.code, redirectUri: redirect, extraParams: { code_verifier: request.codeVerifier ?? '' } },
      discovery(p),
    );
    tokens = { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: Date.now() + (t.expiresIn ?? 3600) * 1000 };
  }
  const tmp = async () => tokens.accessToken;
  const who = p === 'google' ? await google.me(tmp) : await graph.me(tmp);
  current = { account: { provider: p, ...who }, tokens };
  await persist();
  return current.account;
}

export async function signOutAuth() {
  current = null;
  if (Platform.OS === 'web') sessionStorage.removeItem(STORE_KEY);
  else await SecureStore.deleteItemAsync(STORE_KEY);
}

export const currentAccount = () => current?.account ?? null;
