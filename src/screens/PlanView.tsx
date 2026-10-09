import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PlanAssist } from '@/ai/PlanAssist';
import { manages } from '@/data/access';
import { formatDate } from '@/data/dates';
import { newId } from '@/data/ids';
import { approvedLeave, callsByAccount, cycleCalls, cycleElapsed, daysLeft, leaveDaysIn, pct, spanDays } from '@/data/metrics';
import { useMe, useStore } from '@/data/store';
import { profileBoost } from '@/data/profile';
import { lengthOfCycle, scaleFrequency } from '@/data/cycles';
import { tierFrequency, tierRank, tiersFor } from '@/data/tiers';
import type { Cycle, PlanTarget } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, PlanBadge, ProgressBar, Row, SectionTitle, Stepper, TierBadge, UserAvatar, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { colors, paceColor, space } from '@/ui/theme';

/** Working days (Mon–Fri) from tomorrow until the cycle ends. */
function workingDaysLeft(cycle: Cycle): number {
  let n = 0;
  const d = new Date();
  const end = new Date(`${cycle.end}T23:59:59`);
  for (d.setDate(d.getDate() + 1); d <= end; d.setDate(d.getDate() + 1)) if (d.getDay() % 6 !== 0) n++;
  return n;
}

/** A rep's plan for one cycle: build it, track it, submit it, or (as a manager) review it. */
export function PlanView({ ownerId, cycle }: { ownerId: string; cycle: Cycle }) {
  const me = useMe();
  const { data, accounts, calls, getAccount, getUser, run } = useStore();
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const plan = data.plans.find((p) => p.ownerId === ownerId && p.cycleId === cycle.id);
  const owner = getUser(ownerId);
  const isOwner = ownerId === me.id;
  const editable = isOwner && (!plan || plan.status === 'Draft' || plan.status === 'Rejected');
  const canReview = !isOwner && plan?.status === 'Submitted' && manages(data.users, me, ownerId);
  const leave = approvedLeave(data, ownerId);
  const elapsed = cycleElapsed(cycle, new Date(), leave);
  const leaveDays = leaveDaysIn(leave, cycle.start, cycle.end);
  // Share of the cycle the person is available; suggested plans shrink to match approved leave.
  const available = Math.max(0, 1 - leaveDays / spanDays(cycle.start, cycle.end));
  const done = callsByAccount(cycleCalls(calls.filter((c) => c.ownerId === ownerId), cycle));
  const territory = accounts.filter((a) => a.ownerId === ownerId);

  const attempt = (f: () => void) => {
    try {
      f();
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  const saveTargets = (targets: PlanTarget[]) =>
    attempt(() =>
      run({
        type: 'plan.save',
        plan: plan ? { ...plan, targets } : { id: newId('pln'), ownerId, cycleId: cycle.id, status: 'Draft', targets, updatedAt: new Date().toISOString() },
      }),
    );

  const scheme = tiersFor(data.settings, data.users, ownerId);
  // Tier frequencies are calls per quarter; a monthly cycle suggests a third of them.
  const cycleLength = lengthOfCycle(cycle);
  const freqOf = (tier: string) => scaleFrequency(tierFrequency(scheme, tier), cycleLength);

  if (!plan) {
    if (!isOwner) return <Empty icon="calendar-outline">{owner?.name ?? 'This rep'} has no plan for {cycle.name} yet.</Empty>;
    // Key opinion leaders and high-potential doctors get extra calls; approved leave scales the plan down.
    const want = (a: (typeof territory)[number]) => {
      const n = freqOf(a.tier) + profileBoost(a, cycleLength);
      return n > 0 ? Math.max(1, Math.round(n * available)) : 0;
    };
    const suggested = territory.filter((a) => want(a) > 0).map((a) => ({ accountId: a.id, planned: want(a) }));
    const total = suggested.reduce((n, t) => n + t.planned, 0);
    return (
      <View>
      <Card>
        <Text style={text.h2}>Plan {cycle.name}</Text>
        <Text style={[text.muted, { marginTop: 4 }]}>
          {formatDate(cycle.start)} – {formatDate(cycle.end)}
        </Text>
        <Text style={[text.body, { marginVertical: space.md }]}>
          Start from a suggested plan: all {territory.length} of your accounts at their tier frequency ({scheme.map((t) => `${t.name} ${freqOf(t.name)}`).join(', ')} calls {cycleLength === 'month' ? 'this month' : 'per cycle'}), {total} calls in total. You can adjust each account before submitting.
        </Text>
        {(territory.some((a) => profileBoost(a, cycleLength) > 0) || leaveDays > 0) && (
          <Text style={[text.small, { marginBottom: space.md }]}>
            {territory.some((a) => profileBoost(a, cycleLength) > 0) ? 'Key opinion leaders and high-potential doctors get extra visits. ' : ''}
            {leaveDays > 0 ? `You have ${leaveDays} day${leaveDays === 1 ? '' : 's'} of approved leave in this cycle, so the suggestion is ${Math.round(available * 100)}% of the usual.` : ''}
          </Text>
        )}
        {cycleLength === 'month' && <Text style={[text.small, { marginBottom: space.md }]}>Your company plans by month. Tier frequencies are calls per quarter, so the monthly suggestion is about a third of them (at least one call per account).</Text>}
        <Row>
          <Button title="Use suggested plan" icon="sparkles-outline" onPress={() => saveTargets(suggested)} disabled={!territory.length} />
          <Button title="Start empty" variant="secondary" onPress={() => saveTargets([])} />
        </Row>
      </Card>
      <PlanAssist ownerId={ownerId} cycle={cycle} hasPlan={false} onAccept={saveTargets} />
      </View>
    );
  }

  const planned = plan.targets.reduce((n, t) => n + t.planned, 0);
  const onPlan = plan.targets.reduce((n, t) => n + Math.min(t.planned, done.get(t.accountId)?.length ?? 0), 0);
  const attainment = planned ? onPlan / planned : 0;
  const remaining = planned - onPlan;
  const days = workingDaysLeft(cycle);
  const outside = territory.filter((a) => !plan.targets.some((t) => t.accountId === a.id));
  const byTier = (t: PlanTarget) => tierRank(scheme, getAccount(t.accountId)?.tier ?? '');
  const targets = [...plan.targets].sort((a, b) => byTier(a) - byTier(b) || (getAccount(a.accountId)?.name ?? '').localeCompare(getAccount(b.accountId)?.name ?? ''));

  return (
    <View>
      {leaveDays > 0 && (
        <Banner tone="info" icon="airplane-outline">
          {isOwner ? 'You have' : `${owner?.name ?? 'This rep'} has`} {leaveDays} day{leaveDays === 1 ? '' : 's'} of approved leave in {cycle.name}. The pace marker leaves those days out, so leave does not count as falling behind.
        </Banner>
      )}
      {!isOwner && owner && (
        <Card>
          <Row gap={space.md}>
            <UserAvatar user={owner} />
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{owner.name}</Text>
              <Text style={text.muted}>{owner.territory}</Text>
            </View>
            <PlanBadge status={plan.status} />
          </Row>
        </Card>
      )}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text style={text.h2}>{cycle.name}</Text>
            <Text style={text.muted}>
              {formatDate(cycle.start)} – {formatDate(cycle.end)} · {daysLeft(cycle)} days left
            </Text>
          </View>
          {isOwner && <PlanBadge status={plan.status} />}
        </Row>
        <Row style={{ marginTop: space.lg, justifyContent: 'space-between' }}>
          <Text style={text.title}>
            {onPlan} of {planned} planned calls
          </Text>
          <Text style={[text.title, { color: paceColor(attainment, elapsed) }]}>{pct(attainment)}</Text>
        </Row>
        <View style={{ marginTop: space.sm }}>
          <ProgressBar value={attainment} marker={elapsed} color={paceColor(attainment, elapsed)} height={10} />
        </View>
        <Text style={[text.muted, { marginTop: space.sm }]}>
          {plan.targets.length} accounts · {remaining > 0 && days > 0 ? `about ${(remaining / days).toFixed(1)} planned calls per working day to finish` : remaining > 0 ? 'cycle ending' : 'all planned calls done'}
        </Text>
      </Card>

      {plan.status === 'Rejected' && plan.reviewNote && (
        <Banner tone="danger">
          {getUser(plan.reviewerId)?.name ?? 'Your manager'} asked for changes: {plan.reviewNote}
        </Banner>
      )}
      {plan.status === 'Approved' && (
        <Banner tone="success">
          Approved by {getUser(plan.reviewerId)?.name ?? 'manager'}
          {plan.reviewedAt ? ` on ${formatDate(plan.reviewedAt)}` : ''}.{plan.reviewNote ? ` “${plan.reviewNote}”` : ''}
        </Banner>
      )}
      {plan.status === 'Submitted' && isOwner && <Banner tone="warn">Waiting for {getUser(owner?.managerId)?.name ?? 'your manager'} to approve.</Banner>}

      {canReview && (
        <Card style={{ borderColor: colors.warn }}>
          <Text style={text.h2}>Review this plan</Text>
          <Field label="Note to the rep" value={note} onChangeText={setNote} placeholder="Required when requesting changes" multiline />
          <Row>
            <Button title="Approve" icon="checkmark-circle-outline" onPress={() => attempt(() => run({ type: 'plan.review', id: plan.id, approve: true, note }))} />
            <Button title="Request changes" variant="danger" onPress={() => attempt(() => run({ type: 'plan.review', id: plan.id, approve: false, note }))} />
          </Row>
        </Card>
      )}

      {editable && <PlanAssist ownerId={ownerId} cycle={cycle} hasPlan onAccept={saveTargets} />}

      <SectionTitle right={editable ? <Text style={text.small}>Tap − / + to change calls</Text> : undefined}>Accounts in plan</SectionTitle>
      {targets.length === 0 && <Empty>No accounts yet. Add some below.</Empty>}
      {targets.map((t) => {
        const a = getAccount(t.accountId);
        const n = done.get(t.accountId)?.length ?? 0;
        return (
          <Card key={t.accountId} style={{ paddingVertical: space.md }}>
            <Row>
              <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/account/[id]', params: { id: t.accountId } })}>
                <Text style={text.title} numberOfLines={1}>
                  {a?.name ?? 'Account'}
                </Text>
                <Text style={text.muted} numberOfLines={1}>
                  {a?.specialty} · {n} of {t.planned} done
                </Text>
              </Pressable>
              {a && <TierBadge tier={a.tier} />}
            </Row>
            <Row style={{ marginTop: space.sm }}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={n / t.planned} marker={elapsed} color={n >= t.planned ? colors.success : colors.primary} height={6} />
              </View>
              {editable ? (
                <>
                  <Stepper value={t.planned} onChange={(v) => saveTargets(plan.targets.map((x) => (x.accountId === t.accountId ? { ...x, planned: v } : x)))} />
                  <Pressable accessibilityLabel="Remove from plan" onPress={() => saveTargets(plan.targets.filter((x) => x.accountId !== t.accountId))} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={22} color={colors.faint} />
                  </Pressable>
                </>
              ) : (
                isOwner && <Button small title="Schedule" variant="secondary" onPress={() => router.push({ pathname: '/call/edit', params: { accountId: t.accountId, plan: '1' } })} />
              )}
            </Row>
          </Card>
        );
      })}

      {editable && outside.length > 0 && (
        <>
          <SectionTitle right={<Text style={text.link} onPress={() => setAdding(!adding)}>{adding ? 'Hide' : `Show ${outside.length}`}</Text>}>Not in plan</SectionTitle>
          {adding && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {outside.map((a) => (
                <Chip key={a.id} icon="add" label={`${a.name} · ${a.tier}`} onPress={() => saveTargets([...plan.targets, { accountId: a.id, planned: Math.max(1, freqOf(a.tier)) }])} />
              ))}
            </View>
          )}
        </>
      )}

      {isOwner && (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          {editable ? (
            <Button
              title="Submit for approval"
              icon="paper-plane-outline"
              disabled={!plan.targets.length}
              onPress={() => confirm('Submit plan?', `${getUser(owner?.managerId)?.name ?? 'Your manager'} will review it. You can withdraw it later to make changes.`, () => attempt(() => run({ type: 'plan.submit', id: plan.id })), 'Submit')}
            />
          ) : (
            <Button
              title={plan.status === 'Approved' ? 'Revise plan' : 'Withdraw to edit'}
              variant="secondary"
              icon="create-outline"
              onPress={() => confirm('Change the plan?', 'The plan goes back to draft and needs approval again after you resubmit.', () => attempt(() => run({ type: 'plan.reopen', id: plan.id })), 'Continue')}
            />
          )}
        </View>
      )}
    </View>
  );
}

