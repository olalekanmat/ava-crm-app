import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.text },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="accounts"
        options={{ title: 'Accounts', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="calls"
        options={{ title: 'Calls', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
