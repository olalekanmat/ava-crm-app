import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider } from '@/data/store';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="account/[id]" options={{ title: 'Account' }} />
        <Stack.Screen name="account/new" options={{ title: 'New account', presentation: 'modal' }} />
        <Stack.Screen name="call/[id]" options={{ title: 'Call' }} />
        <Stack.Screen name="call/edit" options={{ title: 'Log call', presentation: 'modal' }} />
      </Stack>
    </StoreProvider>
  );
}
