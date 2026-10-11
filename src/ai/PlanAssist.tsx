import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useStore } from '@/data/store';
import type { Cycle, PlanTarget } from '@/data/types';
import { Banner, Button, Card, Row, Stepper, TierBadge, text } from '@/ui/components';
import { confirm } from '@/ui/confirm';
import { colors, space } from '@/ui/theme';
import { aiErrorMessage, runAi, useAiAvailable } from './client';
import { buildPlanInput, filterPlanTargets, toPlanTargets } from './logic';
import type { PlanSuggestion } from './types';

/**
 * "Suggest with AI" in the plan builder: AI proposes calls per account from tiers, last cycle's
 * calls and the rep's capacity, with a reason for each. The rep edits and accepts; the plan is
 * saved through the normal plan.save change and still goes to the manager for approval.
 */
export function PlanAssist({ ownerId, cycle, hasPlan, onAccept }: { ownerId: string; cycle: Cycle; hasPlan: boolean; onAccept: (targets: PlanTarget[]) => void }) {
  const { data, getAccount } = useStore();
  const ai = useAiAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ targets: PlanSuggestion[]; summary: string; capacity: number }>();
  if (!ai) return null;

  const suggest = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const input = buildPlanInput(data, ownerId, cycle);
      if (!input.accounts.length) throw new Error('You have no accounts to plan yet.');
      const r = await runAi('plan', input);
      const targets = filterPlanTargets(r.targets, input.accounts.map((a) => a.id));
      if (!targets.length) throw new Error('Ava AI did not suggest any of your accounts. Try again, or use the suggested plan.');
      setResult({ targets, summary: r.summary, capacity: input.capacity });
    } catch (e) {
      setError(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!result) return;
    const go = () => {
      onAccept(toPlanTargets(result.targets));
      setResult(undefined);
    };
    if (hasPlan) confirm('Replace your plan?', 'The accounts and calls in your draft plan are replaced with these suggestions.', go, 'Replace');
    else go();
  };

  const edit = (accountId: string, planned: number | null) =>
    setResult((r) => r && { ...r, targets: planned === null ? r.targets.filter((t) => t.accountId !== accountId) : r.targets.map((t) => (t.accountId === accountId ? { ...t, planned } : t)) });

  if (!result) {
    return (
      <Card style={{ borderColor: colors.primarySoft }}>
        <Row>
          <Ionicons name="sparkles" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={text.title}>Suggest a plan with Ava AI</Text>
            <Text style={text.muted}>Uses your accounts’ tiers, last cycle’s calls and how many calls you can make. You review every account before saving.</Text>
          </View>
        </Row>
        <Row style={{ marginTop: space.md }}>{busy ? <ActivityIndicator color={colors.primary} /> : <Button small title="Suggest with Ava AI" icon="sparkles-outline" onPress={suggest} />}</Row>
        {!!error && <View style={{ marginTop: space.sm }}><Banner tone="warn">{error}</Banner></View>}
      </Card>
    );
  }

  const total = result.targets.reduce((n, t) => n + t.planned, 0);
  return (
    <Card style={{ borderColor: colors.primary }}>
      <Row>
        <Ionicons name="sparkles" size={20} color={colors.primary} />
        <Text style={[text.title, { flex: 1 }]}>Ava AI suggestion · {result.targets.length} accounts, {total} calls</Text>
      </Row>
      {!!result.summary && <Text style={[text.body, { marginTop: space.sm }]}>{result.summary}</Text>}
      <Text style={[text.small, { marginTop: 4 }]}>About {result.capacity} calls fit in this cycle. Adjust any account, then accept.</Text>
      {result.targets.map((t) => {
        const a = getAccount(t.accountId);
        return (
          <View key={t.accountId} style={{ paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.sm }}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={text.title} numberOfLines={1}>{a?.name ?? 'Account'}</Text>
                {!!t.reason && <Text style={text.muted}>{t.reason}</Text>}
              </View>
              {a && <TierBadge tier={a.tier} />}
            </Row>
            <Row style={{ marginTop: 6, justifyContent: 'flex-end' }}>
              <Stepper value={t.planned} onChange={(v) => edit(t.accountId, v)} />
              <Pressable accessibilityLabel="Leave out" onPress={() => edit(t.accountId, null)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={22} color={colors.faint} />
              </Pressable>
            </Row>
          </View>
        );
      })}
      <Row style={{ marginTop: space.md }}>
        <Button title="Accept plan" icon="checkmark-circle-outline" onPress={accept} disabled={!result.targets.length} />
        <Button title="Discard" variant="secondary" onPress={() => setResult(undefined)} />
      </Row>
    </Card>
  );
}
