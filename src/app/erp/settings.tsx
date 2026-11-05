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

      <PriceLists products={products} />
      <OperationsRules />

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

/** 2.14: named price lists (e.g. Hospitals, Pharmacies, Distributor). A customer on a list pays its prices; blanks fall back to the standard price. */
function PriceLists({ products }: { products: Product[] }) {
  const { run, settings } = useErp();
  const [lists, setLists] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(Object.entries(settings.priceLists ?? {}).map(([g, m]) => [g, Object.fromEntries(Object.entries(m).map(([p, v]) => [p, String(v)]))])),
  );
  const [name, setName] = useState('');
  const save = () => {
    const priceLists = Object.fromEntries(
      Object.entries(lists).map(([g, m]) => [g, Object.fromEntries(Object.entries(m).filter(([, v]) => v.trim() !== '' && Number(v) >= 0).map(([p, v]) => [p, round2(Number(v))]))]),
    );
    try {
      run({ type: 'settings.update', settings: { erp: { ...settings, priceLists } } });
      notify('Saved', 'Customers on a list are charged its prices on new sales and orders.');
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <SectionTitle>Price lists</SectionTitle>
      <Text style={[text.muted, { marginBottom: space.sm }]}>Different prices for different customers. Finance puts each customer on a list from its customer page. A list named “Distributor” is used for customers who buy through a distributor.</Text>
      {Object.entries(lists).map(([g, m]) => (
        <Card key={g}>
          <Row>
            <Text style={[text.title, { flex: 1 }]}>{g}</Text>
            <Button small variant="ghost" title="Remove" onPress={() => setLists(Object.fromEntries(Object.entries(lists).filter(([k]) => k !== g)))} />
          </Row>
          {products.map((p) => (
            <Row key={p.id} style={{ paddingVertical: 2 }}>
              <Text style={[text.body, { flex: 1 }]}>
                {p.name} <Text style={text.small}>standard {p.price ?? '–'}</Text>
              </Text>
              <View style={{ width: 130 }}>
                <Field label="" value={m[p.name] ?? ''} onChangeText={(v) => setLists({ ...lists, [g]: { ...m, [p.name]: v.replace(/[^\d.]/g, '') } })} keyboardType="decimal-pad" placeholder="standard" />
              </View>
            </Row>
          ))}
        </Card>
      ))}
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}>
          <Field label="New list" value={name} onChangeText={setName} placeholder="e.g. Hospitals" />
        </View>
        <Button small variant="ghost" title="Add" disabled={!name.trim() || name.trim() in lists} onPress={() => (setLists({ ...lists, [name.trim()]: {} }), setName(''))} />
      </Row>
      <Button title="Save price lists" onPress={save} />
    </>
  );
}

/** 2.14: near-expiry warning, proof of delivery and what incentives count. */
function OperationsRules() {
  const { run, settings } = useErp();
  const [days, setDays] = useState(String(settings.nearExpiryDays ?? 90));
  const [pod, setPod] = useState(!!settings.requireDelivery);
  const [incentive, setIncentive] = useState<'collected' | 'sales'>(settings.incentiveOn ?? 'collected');
  const save = () => {
    try {
      run({ type: 'settings.update', settings: { erp: { ...settings, nearExpiryDays: parseInt(days, 10) || 0, requireDelivery: pod, incentiveOn: incentive } } });
      notify('Saved', 'The new rules apply from now on.');
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <SectionTitle>Stock, delivery and incentives</SectionTitle>
      <Card>
        <Field label="Warn about stock expiring within (days)" value={days} onChangeText={(v) => setDays(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        <ToggleRow label="Ask for proof of delivery" value={pod} onChange={setPod} hint="Invoices show Record delivery until the customer signs or a photo is taken." />
        <Text style={[text.small, { marginTop: space.sm }]}>Incentives count</Text>
        <Row gap={space.sm}>
          <Button small variant={incentive === 'collected' ? 'primary' : 'ghost'} title="Money collected" onPress={() => setIncentive('collected')} />
          <Button small variant={incentive === 'sales' ? 'primary' : 'ghost'} title="Sales invoiced" onPress={() => setIncentive('sales')} />
        </Row>
        <Button title="Save" onPress={save} />
      </Card>
    </>
  );
}
