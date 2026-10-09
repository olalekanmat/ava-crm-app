import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { refreshLicense } from '@/cloud/license';
import { ApiError, api, loadToken, type BillingPick, type BillingQuote } from '@/cloud/relay';
import { activeUserCount } from '@/data/access';
import { formatDate } from '@/data/dates';
import { useStore } from '@/data/store';
import { previewBilling, previewState, UI_PREVIEW } from '@/dev/preview';
import { Banner, Button, Card, ProgressBar, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { useLayout } from '@/ui/layout';
import { colors, radius, space, tone } from '@/ui/theme';

export const money = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${Math.round(minor / 100).toLocaleString()}`;
  }
};

const months = (n: number) => (n % 12 === 0 ? `${n / 12} year${n > 12 ? 's' : ''}` : `${n} month${n === 1 ? '' : 's'}`);
const PRESETS = [1, 3, 6, 12, 24];
type Mode = 'renew' | 'add';

/**
 * Subscription and online payment (Paystack), for administrators in the web app only: the phone
 * apps never sell or link to purchases, as the app stores require. The administrator picks how
 * many users and how many months, or buys extra users for the rest of the current term. After
 * paying, Paystack sends them back to this page with ?reference=…, which is checked with the server.
 */
export function BillingCard() {
  const { license, licenseFile, saveLicense, data } = useStore();
  const narrow = useLayout().width < 560;
  const params = useLocalSearchParams<{ reference?: string; trxref?: string }>();
  const [info, setInfo] = useState<BillingQuote>();
  const [picked, setPick] = useState<BillingPick>();
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [done, setDone] = useState<string>();
  const asked = useRef(0);

  const ask = useCallback(async (p: BillingPick) => {
    const n = ++asked.current;
    const token = UI_PREVIEW ? 'preview' : await loadToken();
    if (!token) return;
    setPricing(true);
    try {
      const q = UI_PREVIEW ? (previewBilling(p, activeUserCount(previewState().snapshot.users)) as BillingQuote) : await api.billingQuote(token, p);
      if (n !== asked.current) return;
      setInfo(q);
      setError(undefined);
      // The server may raise the users to the minimum or to the people already active.
      setPick((cur) => {
        const c = cur ?? p;
        return c.kind === q.quote.kind && c.seats !== q.quote.seats ? { ...c, seats: q.quote.seats } : cur;
      });
    } catch (e) {
      if (n === asked.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (n === asked.current) setPricing(false);
    }
  }, []);

  // Until the administrator changes it: renew for one month with everyone active (or the licences already bought).
  const pick: BillingPick = picked ?? { kind: 'renew', months: 1, seats: Math.max(activeUserCount(data.users), license.state === 'active' ? license.payload.seats ?? 0 : 0) };

  // Price it, shortly after the administrator stops changing the numbers.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (info && pick.kind === info.quote.kind && pick.seats === info.quote.seats && (pick.kind === 'add' || pick.months === info.quote.months)) return;
    const t = setTimeout(() => ask(pick), info ? 250 : 0);
    return () => clearTimeout(t);
  }, [pick.kind, pick.months, pick.seats, info, ask]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back from Paystack.
  const reference = params.reference || params.trxref;
  useEffect(() => {
    if (Platform.OS !== 'web' || !reference) return;
    (async () => {
      setBusy('Confirming your payment…');
      try {
        const token = await loadToken();
        if (!token) throw new Error('Please sign in again.');
        const r = await api.billingVerify(token, reference);
        if (r.status === 'paid') {
          if (licenseFile) await saveLicense(await refreshLicense(licenseFile));
          setDone(`Payment received. ${r.seats ? `You now have ${r.seats} user licences, ` : 'Your subscription runs '}until ${r.subscriptionEnd ? formatDate(r.subscriptionEnd.slice(0, 10)) : 'the new end date'}.`);
          setPick(undefined);
          setInfo(undefined);
        } else if (r.status === 'mismatch') setError('The amount paid did not match the order. Contact Ava Healthcare with your payment reference: ' + reference);
        else setError('The payment was not completed. You have not been charged; try again when you are ready.');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(undefined);
        router.setParams({ reference: undefined, trxref: undefined });
      }
    })();
    // Only once per reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  if (Platform.OS !== 'web') return null;

  const pay = async () => {
    if (!info) return;
    setError(undefined);
    setBusy('Opening secure checkout…');
    try {
      const token = await loadToken();
      if (!token) throw new Error('Please sign in again.');
      const r = await api.billingCheckout(token, pick, info.quote.amount);
      window.location.assign(r.url);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'price_changed') ask(pick);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(undefined);
    }
  };

  const lic = info?.licence;
  const seats = lic?.seats ?? (license.state === 'active' ? license.payload.seats : undefined);
  const used = activeUserCount(data.users);
  const active = license.state === 'active';
  const canAdd = active && !!seats;
  const q = info?.quote;
  const minUsers = info ? Math.max(info.minSeats, used) : 1;
  const presets = PRESETS.filter((m) => !info || m <= info.maxMonths);
  const offFor = (m: number) => info?.durationDiscounts.filter((d) => m >= d.minMonths).sort((a, b) => b.minMonths - a.minMonths)[0];
  const setMode = (kind: Mode) => setPick({ ...pick, kind, seats: kind === 'add' ? 1 : Math.max(minUsers, seats ?? 0) });

  return (
    <>
      <SectionTitle>Subscription</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Plan summary */}
        <LinearGradient colors={[colors.ink, colors.primaryDark, colors.primary]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={{ flex: 1, minWidth: 220, gap: 6 }}>
            <Text style={styles.heroKicker}>YOUR PLAN</Text>
            <Text style={styles.heroTitle}>
              {active ? `Active until ${formatDate(license.payload.subscriptionEnd.slice(0, 10))}` : license.state === 'expired' ? 'Expired' : 'Not active yet'}
            </Text>
            <Text style={styles.heroSub}>
              {info ? `${money(info.perUserMonth * 100, info.currency)} per user per month · minimum ${info.minSeats} users` : 'Loading prices…'}
            </Text>
          </View>
          <View style={[styles.seatBox, narrow && { flexGrow: 1 }]}>
            <Text style={styles.heroKicker}>USERS</Text>
            <Text style={styles.seatNumber}>
              {used}
              <Text style={styles.seatOf}> / {seats ?? '∞'}</Text>
            </Text>
            <ProgressBar value={seats ? Math.min(1, used / seats) : 0} color={seats && used >= seats ? tone.important : '#fff'} track="rgba(255,255,255,0.25)" height={6} />
            <Text style={styles.heroSub}>{seats ? (used >= seats ? 'All licences in use' : `${seats - used} free`) : 'No limit set'}</Text>
          </View>
        </LinearGradient>

        <View style={{ padding: space.lg }}>
          {!!done && <Banner tone="success" icon="checkmark-circle-outline">{done}</Banner>}
          {!!error && <Banner tone="danger">{error}</Banner>}
          {!!info?.promotion && (
            <Banner tone="success" icon="pricetag-outline">
              {info.promotion.label}: {info.promotion.percent}% off{info.promotion.until ? ` until ${formatDate(info.promotion.until)}` : ''}.
            </Banner>
          )}
          {!info && !error && <ActivityIndicator color={colors.primary} style={{ marginVertical: space.lg }} />}

          {info && (
            <>
              {canAdd && <Segmented options={['renew', 'add'] as Mode[]} value={pick.kind} onChange={setMode} labels={{ renew: 'Renew or change plan', add: 'Add users now' }} />}

              {pick.kind === 'renew' ? (
                <>
                  <Text style={styles.label}>How long</Text>
                  <View style={styles.terms}>
                    {presets.map((m) => {
                      const off = offFor(m);
                      const on = pick.months === m;
                      return (
                        <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setPick({ ...pick, months: m })} style={[styles.term, on && styles.termOn]}>
                          <Text style={[styles.termText, on && { color: colors.primary }]}>{months(m)}</Text>
                          {!!off?.percent && <Text style={styles.save}>{off.label && m === off.minMonths ? off.label : `Save ${Math.round(off.percent)}%`}</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                  <Row style={{ marginBottom: space.md }}>
                    <Text style={[text.muted, { flex: 1 }]}>Or choose the number of months</Text>
                    <NumberBox value={pick.months} min={1} max={info.maxMonths} onChange={(v) => setPick({ ...pick, months: v })} label="Months" />
                  </Row>
                  <Row style={{ marginBottom: space.xs }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Users</Text>
                      <Text style={text.small}>
                        At least {minUsers}: {used} active now{info.minSeats > used ? `, minimum ${info.minSeats}` : ''}. Room to grow costs the same per user.
                      </Text>
                    </View>
                    <NumberBox value={pick.seats} min={minUsers} max={10000} onChange={(v) => setPick({ ...pick, seats: v })} label="Users" />
                  </Row>
                </>
              ) : (
                <Row style={{ marginBottom: space.xs }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Extra users</Text>
                    <Text style={text.small}>Charged by the day until {lic?.subscriptionEnd ? formatDate(lic.subscriptionEnd.slice(0, 10)) : 'your end date'}, then renewed with the rest.</Text>
                  </View>
                  <NumberBox value={pick.seats} min={1} max={10000} onChange={(v) => setPick({ ...pick, seats: v })} label="Extra users" />
                </Row>
              )}

              {/* Price */}
              {q && (
                <View style={[styles.summary, pricing && { opacity: 0.55 }]}>
                  <Line label={q.kind === 'add' ? `${q.seats} user${q.seats === 1 ? '' : 's'} × ${q.days} days` : `${q.seats} users × ${months(q.months)}`} value={money(q.subtotal, q.currency)} />
                  {q.discounts.map((d) => (
                    <Line key={d.label} label={`${d.label} (${d.percent}%)`} value={`−${money(d.amount, q.currency)}`} good />
                  ))}
                  <View style={styles.rule} />
                  <Row>
                    <Text style={[text.title, { flex: 1 }]}>Total today</Text>
                    <Text style={styles.total}>{money(q.amount, q.currency)}</Text>
                  </Row>
                  <Text style={[text.small, { textAlign: 'right' }]}>
                    {q.kind === 'add'
                      ? `You will have ${(seats ?? 0) + q.seats} user licences`
                      : `${months(q.months)} added ${active ? 'after your current end date' : 'from today'} · about ${money(Math.round(q.amount / Math.max(1, q.seats * q.months)), q.currency)} per user per month`}
                  </Text>
                </View>
              )}

              {info.configured ? (
                <>
                  <Button title={q ? `Pay ${money(q.amount, q.currency)} securely` : 'Pay securely'} icon="lock-closed-outline" onPress={pay} disabled={!!busy || pricing || !q} />
                  <Row style={{ justifyContent: 'center', marginTop: space.sm }}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={colors.faint} />
                    <Text style={text.small}>Card, bank transfer and USSD through Paystack. Ava never sees your card.</Text>
                  </Row>
                </>
              ) : (
                <Banner tone="warn">Online payment is not switched on yet. Contact Ava Healthcare at hello@avahealthcareltd.com to renew.</Banner>
              )}
            </>
          )}

          {!!busy && (
            <Row style={{ marginTop: space.sm }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={text.muted}>{busy}</Text>
            </Row>
          )}

          {!!lic?.payments?.length && (
            <View style={{ marginTop: space.lg }}>
              <Text style={styles.label}>Recent payments</Text>
              {lic.payments.slice().reverse().map((x) => (
                <Row key={x.reference} style={styles.payRow}>
                  <Text style={[text.body, { flex: 1 }]}>
                    {formatDate(x.at.slice(0, 10))} · {x.kind === 'add' ? `${x.seats} more users` : `${months(x.months)} · ${x.seats} users`}
                  </Text>
                  <Text style={[text.body, { fontWeight: '700' }]}>{money(x.amount, x.currency)}</Text>
                </Row>
              ))}
            </View>
          )}
        </View>
      </Card>
    </>
  );
}

function Line({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <Row style={{ marginBottom: 6 }}>
      <Text style={[text.muted, { flex: 1 }, good && { color: colors.success }]}>{label}</Text>
      <Text style={[text.body, good && { color: colors.success, fontWeight: '600' }]}>{value}</Text>
    </Row>
  );
}

/** − [number] + : type a number or step it, kept between min and max. */
function NumberBox({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  // What is being typed; shown instead of the value until the field is left.
  const [draft, setDraft] = useState<string>();
  const commit = (v: number) => {
    setDraft(undefined);
    onChange(Math.min(max, Math.max(min, Math.round(v) || min)));
  };
  return (
    <View style={styles.numberBox}>
      <Pressable accessibilityLabel={`Fewer ${label.toLowerCase()}`} onPress={() => commit(value - 1)} disabled={value <= min} style={styles.numberBtn}>
        <Ionicons name="remove" size={18} color={value <= min ? colors.faint : colors.primary} />
      </Pressable>
      <TextInput
        accessibilityLabel={label}
        value={draft ?? String(value)}
        onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ''))}
        onBlur={() => draft !== undefined && commit(Number(draft))}
        onSubmitEditing={() => draft !== undefined && commit(Number(draft))}
        keyboardType="number-pad"
        style={styles.numberInput}
      />
      <Pressable accessibilityLabel={`More ${label.toLowerCase()}`} onPress={() => commit(value + 1)} disabled={value >= max} style={styles.numberBtn}>
        <Ionicons name="add" size={18} color={value >= max ? colors.faint : colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, padding: space.xl },
  heroKicker: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  heroSub: { color: 'rgba(255,255,255,0.78)', fontSize: 13 },
  seatBox: { minWidth: 170, gap: 6, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  seatNumber: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  seatOf: { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: space.sm },
  terms: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  term: { flexGrow: 1, flexBasis: 96, minHeight: 58, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 2 },
  termOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  termText: { fontSize: 15, fontWeight: '700', color: colors.text },
  save: { fontSize: 11, fontWeight: '700', color: colors.success },
  summary: { backgroundColor: colors.sunken, borderRadius: radius.md, padding: space.lg, marginVertical: space.md },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  total: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  numberBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.card },
  numberBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  numberInput: { width: 58, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text, paddingVertical: 8, outlineStyle: 'none' } as never,
  payRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.hairline },
});
