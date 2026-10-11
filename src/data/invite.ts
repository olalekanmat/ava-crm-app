import type { User } from './types';

/** The starting password the relay gives every new user (same as DEFAULT_PASSWORD in cloud/relay). */
const DEFAULT_PASSWORD = '12345678';

export const APP_LINK = 'https://avahealthcareltd.com/AvaCRM/';
export const WEB_APP_LINK = 'https://avahealthcareltd.com/AvaCRM/app';

/** A ready-made invitation (2.9): where to get the app and how to sign in the first time. */
export function inviteMessage(companyName: string, companyCode: string | undefined, user: Pick<User, 'name' | 'email'>, from?: string): string {
  const first = user.name.trim().split(/\s+/)[0] || 'there';
  return [
    `Hi ${first}, you are invited to ${companyName || 'our company'} on Ava CRM.`,
    '',
    `1. Get the app: ${APP_LINK} (Android and iPhone), or use it in a browser: ${WEB_APP_LINK}`,
    `2. Sign in with company code ${companyCode ?? '(ask me)'}, your email ${user.email} and the starting password ${DEFAULT_PASSWORD}.`,
    '3. Choose your own password when asked.',
    '',
    'Forgot your password later? Tap “Forgot password?” on the sign-in screen.',
    from ? `\n${from}` : '',
  ]
    .join('\n')
    .trim();
}

export const whatsappLink = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;
export const emailLink = (to: string, companyName: string, message: string) =>
  `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Your Ava CRM sign-in for ${companyName || 'work'}`)}&body=${encodeURIComponent(message)}`;
