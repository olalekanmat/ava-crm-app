import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { api, APP_VERSION, loadToken, type ActAsRecord, type SignInPolicy } from '@/cloud/relay';
import { formatDateTime } from '@/data/dates';
import { useStore } from '@/data/store';
import { compareVersions, versionGroups } from '@/data/versions';
import { Badge, Banner, Card, Chip, Empty, Row, SectionTitle, ToggleRow, UserAvatar, text } from '@/ui/components';
import { confirm, notify } from '@/ui/confirm';
import { Grid } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

const PLATFORM: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Web' };

/** Administrators: two-step sign-in, everyone's app version and last sync, and the oldest version allowed (2.9). */
export default function SecurityScreen() {
  const { data, admin, session } = useStore();
  const [policy, setPolicy] = useState<SignInPolicy>();
  /** Times an administrator signed in as someone (2.10); undefined on servers before it. */
  const [actAs, setActAs] = useState<ActAsRecord[]>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!admin || session?.demo) return;
    let live = true;
    loadToken()
      .then((token) => {
        if (!token) throw new Error('Please sign in again.');
        return api.devices(token);
      })
      .then((p) => live && (setPolicy(p), setError(undefined)))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    loadToken()
      .then((token) => (token ? api.actAsLog(token) : undefined))
      .then((r) => live && setActAs(r?.entries))
      .catch(() => live && setActAs(undefined));
    return () => {
      live = false;
    };
  }, [admin, session?.demo, reload]);

  const people = useMemo(() => data.users.filter((u) => u.active && !u.deletedAt), [data.users]);
  const groups = useMemo(() => versionGroups(people, policy?.devices ?? []), [people, policy]);

  if (!admin) return <Screen><Empty icon="lock-closed-outline">Only administrators can see this.</Empty></Screen>;
  if (session?.demo) return <Screen><Empty icon="sparkles-outline">Sign-in settings and app versions come from the server, so the demo company has none.</Empty></Screen>;

  const save = async (change: { twoStep?: boolean; minVersion?: string | null }) => {
    setSaving(true);
    try {
      const token = await loadToken();
      if (!token) throw new Error('Please sign in again.');
      const r = await api.setPolicy(token, change);
      setPolicy((p) => (p ? { ...p, ...r } : p));
    } catch (e) {
      notify('Not saved', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const behind = (min: string) => people.filter((u) => {
    const d = policy?.devices.find((x) => x.userId === u.id);
    return !d || compareVersions(d.v, min) < 0;
  });
  const requireVersion = (min: string | null) => {
    if (!min) return save({ minVersion: null });
    const n = behind(min).length;
    confirm(
      `Require version ${min}?`,
      n ? `${n} ${n === 1 ? 'person has' : 'people have'} an older app or have not synced since 2.9. They can keep using what is on their phone but cannot sync until they update.` : 'Everyone is already on this version or newer.',
      () => save({ minVersion: min }),
      'Require it',
    );
  };

  return (
    <Screen wide onRefresh={() => setReload((n) => n + 1)}>
      {!!error && <Banner tone="danger">{error}</Banner>}
      {!policy && !error && <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />}
      {policy && (
        <>
          <SectionTitle>Sign-in</SectionTitle>
          <Card>
            <ToggleRow
              label="Two-step sign-in for administrators"
              value={policy.twoStep}
              onChange={(v) => save({ twoStep: v })}
              hint="Administrators enter a code sent to their sign-in email each time they sign in. They can trust a device for 30 days. Phones need Ava CRM 2.9 or newer (the web app always is)."
            />
            {!policy.mail && <Text style={[text.small, { color: colors.warn }]}>The server cannot send email yet, so two-step sign-in and “Forgot password” are not available. Ava Healthcare is setting this up.</Text>}
            {saving && <ActivityIndicator color={colors.primary} />}
          </Card>

          <SectionTitle>Signed in as someone</SectionTitle>
          <Card>
            <Text style={text.small}>
              Administrators can open the app as one of their people from Users & roles (Sign in as), for up to an hour at a time. Every time is listed here for all administrators to see.
            </Text>
            {actAs?.length ? (
              actAs.slice(0, 30).map((r) => (
                <View key={r.id} style={{ marginTop: space.sm }}>
                  <Text style={text.body}>
                    {r.admin.name} as {r.user.name}
                    <Text style={text.muted}> ({r.user.role === 'Admin' ? 'Administrator' : r.user.role})</Text>
                  </Text>
                  <Text style={text.small}>
                    {formatDateTime(r.at)} · {r.endedAt ? `ended ${formatDateTime(r.endedAt).split(' · ')[1]}` : 'still open'}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[text.muted, { marginTop: space.sm }]}>{actAs ? 'No one has signed in as anyone yet.' : 'Not available yet.'}</Text>
            )}
          </Card>

          <SectionTitle>App versions</SectionTitle>
          <Card>
            <Text style={text.body}>
              This device runs {APP_VERSION}. {policy.minVersion ? `Phones need ${policy.minVersion} or newer to sync.` : 'Any version can sync.'}
            </Text>
            <Text style={[text.small, { marginTop: 4 }]}>New features only reach people whose app knows them. Require the latest version once you start using a new feature, so no one works from an older picture of the data.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm }}>
              <Chip label="Any version" selected={!policy.minVersion} onPress={() => requireVersion(null)} />
              {['2.7.0', '2.8.0', APP_VERSION]
                .filter((v, i, all) => all.indexOf(v) === i && compareVersions(v, APP_VERSION) <= 0)
                .map((v) => (
                  <Chip key={v} label={`${v} or newer`} selected={policy.minVersion === v} onPress={() => requireVersion(v)} />
                ))}
            </View>
          </Card>

          {groups.map((g) => (
            <View key={g.label}>
              <SectionTitle>
                {g.label} ({g.people.length})
              </SectionTitle>
              <Grid>
                {g.people.map(({ user: u, device: d }) => {
                  const old = !!policy.minVersion && compareVersions(d?.v, policy.minVersion) < 0;
                  return (
                    <Card key={u.id}>
                      <Row gap={space.md}>
                        <UserAvatar user={u} />
                        <View style={{ flex: 1 }}>
                          <Text style={text.title} numberOfLines={1}>{u.name}</Text>
                          <Text style={text.muted} numberOfLines={1}>
                            {d ? `${d.v ?? 'Before 2.9'}${d.p ? ` · ${PLATFORM[d.p] ?? d.p}` : ''}` : 'Not synced since 2.9'}
                          </Text>
                          {d && <Text style={text.small}>Last sync {formatDateTime(d.at)}</Text>}
                        </View>
                        {old && <Badge label="Must update" fg={colors.danger} bg={colors.dangerSoft} />}
                      </Row>
                    </Card>
                  );
                })}
              </Grid>
            </View>
          ))}
          {Platform.OS !== 'web' && <Text style={[text.small, { marginTop: space.md }]}>Versions show once a person’s app syncs. Apps before 2.9 do not report their version.</Text>}
        </>
      )}
    </Screen>
  );
}
