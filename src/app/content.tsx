import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { todayIso } from '@/data/erp';
import { newId } from '@/data/ids';
import { liveContent } from '@/data/ops';
import { can } from '@/data/roles';
import { useMe, useStore } from '@/data/store';
import { CONTENT_KINDS, type ContentDoc, type ContentKind } from '@/data/types';
import { Badge, Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, ToggleRow, text } from '@/ui/components';
import { ContentCard, useAttempt } from '@/ui/opsCards';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const TONE: Record<ContentDoc['status'], string> = { Draft: colors.muted, Pending: colors.warn, Approved: colors.success, Rejected: colors.danger, Retired: colors.faint };

/** Marketing's form for one item (new, or a new version of an existing one). */
function Editor({ doc, onDone }: { doc?: ContentDoc; onDone: () => void }) {
  const me = useMe();
  const { products, data } = useStore();
  const attempt = useAttempt();
  const [title, setTitle] = useState(doc?.title ?? '');
  const [kind, setKind] = useState<ContentKind>(doc?.kind ?? 'Detail aid');
  const [product, setProduct] = useState(doc?.product ?? '');
  const [url, setUrl] = useState(doc?.url ?? '');
  const [useDeck, setUseDeck] = useState(!!doc?.deckHash);
  const [endDate, setEndDate] = useState(doc?.endDate ?? '');
  const [code, setCode] = useState(doc?.code ?? '');
  const deck = products.find((p) => p.name === product)?.deck;
  const save = () =>
    attempt({ type: 'content.save', doc: { id: doc?.id ?? newId('cnt'), title: title.trim(), kind, product: product || undefined, url: useDeck ? undefined : url.trim() || undefined, deckHash: useDeck ? deck?.hash : undefined, version: doc?.version ?? 1, status: doc?.status ?? 'Draft', endDate: endDate.trim() || undefined, code: code.trim() || undefined, byId: me.id, at: '' } }, onDone);
  return (
    <Card>
      <Field label="Title" value={title} onChangeText={setTitle} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {CONTENT_KINDS.map((k) => (
          <Chip key={k} label={k} selected={k === kind} onPress={() => setKind(k)} />
        ))}
      </View>
      <Label>Product</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {products.filter((p) => p.active).map((p) => (
          <Chip key={p.name} label={p.name} selected={p.name === product} onPress={() => setProduct(product === p.name ? '' : p.name)} />
        ))}
      </View>
      {deck && <ToggleRow label="Use the product's presentation" value={useDeck} onChange={setUseDeck} hint={`${deck.slides} slides, uploaded under Products`} />}
      {!useDeck && <Field label="Link (https://…)" value={url} onChangeText={setUrl} autoCapitalize="none" />}
      <Row gap={space.sm}>
        <Field label="Use until (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} />
        <Field label="Approval code" value={code} onChangeText={setCode} placeholder="e.g. NG-CVX-2026-014" />
      </Row>
      {data.settings.contentApproval && <Text style={[text.small, { marginBottom: space.sm }]}>Saving sends it to Medical/Compliance; reps see it once approved.</Text>}
      <Row gap={space.sm}>
        <Button small variant="ghost" title="Cancel" onPress={onDone} />
        <Button small title={data.settings.contentApproval ? 'Send for approval' : 'Save'} disabled={!title.trim() || (!useDeck && !url.trim())} onPress={save} />
      </Row>
    </Card>
  );
}

/**
 * 2.15 content library: approved material reps can use, with versions, expiry dates and approval
 * codes. With approval switched on, Medical/Compliance approves each new version first.
 */
export default function ContentScreen() {
  const me = useMe();
  const { data, admin } = useStore();
  const attempt = useAttempt();
  const today = todayIso();
  const marketing = can(me, 'marketing');
  const medical = can(me, 'medical');
  const [editing, setEditing] = useState<ContentDoc | 'new' | null>(null);
  const live = liveContent(data, today);
  const all = (data.content ?? []).slice().sort((a, b) => a.title.localeCompare(b.title));
  const pending = all.filter((d) => d.status === 'Pending');
  const others = all.filter((d) => !live.includes(d) && d.status !== 'Pending');

  return (
    <Screen wide>
      {admin && <ToggleRow label="Medical approves material before reps use it" value={!!data.settings.contentApproval} onChange={(v) => attempt({ type: 'settings.update', settings: { contentApproval: v } })} hint="When on, presentations not approved here cannot be shown in calls." />}
      {marketing && !editing && <Button title="Add material" icon="add-circle-outline" onPress={() => setEditing('new')} />}
      {editing && <Editor doc={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}

      {medical && pending.length > 0 && (
        <>
          <SectionTitle>Waiting for your approval ({pending.length})</SectionTitle>
          {pending.map((d) => (
            <ContentCard key={d.id} d={d} />
          ))}
        </>
      )}

      <SectionTitle>Approved for use ({live.length})</SectionTitle>
      {live.length ? (
        <Card style={{ padding: 0 }}>
          {live.map((d) => (
            <Row key={d.id} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <View style={{ flex: 1 }}>
                <Text style={text.title}>
                  {d.title} <Text style={text.small}>v{d.version}</Text>
                </Text>
                <Text style={text.small}>
                  {d.kind}
                  {d.product ? ` · ${d.product}` : ''}
                  {d.code ? ` · ${d.code}` : ''}
                  {d.endDate ? ` · until ${d.endDate}` : ''}
                </Text>
              </View>
              {d.url && <Button small variant="ghost" title="Open" onPress={() => Linking.openURL(d.url!)} />}
              {marketing && <Button small variant="ghost" title="Edit" onPress={() => setEditing(d)} />}
              {(marketing || medical) && <Button small variant="ghost" title="Retire" onPress={() => attempt({ type: 'content.retire', id: d.id })} />}
            </Row>
          ))}
        </Card>
      ) : (
        <Empty icon="albums-outline">{marketing ? 'Add brochures, detail aids and videos for reps.' : 'Approved material from Marketing appears here.'}</Empty>
      )}

      {(marketing || medical) && others.length > 0 && (
        <>
          <SectionTitle>Drafts, sent back, expired and retired</SectionTitle>
          <Card style={{ padding: 0 }}>
            {others.map((d) => (
              <Row key={d.id} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={text.title}>
                    {d.title} <Text style={text.small}>v{d.version}</Text>
                  </Text>
                  {d.reviewNote && <Text style={text.small}>Medical: {d.reviewNote}</Text>}
                </View>
                <Badge label={d.status === 'Approved' ? 'Expired' : d.status} fg={TONE[d.status]} bg={colors.sunken} />
                {marketing && d.status !== 'Retired' && <Button small variant="ghost" title="Edit" onPress={() => setEditing(d)} />}
              </Row>
            ))}
          </Card>
        </>
      )}
      {data.settings.contentApproval && <Banner tone="info">Each change to approved material makes a new version that goes back to Medical.</Banner>}
    </Screen>
  );
}
