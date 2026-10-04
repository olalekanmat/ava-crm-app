import { DriveError } from './drive';

export type TokenGetter = () => Promise<string>;

/** fetch with the user's token; turns drive errors into readable messages. */
export async function authed(getToken: TokenGetter, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  if (res.ok) return res;
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.error_description ?? '';
  } catch {
    // Not JSON.
  }
  const msg =
    res.status === 401
      ? 'Your sign-in has expired. Sign in again.'
      : res.status === 403
        ? `The drive refused access${detail ? `: ${detail}` : ''}. Ask your administrator to share the company folder with you.`
        : res.status === 404
          ? 'The company folder or file was not found. It may have been moved or unshared.'
          : res.status === 429
            ? 'The drive is busy (too many requests). Try again in a minute.'
            : `The drive answered ${res.status}${detail ? `: ${detail}` : ''}.`;
  throw new DriveError(msg, res.status);
}

export const json = async <T>(r: Response) => (await r.json()) as T;
