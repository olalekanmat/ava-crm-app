import { useState } from 'react';
import { Text, View } from 'react-native';
import { todayIso } from '@/data/erp';
import { campaignReach } from '@/data/growth';
import { newId } from '@/data/ids';
import { can } from '@/data/roles';
import { useMe, useStore } from '@/data/store';
import type { Campaign, CampaignStatus } from '@/data/types';
import { Badge, Button, Card, Chip, Empty, Field, Label, ProgressBar, Row, SectionTitle, Stepper, text } from '@/ui/components';
import { confirm } from '@/ui/confirm';
import { useAttempt } from '@/ui/opsCards';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const STATUSES: CampaignStatus[] = ['Draft', 'Live', 'Ended'];

function Editor({ c, onDone }: { c?: Campaign; onDone: () => void }) {
  const me = useMe();
  const { products, data } = useStore();
  const attempt = useAttempt();
  const today = todayIso();
  const tiers = [...new Set(data.accounts.filter((a) => !a.deletedAt).map((a) => a.tier))].sort();
  const [name, setName] = useState(c?.name ?? '');
  const [product, setProduct] = useState(c?.product ?? '');
  const [chosen, setChosen] = useState<string[]>(c?.tiers ?? []);
  const [frequency, setFrequency] = useState(c?.frequency ?? 2);
  const [start, setStart] = useState(c?.start ?? today);
  const [end, setEnd] = useState(c?.end ?? today);
  const [messages, setMessages] = useState((c?.keyMessages ?? []).join('\n'));
  const [status, setStatus] = useState<CampaignStatus>(c?.status ?? 'Draft');
  const targets = data.accounts.filter((a) => !a.deletedAt && a.type === 'HCP' && (!chosen.length || chosen.includes(a.tier)));
  const save = () =>
    attempt({ type: 'campaign.save', campaign: { id: c?.id ?? newId('cmp'), name, product: product || undefined, keyMessages: messages.split('\n'), objectives: c?.objectives ?? [], targetIds: targets.map((a) => a.id), tiers: chosen, frequency, start, end, status, ownerId: me.id, createdAt: c?.createdAt ?? '', updatedAt: '' } }, onDone);
  return (
    <Card>
      <Field label="Campaign name" value={name} onChangeText={setName} placeholder="e.g. Cardiovex Q1 launch" />
      <Label>Product</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {products.filter((p) => p.active).map((p) => (
          <Chip key={p.name} label={p.name} selected={p.name === product} onPress={() => setProduct(product === p.name ? '' : p.name)} />
        ))}
      </View>
      <Label>Doctors to reach (by tier; none chosen means all)</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {tiers.map((t) => (
          <Chip key={t} label={t} selected={chosen.includes(t)} onPress={() => setChosen(chosen.includes(t) ? chosen.filter((x) => x !== t) : [...chosen, t])} />
        ))}
      </View>
      <Row>
        <Text style={[text.muted, { flex: 1 }]}>{targets.length} doctors · calls each</Text>
        <Stepper value={frequency} min={1} max={50} onChange={setFrequency} />
      </Row>
      <Row gap={space.sm}>
        <Field label="Start (YYYY-MM-DD)" value={start} onChangeText={setStart} />
        <Field label="End" value={end} onChangeText={setEnd} />
      </Row>
      <Field label="Key messages (one per line)" value={messages} onChangeText={setMessages} multiline />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {STATUSES.map((st) => (
          <Chip key={st} label={st} selected={st === status} onPress={() => setStatus(st)} />
        ))}
      </View>
      <Row gap={space.sm}>
        <Button small variant="ghost" title="Cancel" onPress={onDone} />
        <Button small title="Save" disabled={!name.trim()} onPress={save} />
      </Row>
    </Card>
  );
}

/** 2.15 campaigns: a product push to a set of doctors, with reach (doctors seen) and frequency (calls made). */
export default function CampaignsScreen() {
  const me = useMe();
  const { data } = useStore();
  const attempt = useAttempt();
  const marketing = can(me, 'marketing');
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const list = (data.campaigns ?? []).slice().sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || b.start.localeCompare(a.start));
  const visible = marketing ? list : list.filter((c) => c.status === 'Live');
  return (
    <Screen wide>
      {marketing && !editing && <Button title="New campaign" icon="megaphone-outline" onPress={() => setEditing('new')} />}
      {editing && <Editor c={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      <SectionTitle>{marketing ? 'Campaigns' : 'Live campaigns'}</SectionTitle>
      {visible.length ? (
        visible.map((c) => {
          const r = campaignReach(data, c);
          return (
            <Card key={c.id}>
              <Row>
                <Text style={[text.title, { flex: 1 }]}>{c.name}</Text>
                <Badge label={c.status} fg={c.status === 'Live' ? colors.success : colors.muted} bg={colors.sunken} />
              </Row>
              <Text style={text.muted}>
                {c.product ? `${c.product} · ` : ''}
                {c.start} to {c.end}
                {c.tiers?.length ? ` · tiers ${c.tiers.join(', ')}` : ''}
              </Text>
              {c.keyMessages.length > 0 && <Text style={text.small}>{c.keyMessages.join(' · ')}</Text>}
              <Text style={[text.small, { marginTop: space.xs }]}>
                Reach: {r.reached} of {r.targets} doctors seen ({r.targets ? Math.round((r.reached / r.targets) * 100) : 0}%)
              </Text>
              <ProgressBar value={r.targets ? r.reached / r.targets : 0} />
              <Text style={[text.small, { marginTop: space.xs }]}>
                Frequency: {r.calls} of {r.goal} calls
              </Text>
              <ProgressBar value={r.goal ? Math.min(1, r.calls / r.goal) : 0} color={colors.orange} />
              {marketing && (
                <Row gap={space.sm} style={{ marginTop: space.sm }}>
                  <Button small variant="ghost" title="Edit" onPress={() => setEditing(c)} />
                  <Button small variant="ghost" title="Delete" onPress={() => confirm(`Delete ${c.name}?`, 'The campaign is removed; calls are kept.', () => attempt({ type: 'campaign.delete', id: c.id }), 'Delete')} />
                </Row>
              )}
            </Card>
          );
        })
      ) : (
        <Empty icon="megaphone-outline">{marketing ? 'Start a campaign to focus reps on a product and a set of doctors.' : 'No live campaigns right now.'}</Empty>
      )}
    </Screen>
  );
}
