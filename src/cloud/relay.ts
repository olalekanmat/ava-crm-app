import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Company, Role } from '../data/types';
import { DriveError, type DriveAdapter, type DriveFile, type FolderRef, type SetupProvider } from './drive';
import { DEFAULT_LICENSE_SERVER } from './license';

/**
 * Ava CRM server at avahealthcareltd.com/AvaCRM/api.
 *
 * People sign in with a company code, their work email and a password. The company's data lives
 * in its administrator's OneDrive (or SharePoint) or Google Drive folder; the server holds the
 * administrator's drive link and passes each person's files in and out of that folder. It stores
 * no company data itself.
 */
export const API = `${DEFAULT_LICENSE_SERVER}/api`;
export const DEFAULT_PASSWORD = '12345678';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, { body, token }: { body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No connection to Ava CRM. Check your internet connection and try again.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Ava CRM answered ${res.status}.`, res.status);
  return data as T;
}

// ----- the sign-in token, kept in secure storage on phones -----
const TOKEN_KEY = 'ava.token';
export async function saveToken(t: string | null) {
  if (Platform.OS === 'web') return t ? AsyncStorage.setItem(TOKEN_KEY, t) : AsyncStorage.removeItem(TOKEN_KEY);
  return t ? SecureStore.setItemAsync(TOKEN_KEY, t) : SecureStore.deleteItemAsync(TOKEN_KEY);
}
export async function loadToken(): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(TOKEN_KEY) : SecureStore.getItemAsync(TOKEN_KEY);
}

export interface LoginResult {
  token: string;
  mustChange: boolean;
  user: { id: string; name: string; email: string; role: Role };
  companyId: string;
  companyCode: string;
  companyName: string;
  /** Where the company keeps its data (newer servers). Missing means OneDrive. */
  provider?: string;
}

export const api = {
  login: (code: string, email: string, password: string) => call<LoginResult>('POST', 'auth/login', { body: { code: code.trim().toUpperCase(), email: email.trim().toLowerCase(), password } }),
  changePassword: (token: string, currentPassword: string, newPassword: string) => call<{ token: string }>('POST', 'auth/password', { token, body: { currentPassword, newPassword } }),
  resetPassword: (token: string, email: string) => call<{ ok: true; password: string }>('POST', 'admin/reset-password', { token, body: { email } }),
  /** `provider` picks where the company's data lives; servers without Google Drive support ignore it. */
  startSetup: (company: Company, admin: { name: string; email: string; password: string }, provider: SetupProvider = 'onedrive') =>
    call<{ authorizeUrl: string; provider?: string }>('POST', 'setup/start', { body: { company, admin, provider } }),
};

/** The company folder, reached through the server with this person's sign-in. */
export function relayDrive(getToken: () => Promise<string | null>, folder: FolderRef): DriveAdapter {
  const authed = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    const token = await getToken();
    if (!token) throw new DriveError('Please sign in again.', 401);
    try {
      return await call<T>(method, path, { token, body });
    } catch (e) {
      if (e instanceof ApiError) throw new DriveError(e.message, e.status);
      throw e;
    }
  };
  return {
    folder,
    async list(): Promise<DriveFile[]> {
      return (await authed<{ files: DriveFile[] }>('GET', 'drive/list')).files;
    },
    async read(fileId: string): Promise<string> {
      return (await authed<{ content: string }>('GET', `drive/read?id=${encodeURIComponent(fileId)}`)).content;
    },
    async write(name: string, content: string, mimeType = 'application/json'): Promise<DriveFile> {
      return (await authed<{ file: DriveFile }>('POST', 'drive/write', { name, content, mimeType })).file;
    },
    async share() {
      // Not needed: people sign in with a password, not by opening the folder.
    },
  };
}

/** The folder link for the administrator (opens the company folder in its drive), and the drive when the server says. */
export async function folderInfo(getToken: () => Promise<string | null>): Promise<{ webUrl?: string; provider?: string } | undefined> {
  const token = await getToken();
  if (!token) return undefined;
  const r = await call<{ folder?: { webUrl?: string; provider?: string }; provider?: string }>('GET', 'drive/list', { token }).catch(() => undefined);
  return r?.folder ? { ...r.folder, provider: r.folder.provider ?? r.provider } : r?.provider ? { provider: r.provider } : undefined;
}
