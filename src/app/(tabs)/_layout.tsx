import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useStore } from '@/data/store';
import { HeaderTitle } from '@/ui/Brand';
import { Avatar } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  const { me, sync, session, company } = useStore();
  if (!me) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const isRep = me.role === 'Rep';
  const offline = session?.mode === 'cloud' && (!!sync.error || sync.pending > 0);
  const headerRight = () => (
    <Pressable onPress={() => router.navigate('/more')} style={{ marginRight: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel="Profile and settings">
      {offline && <Ionicons name={sync.error ? 'cloud-offline-outline' : 'cloud-upload-outline'} size={20} color={colors.warn} />}
      <Avatar name={me.name} size={32} />
    </Pressable>
  );
  const icon =
    (name: keyof typeof Ionicons.glyphMap) =>
    ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '600' },
        headerStyle: { backgroundColor: colors.card },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerTitleAlign: 'left',
        headerTitle: ({ children }) => <HeaderTitle title={children} />,
        headerRight,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isRep ? 'Today' : me.role === 'Admin' ? 'Admin' : me.role === 'SLM' ? 'Overview' : 'Team',
          headerTitle: () => <HeaderTitle title={company.name} />,
          tabBarIcon: icon(isRep ? 'today-outline' : me.role === 'Admin' ? 'shield-checkmark-outline' : me.role === 'SLM' ? 'globe-outline' : 'people-circle-outline'),
        }}
      />
      <Tabs.Screen name="accounts" options={{ title: 'Accounts', tabBarIcon: icon('business-outline') }} />
      <Tabs.Screen name="calls" options={{ title: isRep ? 'Calls' : 'Team calls', tabBarIcon: icon('chatbubbles-outline') }} />
      <Tabs.Screen name="plan" options={{ title: isRep ? 'Plan' : 'Plans', tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu-outline') }} />
    </Tabs>
  );
}
