import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { repsUnder } from '@/data/access';
import { newId } from '@/data/ids';
import {
  allReports, canBuildReports, DATASET_FILTERS, DATASET_HINT, DATASET_LABEL, DATE_LABEL, DEFAULT_COLUMNS, GROUP_LABEL, isTemplateId, METRIC_LABEL, REPORT_COLUMNS, reportProblem,
  reportProducts, runReport, STATUS_OPTIONS,
} from '@/data/reports';
import { useMe, useStore } from '@/data/store';
import { allTierNames } from '@/data/tiers';
import {
  CHANNELS, REPORT_DATASETS, REPORT_DATE_PRESETS, REPORT_GROUPS, REPORT_METRICS, type ReportDataset, type ReportDef, type ReportFilters, type ReportGeo,
} from '@/data/types';
import { Banner, Button, Card, Chip, Empty, Field, Label, Row, SectionTitle, Segmented, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { ReportBars, ReportTable } from '@/ui/ReportTable';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const GEO: ReportGeo[] = ['Verified', 'Off-site', 'Unverified', 'Missing', 'Remote'];
const blank = (): ReportDef => ({ id: newId('rpt'), name: '', dataset: 'calls', columns: [...DEFAULT_COLUMNS.calls], filters: { date: 'thisCycle' }, groupBy: 'none', metrics: ['count'] });

/** A row of chips that scrolls sideways when it does not fit. */
function Chips({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.sm }}>
      {children}
    </ScrollView>
  );
}

/** A single choice with an "Any" chip, for filters. */
function Pick<T extends string>({ label, value, options, onChange, names }: { label: string; value?: T; options: T[]; onChange: (v?: T) => void; names?: (v: T) => string }) {
  if (!options.length) return null;
  return (
    <View>
      <Label>{label}</Label>
      <Chips>
        <Chip label="Any" selected={!value} onPress={() => onChange(undefined)} />
        {options.map((o) => (
          <Chip key={o} label={names ? names(o) : o} selected={value === o} onPress={() => onChange(o)} />
        ))}
      </Chips>
    </View>
  );
}

/** Admin: build or edit a report, with a live preview. Managers cannot open it. */
export default function ReportBuilder() {
  const params = useLocalSearchParams<{ id?: string; from?: string }>();
  const me = useMe();
  const { data, withDeleted, run } = useStore();
  const existing = params.id ? data.settings.reports?.find((r) => r.id === params.id) : undefined;
  const [draft, setDraft] = useState<ReportDef>(() => {
    if (existing) return { ...existing, filters: { ...existing.filters } };
    const t = params.from ? allReports(data.settings.reports).find((r) => r.id === params.from) : undefined;
    return t ? { ...t, id: newId('rpt'), name: isTemplateId(t.id) ? t.name : `${t.name} (copy)`, filters: { ...t.filters }, createdBy: undefined, updatedAt: undefined } : blank();
  });
  const preview = useMemo(() => (canBuildReports(me) ? runReport(withDeleted, draft, me, new Date(), 50) : undefined), [draft, withDeleted, me]);

  if (!canBuildReports(me)) return <Screen><Empty icon="bar-chart-outline">Only administrators can build reports.</Empty></Screen>;

  const set = (patch: Partial<ReportDef>) => setDraft((d) => ({ ...d, ...patch }));
  const setFilter = (patch: Partial<ReportFilters>) =>
    setDraft((d) => {
      const filters = { ...d.filters, ...patch };
      for (const k of Object.keys(filters) as (keyof ReportFilters)[]) if (filters[k] === undefined || filters[k] === '') delete filters[k];
      return { ...d, filters };
    });
  const setDataset = (dataset: ReportDataset) =>
    setDraft((d) => {
      // Keep only the filters that apply to the new dataset, and start from its usual columns.
      const keep = DATASET_FILTERS[dataset];
      const filters = Object.fromEntries(Object.entries(d.filters).filter(([k]) => keep.includes(k as keyof ReportFilters) || k === 'from' || k === 'to')) as ReportFilters;
      if (filters.status && !STATUS_OPTIONS[dataset]?.includes(filters.status)) delete filters.status;
      return { ...d, dataset, filters, columns: [...DEFAULT_COLUMNS[dataset]], sort: undefined };
    });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const f = draft.filters;
  const applies = (k: keyof ReportFilters) => DATASET_FILTERS[draft.dataset].includes(k);
  const teams = data.users.filter((u) => u.role === 'FLM' && !u.deletedAt);
  const reps = (f.teamId ? data.users.filter((u) => u.role === 'Rep' && u.managerId === f.teamId) : repsUnder(data.users, me)).filter((u) => !u.deletedAt);
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? id;
  const sortable = preview?.columns ?? [];

  const save = () => {
    // Custom dates only count with the custom preset; filters that do not apply to the data are left out.
    const filters = Object.fromEntries(Object.entries(draft.filters).filter(([k]) => (k === 'from' || k === 'to' ? f.date === 'custom' : applies(k as keyof ReportFilters)))) as ReportFilters;
    const report: ReportDef = { ...draft, name: draft.name.trim(), filters, createdBy: undefined, updatedAt: undefined };
    const problem = reportProblem(report);
    if (problem) return notify('Not saved', problem);
    try {
      run({ type: 'report.save', report });
      router.replace({ pathname: '/reports/[id]', params: { id: draft.id } });
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    }
  };
  const remove = () =>
    confirm(`Delete “${draft.name}”?`, 'The report disappears for everyone in the company. The data it shows is not affected.', () => {
      try {
        run({ type: 'report.delete', id: draft.id });
        router.replace('/reports');
      } catch (e) {
        notify('Not deleted', e instanceof Error ? e.message : String(e));
      }
    }, 'Delete');

  return (
    <Screen wide>
      <Stack.Screen options={{ title: existing ? 'Edit report' : 'New report' }} />
      <Card>
        <Field label="Report name *" value={draft.name} onChangeText={(name) => set({ name })} placeholder="e.g. Calls by rep this cycle" maxLength={80} />
        <Label>Data</Label>
        <Chips>
          {REPORT_DATASETS.map((d) => (
            <Chip key={d} label={DATASET_LABEL[d]} selected={draft.dataset === d} onPress={() => setDataset(d)} />
          ))}
        </Chips>
        <Text style={text.small}>{DATASET_HINT[draft.dataset]}</Text>
      </Card>

      <SectionTitle>Filters</SectionTitle>
      <Card>
        <Label>Dates</Label>
        <Chips>
          {REPORT_DATE_PRESETS.map((d) => (
            <Chip key={d} label={DATE_LABEL[d]} selected={(f.date ?? 'thisCycle') === d} onPress={() => setFilter({ date: d })} />
          ))}
        </Chips>
        {f.date === 'custom' && (
          <Row>
            <View style={{ flex: 1 }}>
              <Field label="From" value={f.from ?? ''} onChangeText={(from) => setFilter({ from })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="To" value={f.to ?? ''} onChangeText={(to) => setFilter({ to })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            </View>
          </Row>
        )}
        {applies('teamId') && <Pick label="Team" value={f.teamId} options={teams.map((t) => t.id)} names={(id) => { const t = data.users.find((u) => u.id === id); return t?.territory || t?.name || id; }} onChange={(teamId) => setFilter({ teamId, repId: undefined })} />}
        {applies('repId') && <Pick label="Rep" value={f.repId} options={reps.map((r) => r.id)} names={userName} onChange={(repId) => setFilter({ repId })} />}
        {applies('product') && <Pick label="Product" value={f.product} options={reportProducts(data)} onChange={(product) => setFilter({ product })} />}
        {applies('status') && <Pick label="Status" value={f.status} options={STATUS_OPTIONS[draft.dataset] ?? []} onChange={(status) => setFilter({ status })} />}
        {applies('tier') && <Pick label="Tier" value={f.tier} options={allTierNames(data.settings)} onChange={(tier) => setFilter({ tier })} />}
        {applies('channel') && <Pick label="Channel" value={f.channel} options={CHANNELS} onChange={(channel) => setFilter({ channel })} />}
        {applies('geo') && <Pick label="Check-in" value={f.geo} options={GEO} names={(g) => (g === 'Remote' ? 'Not needed (remote)' : g)} onChange={(geo) => setFilter({ geo })} />}
        {applies('notVisitedDays') && (
          <Field
            label="Not visited in (days)"
            value={f.notVisitedDays ? String(f.notVisitedDays) : ''}
            onChangeText={(v) => {
              const n = parseInt(v.replace(/\D/g, ''), 10);
              setFilter({ notVisitedDays: Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : undefined });
            }}
            keyboardType="number-pad"
            placeholder="e.g. 60"
            hint="Leave empty to list every account."
          />
        )}
      </Card>

      <SectionTitle>Layout</SectionTitle>
      <Card>
        <Label>Group by</Label>
        <Chips>
          {REPORT_GROUPS.map((g) => (
            <Chip key={g} label={GROUP_LABEL[g]} selected={draft.groupBy === g} onPress={() => set({ groupBy: g, sort: undefined, metrics: draft.metrics.length ? draft.metrics : ['count'] })} />
          ))}
        </Chips>
        {draft.groupBy === 'none' ? (
          <>
            <Label>Columns (in the order you tap them)</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
              {REPORT_COLUMNS[draft.dataset].map((c) => {
                const i = draft.columns.indexOf(c.key);
                return <Chip key={c.key} label={i >= 0 ? `${i + 1}. ${c.label}` : c.label} selected={i >= 0} onPress={() => set({ columns: toggle(draft.columns, c.key), sort: undefined })} />;
              })}
            </View>
          </>
        ) : (
          <>
            <Label>Measures</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
              {REPORT_METRICS.map((m) => (
                <Chip key={m} label={METRIC_LABEL[m]} selected={draft.metrics.includes(m)} onPress={() => set({ metrics: toggle(draft.metrics, m), sort: undefined })} />
              ))}
            </View>
          </>
        )}
        <Label>Sort by</Label>
        <Chips>
          <Chip label="Automatic" selected={!draft.sort} onPress={() => set({ sort: undefined })} />
          {sortable.map((c) => (
            <Chip key={c.key} label={c.label} selected={draft.sort?.key === c.key} onPress={() => set({ sort: { key: c.key, dir: draft.sort?.dir ?? (c.kind === 'text' ? 'asc' : 'desc') } })} />
          ))}
        </Chips>
        {draft.sort && <Segmented options={['asc', 'desc'] as const as ('asc' | 'desc')[]} value={draft.sort.dir} onChange={(dir) => set({ sort: { ...draft.sort!, dir } })} labels={{ asc: 'Smallest / A first', desc: 'Largest / Z first' }} />}
      </Card>

      <SectionTitle>Preview</SectionTitle>
      {preview && (
        <Card>
          <Text style={[text.muted, { marginBottom: space.sm }]}>
            {preview.range.label} · {preview.total} {preview.grouped ? 'groups' : 'rows'}
            {preview.total > preview.rows.length ? ` (first ${preview.rows.length} shown)` : ''}
          </Text>
          {preview.grouped && <View style={{ marginBottom: space.md }}><ReportBars result={preview} /></View>}
          <ReportTable result={preview} />
        </Card>
      )}

      <Banner icon="people-outline">Saved reports are shared with the company. Managers can open them and see their own teams’ data only.</Banner>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        <Button title={existing ? 'Save changes' : 'Save report'} icon="checkmark" onPress={save} />
        {existing && <Button title="Delete report" variant="danger" icon="trash-outline" onPress={remove} />}
        <Button title="Cancel" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/reports'))} />
      </View>
      <Text style={[text.small, { marginTop: space.md, color: colors.faint }]}>Up to 50 saved reports per company.</Text>
    </Screen>
  );
}
