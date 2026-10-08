import { useStore } from '@/data/store';
import { API, loadToken } from '@/cloud/relay';
import { coerceResult } from './logic';
import type { AiTask, AiTasks } from './types';

export type AiErrorCode = 'not_configured' | 'disabled' | 'offline' | 'timeout' | 'auth' | 'busy' | 'too_large' | 'server' | 'bad_reply';

/** A failed AI request, with a message that can be shown as is. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly code: AiErrorCode,
    readonly status = 0,
  ) {
    super(message);
  }
}

const MESSAGES: Record<AiErrorCode, string> = {
  not_configured: 'AI is not set up yet for Ava CRM. Everything else works as usual; please try again later.',
  disabled: 'Your administrator has turned AI features off.',
  offline: 'No connection. AI needs the internet; your typing and dictation still work offline.',
  timeout: 'AI took too long to answer. Please try again.',
  auth: 'Your sign-in has expired. Sign out and in again to use AI.',
  busy: 'AI is busy right now. Please try again in a minute.',
  too_large: 'That is too much text for AI at once. Try a shorter request.',
  server: 'AI could not answer just now. Please try again.',
  bad_reply: 'AI gave an answer Ava CRM could not read. Please try again.',
};

export const aiErrorMessage = (e: unknown): string => (e instanceof AiError ? e.message : e instanceof Error ? e.message : String(e));

const TIMEOUT_MS: Record<AiTask, number> = { call_note: 45_000, schedule: 45_000, plan: 90_000, brief: 45_000, ask: 60_000 };

/**
 * Runs one AI task on the Ava CRM server (same base and sign-in as the other server calls).
 * The reply is checked and tidied (coerceResult) before it reaches the screen.
 */
export async function runAi<T extends AiTask>(task: T, input: AiTasks[T]['input'], opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<AiTasks[T]['result']> {
  const token = await loadToken().catch(() => null);
  if (!token) throw new AiError(MESSAGES.auth, 'auth', 401);
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? TIMEOUT_MS[task]);
  let res: Response;
  try {
    res = await fetch(`${API}/ai/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task, input }),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
    if (timedOut) throw new AiError(MESSAGES.timeout, 'timeout');
    if (opts.signal?.aborted) throw new AiError('Cancelled.', 'server');
    throw new AiError(MESSAGES.offline, 'offline');
  }
  let body: { result?: unknown; error?: unknown; code?: unknown } = {};
  try {
    body = (await res.json()) ?? {};
  } catch {
    // Not JSON.
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
  if (!res.ok) {
    const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : (body.error as { code?: string } | undefined)?.code;
    if (code === 'ai_not_configured') throw new AiError(MESSAGES.not_configured, 'not_configured', res.status);
    if (code === 'ai_disabled') throw new AiError(MESSAGES.disabled, 'disabled', res.status);
    if (res.status === 401) throw new AiError(MESSAGES.auth, 'auth', 401);
    if (res.status === 413) throw new AiError(MESSAGES.too_large, 'too_large', 413);
    if (res.status === 429) throw new AiError(MESSAGES.busy, 'busy', 429);
    if (res.status === 503) throw new AiError(MESSAGES.busy, 'busy', 503);
    const detail = typeof body.error === 'string' && body.error.length < 200 && !/^[a-z_]+$/.test(body.error) ? body.error : '';
    throw new AiError(detail || MESSAGES.server, 'server', res.status);
  }
  try {
    return coerceResult(task, body.result) as AiTasks[T]['result'];
  } catch {
    throw new AiError(MESSAGES.bad_reply, 'bad_reply', res.status);
  }
}

/** AI features show only when the company has not turned them off (Products & rules). */
export function useAiAvailable(): boolean {
  const { data, session } = useStore();
  return !!session && data.settings.aiEnabled !== false;
}
