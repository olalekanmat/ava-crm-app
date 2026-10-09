import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

/**
 * Asks once per device before anything is sent to AI (Apple guideline 5.1.2(i)): what is sent,
 * to whom, and that it can be withdrawn in My profile. Asked again after it is withdrawn.
 */
const KEY = 'ava:aiConsent:v1';

export const AI_CONSENT_TEXT =
  'Ava sends the text of your request, and the account and call details it needs to answer, to Anthropic, the company that runs the Claude AI model. Anthropic processes it to produce the answer and does not use it to train its models. Ava CRM does not keep a copy. Nothing is sent unless you use an AI feature.';

export async function hasAiConsent(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY).catch(() => null)) === 'yes';
}

export async function setAiConsent(on: boolean): Promise<void> {
  await (on ? AsyncStorage.setItem(KEY, 'yes') : AsyncStorage.removeItem(KEY)).catch(() => {});
}

let asking: Promise<boolean> | null = null;

/** True when the person has agreed (now or before). Shows the question at most once at a time. */
export function ensureAiConsent(): Promise<boolean> {
  asking ??= (async () => {
    try {
      if (await hasAiConsent()) return true;
      const ok = await ask();
      if (ok) await setAiConsent(true);
      return ok;
    } finally {
      asking = null;
    }
  })();
  return asking;
}

function ask(): Promise<boolean> {
  const title = 'Use AI with Ava?';
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${AI_CONSENT_TEXT}\n\nPress OK to allow.`));
  return new Promise((resolve) =>
    Alert.alert(title, AI_CONSENT_TEXT, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Allow', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
