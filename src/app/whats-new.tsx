import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isAdmin } from '@/data/access';
import { useMe } from '@/data/store';
import { RELEASE_NOTES } from '@/data/versions';
import { APP_VERSION } from '@/cloud/relay';
import { Button, text } from '@/ui/components';
import { colors, radius, space } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** What's new in this version, shown once after an update (and from More). */
export default function WhatsNewScreen() {
  const me = useMe();
  const note = RELEASE_NOTES.find((n) => n.version === APP_VERSION) ?? RELEASE_NOTES[0];
  const role = isAdmin(me) ? 'admin' : me.role === 'Rep' ? 'rep' : 'manager';
  // Administrators see everything; managers see manager and rep items; reps their own.
  const items = note.items.filter((i) => !i.who || role === 'admin' || i.who === role || (role === 'manager' && i.who === 'rep'));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={text.h1}>What’s new in {note.version}</Text>
        <Text style={[text.muted, { marginBottom: space.lg }]}>Ava CRM has updated. Here is what changed for you.</Text>
        {items.map((i) => (
          <View key={i.title} style={styles.item}>
            <View style={styles.icon}>
              <Ionicons name={i.icon as IconName} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.title}>{i.title}</Text>
              <Text style={text.muted}>{i.body}</Text>
            </View>
          </View>
        ))}
        <View style={{ marginTop: space.lg }}>
          <Button title="Got it" icon="checkmark" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingTop: space.xl, width: '100%', maxWidth: 620, alignSelf: 'center' },
  item: { flexDirection: 'row', gap: space.md, marginBottom: space.md, backgroundColor: colors.card, borderRadius: radius.md, padding: space.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
