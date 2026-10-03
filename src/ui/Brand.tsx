import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from './theme';

export const mark = require('../../assets/ava-mark.png');

/** Logo mark plus wordmark, for headers and the sign-in screen. */
export function BrandTitle({ size = 26, light = false }: { size?: number; light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.25 }}>
      <Image source={mark} style={{ width: size * 0.5, height: size * 1.05 }} contentFit="contain" />
      <Text style={{ fontSize: size * 0.82, fontWeight: '800', letterSpacing: -0.5, color: light ? '#fff' : colors.primaryDark }}>Ava</Text>
    </View>
  );
}

/** Gradient header card used at the top of each home dashboard. */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={[colors.primaryDark, colors.primary, colors.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      {children}
    </LinearGradient>
  );
}

export const heroText = StyleSheet.create({
  eyebrow: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  body: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4 },
});

/** Value tile inside the hero. */
export function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg + 4, padding: space.lg + 2, marginBottom: space.md },
  stat: { flexGrow: 1, flexBasis: 64, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.sm + 2 },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
});
