import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { StoreProvider, useStore } from '@/data/store';
import '@/cloud/background';
import { HeaderTitle } from '@/ui/Brand';
import { colors } from '@/ui/theme';

// Closes the Google/Microsoft sign-in popup on the web and hands the result to the app.
WebBrowser.maybeCompleteAuthSession();

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
        <Stack.Screen name="plan/[id]" options={{ title: 'Cycle plan' }} />
        <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
        <Stack.Screen name="overview" options={{ title: 'Organisation overview' }} />
        <Stack.Screen name="export" options={{ title: 'Export data' }} />
        <Stack.Screen name="admin/users" options={{ title: 'Users & roles' }} />
        <Stack.Screen name="admin/user" options={{ title: 'User', presentation: 'modal' }} />
        <Stack.Screen name="admin/import" options={{ title: 'Import CSV' }} />
        <Stack.Screen name="admin/settings" options={{ title: 'Cycles, products & rules' }} />
        <Stack.Screen name="admin/audit" options={{ title: 'Audit log' }} />
        <Stack.Screen name="admin/company" options={{ title: 'Company & approval' }} />
        <Stack.Screen name="admin/tiers" options={{ title: 'Tier names' }} />
      </Stack.Protected>
      <Stack.Screen name="oauthredirect" options={{ headerShown: false, title: 'Signing in' }} />
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
