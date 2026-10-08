import * as Crypto from 'expo-crypto';
import { providerLabel, type DriveAdapter, type FolderRef } from './drive';
import type { Provider } from './journal';
import { loadToken, relayDrive } from './relay';

export const PROVIDER_LABEL: Record<Provider, string> = { google: providerLabel('google'), onedrive: providerLabel('onedrive'), sharepoint: providerLabel('sharepoint') };

/** Everyone reaches the company folder through the Ava CRM server with their own sign-in. */
export function adapterFor(folder: FolderRef): DriveAdapter {
  return relayDrive(loadToken, folder);
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

/** Random id safe for file names and URLs. */
export const randomId = (prefix: string, bytes = 12) => `${prefix}_${b64url(Crypto.getRandomBytes(bytes)).replace(/[-_]/g, 'x')}`;
export const randomKey = () => b64url(Crypto.getRandomBytes(32));
