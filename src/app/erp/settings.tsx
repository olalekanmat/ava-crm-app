import { useState } from 'react';
import { Text, View } from 'react-native';
import { round2 } from '@/data/erp';
import type { Product } from '@/data/types';
import { Banner, Button, Card, Field, Row, SectionTitle, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { ErpOff, useErp } from '@/ui/erp';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/** Administrators: the price list and how invoices look (VAT, numbering, terms, bank details). */
export default function ErpSettingsScreen() {
  const { erp, admin, run, settings, data } = useErp();
  const [currency, setCurrency] = useState(settings.currency);
  const [vat, setVat] = useState(String(settings.vatPercent));
  const [prefix, setPrefix] = useState(settings.prefix);
  const [terms, setTerms] = useState(String(settings.termsDays));
  const [low, setLow] = useState(String(settings.lowStock));
  const [pay, setPay] = useState(settings.paymentDetails ?? '');
  // 2.13 credit and order rules
  const [defLimit, setDefLimit] = useState(String(settings.defaultCreditLimit ?? 2000000));
  const [defDays, setDefDays] = useState(String(settings.defaultCreditDays ?? 0));
  const [holdDays, setHoldDays] = useState(String(settings.holdOverdueDays ?? 30));
  const [discount, setDiscount] = useState(String(settings.discountApproval ?? 10));
  const [hcoOnly, setHcoOnly] = useState(settings.hcoOnly ?? true);
  const [repsInvoice, setRepsInvoice] = useState(!!settings.repsInvoice);
  if (!erp) return <ErpOff />;
  if (!admin) return <Screen><Banner tone="info">Only administrators change prices and invoice settings.</Banner></Screen>;

  const saveRules = () => {
    try {
      // Starts from the current settings so the 2.13 credit rules are kept.
      run({ type: 'settings.update', settings: { erp: { ...settings, currency: currency.trim().toUpperCase(), vatPercent: Number(vat) || 0, prefix: prefix.trim().toUpperCase(), termsDays: parseInt(terms, 10) || 0, lowStock: parseInt(low, 10) || 0, paymentDetails: pay.trim() || undefined } } });
      notify('Saved', 'New invoices use these settings. Invoices already made keep theirs.');
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  const saveCredit = () => {
    try {
      run({
        type: 'settings.update',
        settings: { erp: { ...settings, rulesVersion: 2, defaultCreditLimit: Number(defLimit) || 0, defaultCreditDays: parseInt(defDays, 10) || 0, holdOverdueDays: parseInt(holdDays, 10) || 0, discountApproval: Number(discount) || 0, hcoOnly, repsInvoice } },
      });
      notify('Saved', 'New orders and invoices follow these rules.');
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  const products = data.products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Screen>
      <SectionTitle>Price list</SectionTitle>
      <Text style={[text.muted, { marginBottom: space.md }]}>Prices are before VAT. Products without a price are hidden from New sale once any product has one.</Text>
      {products.length ? products.map((p) => <PriceRow key={p.id} product={p} />) : <Banner tone="info">Add products first in Products & rules.</Banner>}

      <SectionTitle>Credit and orders</SectionTitle>
      <Card>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="Default credit limit" value={defLimit} onChangeText={(v) => setDefLimit(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" hint="For customers without their own" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Default credit days" value={defDays} onChangeText={(v) => setDefDays(v.replace(/\D/g, ''))} keyboardType="number-pad" hint="0 = cash and carry" />
          </View>
        </Row>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="Hold orders when debt is overdue by more than (days)" value={holdDays} onChangeText={(v) => setHoldDays(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Discounts above (%) need a credit approver" value={discount} onChangeText={(v) => setDiscount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
          </View>
        </Row>
        <ToggleRow label="Sell only to business accounts (HCOs)" value={hcoOnly} onChange={setHcoOnly} hint="Orders and invoices go to hospitals, pharmacies and clinics, not to doctors." />
        <ToggleRow label="Reps can also invoice on the spot" value={repsInvoice} onChange={setRepsInvoice} hint="For van sales. Off: reps place orders and the invoicing officer invoices them." />
        <Text style={[text.small, { marginBottom: space.sm }]}>Changing one customer’s limit or days is done by Finance in Credit limits & days, with a credit approver’s approval.</Text>
        <Button title="Save credit rules" icon="checkmark" onPress={saveCredit} />
      </Card>

      <SectionTitle>Invoices</SectionTitle>
      <Card>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="VAT (%)" value={vat} onChangeText={(v) => setVat(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" hint="Nigeria: 7.5" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Currency" value={currency} onChangeText={setCurrency} maxLength={3} autoCapitalize="characters" />
          </View>
        </Row>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="Invoice numbers start with" value={prefix} onChangeText={setPrefix} maxLength={8} autoCapitalize="characters" hint={`e.g. ${prefix || 'INV'}-0042-0001`} />
          </View>
          <View style={{ flex: 1 }}>
            {!settings.rulesVersion && <Field label="Payment terms (days)" value={terms} onChangeText={(v) => setTerms(v.replace(/\D/g, ''))} keyboardType="number-pad" hint="0 = on delivery" />}
          </View>
        </Row>
        <Field label="Low stock at (units)" value={low} onChangeText={(v) => setLow(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        <Field label="How customers pay you" value={pay} onChangeText={setPay} multiline placeholder={'Bank: …\nAccount number: …\nAccount name: …'} hint="Printed on every invoice and statement that is not fully paid." />
        <Button title="Save invoice settings" icon="checkmark" onPress={saveRules} />
      </Card>
    </Screen>
  );
}

function PriceRow({ product }: { product: Product }) {
  const { run, money } = useErp();
  const [price, setPrice] = useState(product.price !== undefined ? String(product.price) : '');
  const [sku, setSku] = useState(product.sku ?? '');
  const [exempt, setExempt] = useState(!!product.vatExempt);
  const changed = price !== (product.price !== undefined ? String(product.price) : '') || sku !== (product.sku ?? '') || exempt !== !!product.vatExempt;
  const save = () => {
    try {
      run({ type: 'product.upsert', product: { ...product, price: price.trim() ? round2(Number(price)) : -1, sku: sku.trim(), vatExempt: exempt } });
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card>
      <Row>
        <Text style={[text.title, { flex: 1 }]}>{product.name}</Text>
        <Text style={[text.muted, product.price === undefined && { color: colors.warn }]}>{product.price !== undefined ? money(product.price) : 'No price'}</Text>
      </Row>
      <Row gap={space.md} style={{ marginTop: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Price per unit" value={price} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Stock code" value={sku} onChangeText={setSku} placeholder="Optional" />
        </View>
      </Row>
      <ToggleRow label="VAT exempt" value={exempt} onChange={setExempt} />
      {changed && <Button small title="Save" icon="checkmark" onPress={save} />}
    </Card>
  );
}
