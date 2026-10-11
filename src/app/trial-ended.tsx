import { router } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import { isAdmin } from '@/data/access';
import { useStore } from '@/data/store';
import { BrandTitle } from '@/ui/Brand';
import { Button, Card, CenteredIcon, text } from '@/ui/components';
import { Screen } from '@/ui/Screen';
import { colors, space } from '@/ui/theme';

/**
 * Shown instead of the app once a company's free trial has ended without a subscription.
 * Administrators can still open Company & approval to subscribe (in the web app); everyone else
 * waits for them. Nothing is deleted: the data stays in the company's drive.
 */
export default function TrialEndedScreen() {
  const { me, company, signOut, syncNow } = useStore();
  const admin = isAdmin(me);
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: space.xl, marginBottom: space.lg }}>
        <BrandTitle size={26} />
      </View>
      <Card>
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
          <CenteredIcon name="hourglass-outline" size={40} color={colors.warn} />
          <Text style={[text.h2, { textAlign: 'center' }]}>The free trial has ended</Text>
          <Text style={[text.muted, { textAlign: 'center' }]}>
            {company.name ? `${company.name}’s` : 'Your company’s'} free trial of Ava CRM is over, so the app is closed until the company subscribes. Everything your team recorded is kept in the company’s drive and carries on after subscribing.
          </Text>
          <Text style={[text.body, { textAlign: 'center', marginTop: space.sm }]}>
            {admin
              ? Platform.OS === 'web'
                ? 'Subscribe now to open Ava CRM again for your whole team.'
                : 'Contact Ava Healthcare to subscribe and open Ava CRM again for your whole team.'
              : 'Ask your administrator to subscribe to carry on.'}
          </Text>
        </View>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          {admin && Platform.OS === 'web' && <Button title="Subscribe" icon="card-outline" onPress={() => router.push('/admin/company')} />}
          <Button title="Check again" variant="secondary" icon="refresh-outline" onPress={() => syncNow(true)} />
          <Button title="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </Card>
    </Screen>
  );
}
