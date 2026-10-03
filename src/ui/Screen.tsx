import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { colors, space } from './theme';

/** Scrollable page with a max width so the web layout reads well on desktop. */
export function Screen({
  children,
  scroll = true,
  wide = false,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  wide?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const inner = [styles.inner, { maxWidth: wide ? 1040 : 760 }];
  if (!scroll) return <View style={[styles.root, inner]}>{children}</View>;
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={inner}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: space.lg, width: '100%', alignSelf: 'center', paddingBottom: 56 },
});
