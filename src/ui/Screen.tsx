import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, space } from './theme';

/** Scrollable page with a max width so the web layout reads well on desktop. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={[styles.root, styles.inner]}>{children}</View>;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: space.lg, width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 48 },
});
