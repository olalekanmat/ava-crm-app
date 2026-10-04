import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useMe, useStore } from '@/data/store';
import { teamOf, tierSchemeProblem } from '@/data/tiers';
import type { TierDef } from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Row, SectionTitle, Stepper, TierBadge, ToggleRow, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, radius, space } from '@/ui/theme';

interface Draft extends TierDef {
  /** The name this row had when the editor opened, so renames carry over to accounts. */
  was?: string;
}

/** Admin: tier names and call frequencies, company-wide and per team. */
export default function TiersScreen() {
  const me = useMe();
  const { data, run } = useStore();
  const teams = data.users.filter((u) => u.role === 'FLM');
  const [scope, setScope] = useState<string>(''); // '' = company default, else FLM id
  const custom = !!scope && !!data.settings.teamTiers[scope];
  const scheme = (scope && data.settings.teamTiers[scope]) || data.settings.tiers;
  const [useCustom, setUseCustom] = useState(custom);
  const [rows, setRows] = useState<Draft[]>([]);

  useEffect(() => {
    setUseCustom(custom);
    setRows(scheme.map((t) => ({ ...t, was: t.name })));
  }, [scope, custom, scheme]);

  const affected = useMemo(
    () =>
      data.accounts.filter((a) => {
        const t = teamOf(data.users, a.ownerId);
        return scope ? t === scope : !t || !data.settings.teamTiers[t];
      }),
    [data, scope],
  );

  if (me.role !== 'Admin') return <Screen><Empty>Only administrators can change tiers.</Empty></Screen>;

  const editing = !scope || useCustom;
  const set = (i: number, patch: Partial<Draft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };

  const save = () => {
    const tiers = rows.map((r) => ({ name: r.name.trim(), frequency: r.frequency }));
    const problem = tierSchemeProblem(tiers);
    if (problem) return notify('Check the tiers', problem);
    const renames: Record<string, string> = {};
    for (const r of rows) if (r.was && r.was !== r.name.trim()) renames[r.was] = r.name.trim();
    const names = new Set(tiers.map((t) => t.name));
    const orphaned = affected.filter((a) => !names.has(renames[a.tier] ?? a.tier));
    const apply = () => {
      try {
        run({ type: 'tiers.update', teamId: scope || undefined, tiers, renames });
        notify('Saved', `Tiers updated${Object.keys(renames).length ? ` and ${affected.filter((a) => renames[a.tier]).length} accounts renamed` : ''}.`);
      } catch (e) {
        notify('Not saved', e instanceof Error ? e.message : String(e));
      }
    };
    if (orphaned.length) {
      confirm('Some accounts keep an old tier', `${orphaned.length} account(s) use a tier that is no longer in the list (${[...new Set(orphaned.map((a) => a.tier))].join(', ')}). They keep that label until you re-tier them, for example by CSV import.`, apply, 'Save anyway');
    } else apply();
  };

  const useDefault = () => {
    try {
      run({ type: 'tiers.update', teamId: scope, tiers: null });
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Banner>Tier names label accounts and suggest how often to call them each cycle. Each team can use its own names; teams without their own use the company default.</Banner>
      <SectionTitle>Which tiers</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label="Company default" selected={!scope} onPress={() => setScope('')} />
        {teams.map((t) => (
          <Chip key={t.id} label={`${t.territory ?? t.name}${data.settings.teamTiers[t.id] ? ' ·  custom' : ''}`} selected={scope === t.id} onPress={() => setScope(t.id)} />
        ))}
      </View>
      {!teams.length && <Text style={text.small}>Add FLMs under Users & roles to give teams their own tier names.</Text>}

      {!!scope && (
        <Card>
          <ToggleRow
            label="This team uses its own tier names"
            value={useCustom}
            onChange={(v) => (v ? setUseCustom(true) : custom ? confirm('Use the company default?', 'This team’s accounts keep their current tier labels; re-tier them by CSV import if the names differ.', useDefault, 'Use default') : setUseCustom(false))}
            hint={`Team of ${data.users.find((u) => u.id === scope)?.name}. ${affected.length} accounts.`}
          />
        </Card>
      )}

      <SectionTitle>{editing ? 'Tiers, highest priority first' : 'Using the company default'}</SectionTitle>
      {rows.map((r, i) => (
        <Card key={i}>
          <Row gap={space.sm}>
            <TierBadge tier={r.name || '?'} rank={i} />
            {editing ? (
              <TextInput
                value={r.name}
                onChangeText={(name) => set(i, { name })}
                maxLength={12}
                autoCapitalize="characters"
                style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: 6, color: colors.text, fontSize: 16, minWidth: 60 }}
                accessibilityLabel={`Tier ${i + 1} name`}
              />
            ) : (
              <Text style={[text.title, { flex: 1 }]}>{r.name}</Text>
            )}
            {editing ? <Stepper value={r.frequency} onChange={(frequency) => set(i, { frequency })} min={0} max={30} /> : <Text style={text.muted}>{r.frequency}</Text>}
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
            <Text style={text.small}>
              {r.frequency} call{r.frequency === 1 ? '' : 's'} per cycle · {affected.filter((a) => a.tier === r.was).length} accounts
              {r.was && r.was !== r.name.trim() && r.name.trim() ? ` · renaming from ${r.was}` : ''}
            </Text>
            {editing && (
              <Row gap={space.md}>
                <Pressable onPress={() => move(i, -1)} accessibilityLabel="Move up" disabled={i === 0}>
                  <Ionicons name="arrow-up" size={18} color={i === 0 ? colors.faint : colors.primary} />
                </Pressable>
                <Pressable onPress={() => move(i, 1)} accessibilityLabel="Move down" disabled={i === rows.length - 1}>
                  <Ionicons name="arrow-down" size={18} color={i === rows.length - 1 ? colors.faint : colors.primary} />
                </Pressable>
                <Pressable onPress={() => setRows(rows.filter((_, j) => j !== i))} accessibilityLabel="Remove tier" disabled={rows.length <= 1}>
                  <Ionicons name="trash-outline" size={18} color={rows.length <= 1 ? colors.faint : colors.danger} />
                </Pressable>
              </Row>
            )}
          </Row>
        </Card>
      ))}
      {editing && (
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {rows.length < 8 && <Button variant="secondary" icon="add" title="Add a tier" onPress={() => setRows([...rows, { name: `T${rows.length}`, frequency: 1 }])} />}
          <Button title="Save tiers" icon="checkmark" onPress={save} />
          <Button
            variant="ghost"
            title="Reset to ST, T1, T2, T3"
            onPress={() => setRows([{ name: 'ST', frequency: 8 }, { name: 'T1', frequency: 6 }, { name: 'T2', frequency: 4 }, { name: 'T3', frequency: 2 }].map((t, i) => ({ ...t, was: rows[i]?.was })))}
          />
        </View>
      )}
    </Screen>
  );
}
