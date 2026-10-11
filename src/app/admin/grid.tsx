import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ACCOUNT_GRID, applyEdits, cellValue, USER_GRID, type CellEdit, type GridColumn } from '@/data/grid';
import type { Mutation } from '@/data/mutations';
import { useStore } from '@/data/store';
import type { Snapshot } from '@/data/types';
import { Banner, Button, Empty, Row, SearchBox, Segmented, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

type Sheet = 'Accounts' | 'Users';
const PAGE = 50;

/** Administrators edit many accounts or users at once, like a spreadsheet, with undo (2.9). Best on the web. */
export default function GridScreen() {
  const { admin, withDeleted } = useStore();
  const [sheet, setSheet] = useState<Sheet>('Accounts');
  if (!admin) return <Screen><Empty icon="lock-closed-outline">Only administrators can edit in a grid.</Empty></Screen>;
  return (
    <Screen wide>
      <Segmented options={['Accounts', 'Users'] as Sheet[]} value={sheet} onChange={setSheet} />
      {Platform.OS !== 'web' && <Banner icon="desktop-outline">This works best on a computer: open Ava CRM in a browser.</Banner>}
      {sheet === 'Accounts' ? (
        <SheetEditor key="a" rows={withDeleted.accounts.filter((a) => !a.deletedAt)} columns={ACCOUNT_GRID} search={(a) => `${a.name} ${a.specialty} ${a.city}`} toMutation={(accounts) => ({ type: 'import.accounts', accounts })} />
      ) : (
        <SheetEditor key="u" rows={withDeleted.users.filter((u) => !u.deletedAt)} columns={USER_GRID} search={(u) => `${u.name} ${u.email} ${u.territory ?? ''}`} toMutation={(users) => ({ type: 'import.users', users })} />
      )}
    </Screen>
  );
}

function SheetEditor<T extends { id: string; name: string }>({ rows, columns, search, toMutation }: { rows: T[]; columns: GridColumn<T>[]; search: (r: T) => string; toMutation: (rows: T[]) => Mutation }) {
  const { withDeleted, run } = useStore();
  const s: Snapshot = withDeleted;
  const [edits, setEdits] = useState<CellEdit[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  /** Rows as they were before each save, newest last: "Undo last save" puts them back. */
  const [saved, setSaved] = useState<T[][]>([]);

  const sorted = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name)), [rows]);
  const query = q.trim().toLowerCase();
  const shown = query ? sorted.filter((r) => search(r).toLowerCase().includes(query)) : sorted;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);
  const { changed, problems } = useMemo(() => applyEdits(rows, edits, columns, s), [rows, edits, columns, s]);

  const edit = (row: T, col: GridColumn<T>, value: string) => {
    const before = cellValue(row, col, edits, s);
    if (before === value) return;
    // Typing in the same cell again updates that edit, so one undo takes back the whole change.
    const last = edits.at(-1);
    if (last && last.rowId === row.id && last.key === col.key) setEdits([...edits.slice(0, -1), { ...last, after: value }]);
    else setEdits([...edits, { rowId: row.id, key: col.key, before, after: value }]);
  };

  const save = () => {
    if (problems.size) return notify('Fix the cells in red first', [...problems.values()][0]);
    if (!changed.length) return;
    const before = rows.filter((r) => changed.some((c) => c.id === r.id));
    try {
      run(toMutation(changed));
      setSaved([...saved, before].slice(-10));
      setEdits([]);
      notify('Saved', `${changed.length} row${changed.length === 1 ? '' : 's'} changed.`);
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };

  const undoSave = () => {
    const last = saved.at(-1);
    if (!last) return;
    confirm('Undo the last save?', `${last.length} row${last.length === 1 ? '' : 's'} go back to how they were.`, () => {
      try {
        run(toMutation(last));
        setSaved(saved.slice(0, -1));
      } catch (e) {
        notify('Not undone', e instanceof Error ? e.message : String(e));
      }
    }, 'Undo');
  };

  return (
    <View>
      <SearchBox value={q} onChangeText={(v) => { setQ(v); setPage(0); }} placeholder="Filter rows" />
      <Row style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
        <Button small title={changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Save'} icon="save-outline" onPress={save} disabled={!edits.length} />
        <Button small variant="secondary" title="Undo" icon="arrow-undo-outline" onPress={() => setEdits(edits.slice(0, -1))} disabled={!edits.length} />
        {edits.length > 0 && <Button small variant="ghost" title="Discard all" onPress={() => setEdits([])} />}
        {saved.length > 0 && !edits.length && <Button small variant="ghost" title="Undo last save" icon="time-outline" onPress={undoSave} />}
      </Row>
      {problems.size > 0 && <Banner tone="danger">{problems.size} cell{problems.size === 1 ? '' : 's'} need fixing: {[...problems.values()][0]}</Banner>}
      <ScrollView horizontal>
        <View>
          <View style={[styles.row, styles.head]}>
            {columns.map((c) => (
              <Text key={c.key} style={[styles.headCell, { width: c.width }]}>
                {c.label}
              </Text>
            ))}
          </View>
          {slice.map((r) => (
            <View key={r.id} style={styles.row}>
              {columns.map((c) => {
                const v = cellValue(r, c, edits, s);
                const bad = problems.get(`${r.id}|${c.key}`);
                const dirty = v !== c.get(r, s);
                return (
                  <TextInput
                    key={c.key}
                    value={v}
                    onChangeText={(x) => edit(r, c, x)}
                    accessibilityLabel={`${c.label} for ${r.name}`}
                    placeholder={c.choices ? c.choices(r, s).filter(Boolean).join(' / ') : undefined}
                    placeholderTextColor={colors.faint}
                    style={[styles.cell, { width: c.width }, dirty && { backgroundColor: colors.primarySoft }, !!bad && { borderColor: colors.danger, borderWidth: 2 }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      {!slice.length && <Empty>No rows match.</Empty>}
      {pages > 1 && (
        <Row style={{ marginTop: space.sm, justifyContent: 'center' }}>
          <Button small variant="ghost" title="Previous" onPress={() => setPage(Math.max(0, page - 1))} disabled={page === 0} />
          <Text style={text.muted}>
            Page {page + 1} of {pages} · {shown.length} rows
          </Text>
          <Button small variant="ghost" title="Next" onPress={() => setPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1} />
        </Row>
      )}
      <Text style={[text.small, { marginTop: space.sm }]}>Changes stay on this screen until you save. Saving updates everyone, like a CSV import. Undo takes back one cell at a time; after saving, Undo last save puts the rows back.</Text>
    </View>
  );
}


const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  head: { backgroundColor: colors.bg },
  headCell: { padding: 6, fontWeight: '700', fontSize: 12, color: colors.muted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cell: { padding: 6, fontSize: 13, color: colors.text, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 34 },
});
