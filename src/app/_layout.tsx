import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { StoreProvider, useStore } from '@/data/store';
import '@/cloud/background';
import { HeaderTitle } from '@/ui/Brand';
import { colors } from '@/ui/theme';

/** On the web, every page below the tabs gets a visible Back button (phones use the system back). */
function WebBack({ canGoBack }: { canGoBack?: boolean }) {
  if (Platform.OS !== 'web') return null;
  return (
    <Pressable
      onPress={() => (canGoBack && router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 8, marginRight: 4, borderRadius: 8, backgroundColor: pressed || hovered ? colors.primarySoft : 'transparent' })}
    >
      <Ionicons name="arrow-back" size={20} color={colors.primary} />
      <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>Back</Text>
    </Pressable>
  );
}

function RootNav() {
  const { ready, session } = useStore();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerTitleAlign: 'left',
        headerTitle: ({ children }) => <HeaderTitle title={children} />,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        ...(Platform.OS === 'web' ? { headerLeft: ({ canGoBack }: { canGoBack?: boolean }) => <WebBack canGoBack={canGoBack} />, headerBackVisible: false } : {}),
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false, title: 'Sign in' }} />
        <Stack.Screen name="setup" options={{ headerShown: false, title: 'Set up your company' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="account/[id]" options={{ title: 'Account' }} />
        <Stack.Screen name="account/new" options={{ title: 'New account', presentation: 'modal' }} />
        <Stack.Screen name="call/[id]" options={{ title: 'Call' }} />
        <Stack.Screen name="call/edit" options={{ title: 'Log call', presentation: 'modal' }} />
        <Stack.Screen name="plan/[id]" options={{ title: 'Quarterly plan' }} />
        <Stack.Screen name="password" options={{ title: 'Change password' }} />
        <Stack.Screen name="profile" options={{ title: 'My profile' }} />
        <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
        <Stack.Screen name="overview" options={{ title: 'Organisation overview' }} />
        <Stack.Screen name="export" options={{ title: 'Export data' }} />
        <Stack.Screen name="admin/users" options={{ title: 'Users & roles' }} />
        <Stack.Screen name="admin/user" options={{ title: 'User', presentation: 'modal' }} />
        <Stack.Screen name="admin/import" options={{ title: 'Import CSV' }} />
        <Stack.Screen name="admin/settings" options={{ title: 'Products & rules' }} />
        <Stack.Screen name="admin/audit" options={{ title: 'Audit log' }} />
        <Stack.Screen name="admin/company" options={{ title: 'Company & approval' }} />
        <Stack.Screen name="admin/tiers" options={{ title: 'Tier names' }} />
        <Stack.Screen name="ai/ask" options={{ title: 'Ask Ava' }} />
        <Stack.Screen name="ai/schedule" options={{ title: 'Plan visits by voice' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <RootNav />
    </StoreProvider>
  );
}
