import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '@/data/store';
import { AlertsSheet } from '@/ui/AlertsSheet';
import { HeaderTitle } from '@/ui/Brand';
import { UserAvatar } from '@/ui/components';
import { useLayout } from '@/ui/layout';
import { colors, tone } from '@/ui/theme';
import { useAlerts } from '@/ui/useAlerts';

type IconName = keyof typeof Ionicons.glyphMap;

/** Header actions on every tab: Sync (with its state), the alerts bell (count badge) and the profile. */
function HeaderActions() {
  const { me, sync, syncNow, session } = useStore();
  const { alerts } = useAlerts();
  const { width } = useLayout();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const count = alerts.urgent + alerts.important;
  const problem = session?.mode === 'cloud' && !!sync.error;
  const waiting = sync.pending > 0;
  const syncTone = problem ? colors.warn : waiting ? colors.orange : colors.primary;
  const syncIcon: IconName = problem ? 'cloud-offline-outline' : waiting ? 'cloud-upload-outline' : 'sync-outline';
  return (
    <View style={styles.actions}>
      <Pressable
        onPress={() => syncNow(true)}
        disabled={sync.syncing}
        accessibilityRole="button"
        accessibilityLabel={problem ? 'Offline. Sync now' : waiting ? `${sync.pending} changes waiting. Sync now` : 'Sync now'}
        style={({ pressed }) => [styles.syncBtn, pressed && { opacity: 0.6 }]}
      >
        {sync.syncing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={syncIcon} size={20} color={syncTone} />}
        {width >= 600 && <Text style={[styles.syncText, { color: syncTone }]}>{sync.syncing ? 'Syncing' : waiting ? `Sync (${sync.pending})` : 'Sync'}</Text>}
      </Pressable>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={count ? `${count} alerts` : 'Alerts'} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
        <Ionicons name={count ? 'notifications' : 'notifications-outline'} size={22} color={colors.text} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}
      </Pressable>
      <Pressable onPress={() => router.navigate('/more')} accessibilityLabel="Profile and settings" style={{ marginLeft: 4 }}>
        <UserAvatar user={me} size={32} />
      </Pressable>
      <AlertsSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

export default function TabsLayout() {
  const { me, company } = useStore();
  const { compact } = useLayout();
  if (!me) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const isRep = me.role === 'Rep';
  const icon = (name: IconName, active: IconName) => {
    const TabIcon = ({ color, size, focused }: { color: unknown; size: number; focused: boolean }) => <Ionicons name={focused ? active : name} color={color as string} size={size} />;
    return TabIcon;
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, ...(Platform.OS === 'web' && !compact ? { height: 62, paddingTop: 6 } : {}) },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
        headerStyle: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.hairline },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerTitleAlign: 'left',
        headerTitle: ({ children }) => <HeaderTitle title={children} />,
        headerRight: () => <HeaderActions />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: () => <HeaderTitle title={company.name} />,
          tabBarIcon: icon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen name="accounts" options={{ title: 'Accounts', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="calls" options={{ title: isRep ? 'Schedule' : 'Team calls', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="plan" options={{ title: isRep ? 'Plan' : 'Plans', tabBarIcon: icon('flag-outline', 'flag') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal-circle-outline', 'ellipsis-horizontal-circle') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 14 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 40, borderRadius: 20, minWidth: 40, justifyContent: 'center' },
  syncText: { fontWeight: '700', fontSize: 14 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 3, right: 1, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: tone.urgent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
