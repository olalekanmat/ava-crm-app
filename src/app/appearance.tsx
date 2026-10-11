import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useMe } from '@/data/store';
import { active, readPrefs, savePrefs, TEXT_SCALE, type TextChoice, type ThemeChoice } from '@/ui/appearance';
import { CalendarSyncCard } from '@/ui/CalendarSyncCard';
import { Banner, Button, Card, Label, SectionTitle, Segmented, ToggleRow, text } from '@/ui/components';
import { notify } from '@/ui/confirm';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/theme';
import { scheduleWeeklySummary, weeklyReminderSupported } from '@/ui/weeklyReminder';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WEEKLY_KEY = 'ava:weekly-reminder';

/** Display (dark mode, text size), the phone calendar and the Monday summary reminder. */
export default function DisplayScreen() {
  const me = useMe();
  const saved = readPrefs();
  const [theme, setTheme] = useState<ThemeChoice>(saved.theme);
  const [size, setSize] = useState<TextChoice>(saved.text);
  const [weekly, setWeekly] = useState(false);
  const changed = theme !== active.prefs.theme || size !== active.prefs.text;

  useEffect(() => {
    AsyncStorage.getItem(WEEKLY_KEY)
      .then((v) => setWeekly(v === '1'))
      .catch(() => {});
  }, []);

  const apply = () => {
    savePrefs({ theme, text: size });
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
    else notify('Saved', 'Close Ava fully and open it again to see the new look.');
  };

  const toggleWeekly = async (on: boolean) => {
    try {
      const ok = await scheduleWeeklySummary(on);
      setWeekly(ok);
      await AsyncStorage.setItem(WEEKLY_KEY, ok ? '1' : '0');
      if (on && !ok) notify('Reminder not set', 'Allow notifications for Ava CRM in your phone’s settings, then try again.');
    } catch (e) {
      notify('Reminder not set', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <SectionTitle>Display</SectionTitle>
      <Card>
        <Label>Theme</Label>
        <Segmented options={['light', 'dark', 'system'] as ThemeChoice[]} value={theme} onChange={setTheme} labels={{ light: 'Light', dark: 'Dark', system: 'Match phone' }} />
        <Label>Text size</Label>
        <Segmented options={['normal', 'large', 'larger'] as TextChoice[]} value={size} onChange={setSize} labels={{ normal: 'Normal', large: 'Large', larger: 'Larger' }} />
        <View style={{ marginVertical: space.md }}>
          <Text style={[text.body, { fontSize: Math.round(15 * TEXT_SCALE[size]) }]}>Dr. Adaeze Okafor · Cardiology</Text>
          <Text style={[text.muted, { fontSize: Math.round(13 * TEXT_SCALE[size]) }]}>Last call 3 Oct · next visit Tuesday</Text>
        </View>
        <Text style={[text.small, { marginBottom: space.md }]}>Your phone’s own text size setting still applies on top of this.</Text>
        {changed && <Banner icon="refresh-outline">{Platform.OS === 'web' ? 'The page reloads to apply this.' : 'Applies the next time Ava opens.'}</Banner>}
        <Button title={Platform.OS === 'web' ? 'Apply and reload' : 'Save'} icon="checkmark" onPress={apply} disabled={theme === saved.theme && size === saved.text} />
      </Card>

      <CalendarSyncCard />

      {weeklyReminderSupported && me.role !== 'Rep' && (
        <>
          <SectionTitle>Weekly summary</SectionTitle>
          <Card>
            <ToggleRow label="Remind me on Mondays" value={weekly} onChange={toggleWeekly} hint="A notification at 8:00 when your team’s weekly summary is ready." />
          </Card>
        </>
      )}
    </Screen>
  );
}
