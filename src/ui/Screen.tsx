import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLayout } from './layout';
import { colors } from './theme';

/**
 * Scrollable page with a max width so the web layout reads well on desktop. `wide` pages (lists and
 * dashboards) use the whole width when the phone is turned sideways.
 */
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
  const { maxWide, pad } = useLayout();
  const inner = [styles.inner, { maxWidth: wide ? maxWide : 760, padding: pad }];
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
  inner: { width: '100%', alignSelf: 'center', paddingBottom: 56 },
});
