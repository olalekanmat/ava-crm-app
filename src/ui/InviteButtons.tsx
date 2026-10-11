import { Linking, Platform, Share, Text, View } from 'react-native';
import { emailLink, inviteMessage, whatsappLink } from '@/data/invite';
import { useMe, useStore } from '@/data/store';
import type { User } from '@/data/types';
import { Button, Card, Row, text } from './components';
import { notify } from './confirm';
import { markSetup } from './SetupChecklist';
import { space } from './theme';

/** Invite one person by WhatsApp or email with a ready-made message (2.9). */
export function InviteButtons({ user, onSent }: { user: Pick<User, 'name' | 'email'>; onSent?: () => void }) {
  const me = useMe();
  const { company, session } = useStore();
  const sent = () => {
    markSetup(session?.companyId, 'invited').catch(() => {});
    onSent?.();
  };
  const message = inviteMessage(company.name, session?.companyCode, user, me.name);
  const open = (url: string) =>
    Linking.openURL(url)
      .then(sent)
      .catch(() => notify('Could not open', 'Copy the message instead and send it yourself.'));
  const share = async () => {
    try {
      if (Platform.OS === 'web') {
        await (globalThis.navigator as Navigator | undefined)?.clipboard?.writeText(message);
        notify('Copied', 'The invitation is on your clipboard. Paste it into a message.');
      } else await Share.share({ message });
      sent();
    } catch {
      notify('Not copied', message);
    }
  };
  return (
    <Card>
      <Text style={text.title}>Invite {user.name.split(' ')[0] || 'them'}</Text>
      <Text style={[text.muted, { marginBottom: space.sm }]}>Sends the app link, company code {session?.companyCode ?? ''} and how to sign in the first time.</Text>
      <View>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button small title="WhatsApp" icon="logo-whatsapp" onPress={() => open(whatsappLink(message))} />
          <Button small title="Email" icon="mail-outline" variant="secondary" onPress={() => open(emailLink(user.email, company.name, message))} />
          <Button small title={Platform.OS === 'web' ? 'Copy' : 'Share'} icon={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} variant="ghost" onPress={share} />
        </Row>
      </View>
    </Card>
  );
}
