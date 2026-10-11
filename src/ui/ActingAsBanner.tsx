import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { timeKey } from '@/data/dates';
import { useStore } from '@/data/store';
import { confirm, notify } from './confirm';
import { colors, radius, space } from './theme';

/**
 * While an administrator is signed in as someone (2.10): a band across the top of every screen
 * saying whose account this is, with one tap back to their own. The screens below it no longer
 * need to leave room for the status bar.
 */
export function ActingAsFrame({ children }: { children: ReactNode }) {
  const { session, me, sync, backToOwnAccount } = useStore();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const acting = session?.actingAs;
  useEffect(() => {
    if (!acting) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [acting]);
  if (!acting) return <>{children}</>;

  const ended = Date.parse(acting.expiresAt) <= now || (sync.needsSignIn ?? false);
  const goBack = async (force = false) => {
    setBusy(true);
    try {
      await backToOwnAccount(force);
      router.replace('/');
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      confirm('Go back anyway?', `${why} Going back now leaves them on this device only, under this person’s name, until you sign in as them again.`, () => goBack(true), 'Go back');
    } finally {
      setBusy(false);
    }
  };
  const who = me?.name ?? session.email;

  return (
    <View style={{ flex: 1 }}>
      <View
        accessibilityRole="alert"
        style={{ backgroundColor: colors.warnSoft, paddingTop: insets.top + 6, paddingBottom: 8, paddingLeft: insets.left + space.md, paddingRight: insets.right + space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.warn }}
      >
        <Ionicons name="eye-outline" size={20} color={colors.warn} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.warn, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
            Signed in as {who}
          </Text>
          <Text style={{ color: colors.warn, fontSize: 12 }} numberOfLines={2}>
            {ended ? 'This session has ended. Go back to your own account.' : `You see what they see; changes are saved as theirs. Ends at ${timeKey(new Date(acting.expiresAt))}.`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to my account"
          disabled={busy}
          onPress={() => goBack()}
          onLongPress={() => notify('Signed in as someone', `${acting.adminName} signed in as ${who}. Every administrator can see this in More › Sign-in & app versions.`)}
          style={({ pressed }) => ({ backgroundColor: colors.warn, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, opacity: pressed || busy ? 0.8 : 1, flexDirection: 'row', alignItems: 'center', gap: 6 })}
        >
          {busy ? <ActivityIndicator size="small" color={colors.warnSoft} /> : <Ionicons name="arrow-undo" size={16} color={colors.warnSoft} />}
          <Text style={{ color: colors.warnSoft, fontWeight: '700', fontSize: 14 }}>My account</Text>
        </Pressable>
      </View>
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  );
}
