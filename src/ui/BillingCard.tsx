import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { refreshLicense } from '@/cloud/license';
import { api, loadToken, type BillingPlan, type BillingQuote } from '@/cloud/relay';
import { formatDate } from '@/data/dates';
import { useStore } from '@/data/store';
import { Banner, Button, Card, Row, SectionTitle, text } from '@/ui/components';
import { colors, radius, space } from '@/ui/theme';

export const money = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${Math.round(minor / 100).toLocaleString()}`;
  }
};

/**
 * Subscription and online payment (Paystack), for administrators in the web app only: the phone
 * apps never sell or link to purchases, as the app stores require. After paying, Paystack sends
 * the administrator back to this page with ?reference=…, which is checked with the server.
 */
export function BillingCard() {
  const { license, licenseFile, saveLicense } = useStore();
  const params = useLocalSearchParams<{ reference?: string; trxref?: string }>();
  const [quote, setQuote] = useState<BillingQuote>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [done, setDone] = useState<string>();

  const load = useCallback(async () => {
    const token = await loadToken();
    if (!token) return;
    api.billingQuote(token).then(setQuote, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') load();
  }, [load]);

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
          setDone(`Payment received. Your subscription now runs until ${r.subscriptionEnd ? formatDate(r.subscriptionEnd.slice(0, 10)) : 'the new end date'}.`);
          load();
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

  const pay = async (plan: BillingPlan) => {
    setError(undefined);
    setBusy('Opening secure checkout…');
    try {
      const token = await loadToken();
      if (!token) throw new Error('Please sign in again.');
      const r = await api.billingCheckout(token, plan);
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(undefined);
    }
  };

  const active = license.state === 'active';
  return (
    <>
      <SectionTitle>Subscription</SectionTitle>
      <Card>
        {!!done && <Banner tone="success" icon="checkmark-circle-outline">{done}</Banner>}
        {!!error && <Banner tone="danger">{error}</Banner>}
        {!quote && !error && <ActivityIndicator color={colors.primary} />}
        {quote && (
          <>
            <Text style={text.body}>
              {money(quote.perUserMonth * 100, quote.currency)} per user per month · {quote.activeUsers} active user{quote.activeUsers === 1 ? '' : 's'}
              {quote.activeUsers < quote.minSeats ? ` (billed as ${quote.minSeats}, the minimum)` : ''}
            </Text>
            <Text style={[text.muted, { marginBottom: space.md }]}>
              {active ? 'Paying adds time after your current end date.' : 'Pay to switch Ava CRM on for your team straight away.'} Card, bank transfer and USSD are accepted through Paystack.
            </Text>
            {quote.configured ? (
              <Row gap={space.md} style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
                {(['month', 'year'] as const).map((p) => {
                  const q = quote.plans[p];
                  return (
                    <View key={p} style={{ flexGrow: 1, flexBasis: 220, borderWidth: 1, borderColor: p === 'year' ? colors.primary : colors.border, borderRadius: radius.md, padding: space.md, gap: 4 }}>
                      <Row>
                        <Text style={[text.title, { flex: 1 }]}>{p === 'year' ? '1 year' : '1 month'}</Text>
                        {p === 'year' && <Text style={{ color: colors.success, fontWeight: '700', fontSize: 12 }}>2 MONTHS FREE</Text>}
                      </Row>
                      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{money(q.amount, q.currency)}</Text>
                      <Text style={[text.small, { marginBottom: space.sm }]}>{q.seats} users · {q.days} days</Text>
                      <Button small title={`Pay ${money(q.amount, q.currency)}`} icon="card-outline" variant={p === 'year' ? 'primary' : 'secondary'} onPress={() => pay(p)} disabled={!!busy} />
                    </View>
                  );
                })}
              </Row>
            ) : (
              <Banner tone="warn">Online payment is not switched on yet. Contact Ava Healthcare at hello@avahealthcareltd.com to renew.</Banner>
            )}
            {!!quote.licence?.payments?.length && (
              <View style={{ marginTop: space.md }}>
                <Text style={[text.small, { fontWeight: '700' }]}>Recent payments</Text>
                {quote.licence.payments.slice().reverse().map((x) => (
                  <Text key={x.reference} style={text.small}>
                    {formatDate(x.at.slice(0, 10))} · {money(x.amount, x.currency)} · {x.months === 12 ? '1 year' : `${x.months} month${x.months > 1 ? 's' : ''}`} · {x.seats} users · {x.reference}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}
        {!!busy && (
          <Row style={{ marginTop: space.sm }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={text.muted}>{busy}</Text>
          </Row>
        )}
      </Card>
    </>
  );
}
