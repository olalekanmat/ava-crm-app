import { useNetworkState } from 'expo-network';
import { useEffect, useRef } from 'react';
import { todayKey } from '@/data/dates';
import { useStore } from '@/data/store';
import { notify } from '@/ui/confirm';
import { AiError, runAi, useAiAvailable } from './client';
import { mergeCallNote } from './logic';
import { tidyQueue, unqueueTidy } from './tidyQueue';

/** Errors worth waiting out: the draft stays queued and is tried again later. */
const RETRY = new Set(['offline', 'timeout', 'busy', 'server']);

/**
 * When the phone is back online, AI tidies the notes of draft calls the rep dictated offline and
 * fills in the draft, which the rep still checks before submitting. Renders nothing.
 */
export function TidyQueueRunner() {
  const { me, getCall, getAccount, products, run, session } = useStore();
  const ai = useAiAvailable();
  const net = useNetworkState();
  const online = net.isConnected === true && net.isInternetReachable !== false;
  const busy = useRef(false);

  useEffect(() => {
    if (!me || session?.demo || !ai || !online || busy.current) return;
    busy.current = true;
    (async () => {
      let tidied = 0;
      for (const id of await tidyQueue(me.id)) {
        const call = getCall(id);
        if (!call || call.status !== 'Saved' || !call.notes?.trim()) {
          await unqueueTidy(me.id, id);
          continue;
        }
        try {
          const today = todayKey();
          const r = await runAi('call_note', { transcript: call.notes, accountName: getAccount(call.accountId)?.name ?? '', products: products.map((p) => ({ name: p.name, keyMessages: p.keyMessages })), today });
          const f = mergeCallNote(
            { notes: call.notes, chosen: call.products.map((p) => p.product), messages: call.keyMessages, nextStep: call.nextStep ?? '', followUp: call.followUpDate ?? '', attendees: call.attendees ?? '' },
            r,
            products,
            today,
          );
          // The draft may have changed while AI worked; only fill it if it has not been submitted.
          const latest = getCall(id);
          if (latest?.status === 'Saved') {
            run({
              type: 'call.save',
              call: {
                ...latest,
                notes: f.notes.trim() || undefined,
                products: f.chosen.map((product, i) => ({ product, priority: i + 1 })),
                keyMessages: f.messages,
                nextStep: f.nextStep.trim() || undefined,
                followUpDate: f.followUp || undefined,
                attendees: f.attendees.trim() || undefined,
                updatedAt: new Date().toISOString(),
              },
            });
            tidied++;
          }
          await unqueueTidy(me.id, id);
        } catch (e) {
          if (e instanceof AiError && RETRY.has(e.code)) break;
          await unqueueTidy(me.id, id);
        }
      }
      if (tidied) notify('Notes tidied', `AI filled in ${tidied} draft call${tidied > 1 ? 's' : ''} from your dictated notes. Check ${tidied > 1 ? 'them' : 'it'} before submitting.`);
    })()
      .catch(() => {})
      .finally(() => {
        busy.current = false;
      });
    // Runs when the phone comes online or the person signs in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, ai, online]);

  return null;
}
