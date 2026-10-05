import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useStore } from '@/data/store';
import type { User } from '@/data/types';
import { Button, Row, UserAvatar, text } from './components';
import { notify } from './confirm';
import { pickPhoto } from './photo';
import { colors, space } from './theme';

/** Shows a person's profile picture with buttons to take, choose or remove one. */
export function PhotoEditor({ user }: { user: User }) {
  const { run } = useStore();
  const [busy, setBusy] = useState(false);
  const save = (photo?: string) => {
    try {
      run({ type: 'user.photo', id: user.id, photo });
    } catch (e) {
      notify('Photo not saved', e instanceof Error ? e.message : String(e));
    }
  };
  const pick = async (source: 'camera' | 'library') => {
    setBusy(true);
    try {
      const photo = await pickPhoto(source);
      if (photo) save(photo);
    } catch (e) {
      notify('Photo not saved', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Row gap={space.lg}>
      <View>
        <UserAvatar user={user} size={76} />
        {busy && (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[text.title, { marginBottom: space.sm }]}>Profile photo</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button small title="Take photo" icon="camera-outline" variant="secondary" onPress={() => pick('camera')} disabled={busy} />
          <Button small title="Choose photo" icon="images-outline" variant="secondary" onPress={() => pick('library')} disabled={busy} />
          {!!user.photo && <Button small title="Remove" icon="trash-outline" variant="ghost" onPress={() => save(undefined)} disabled={busy} />}
        </Row>
      </View>
    </Row>
  );
}
