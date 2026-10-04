import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '@/data/store';
import { colors, radius, space } from './theme';

export const mark = require('../../assets/ava-mark.png');

/** Ava CRM mark plus wordmark, for the sign-in screen and the About line. */
export function BrandTitle({ size = 26, light = false }: { size?: number; light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.25 }}>
      <Image source={mark} style={{ width: size * 0.5, height: size * 1.05 }} contentFit="contain" />
      <Text style={{ fontSize: size * 0.82, fontWeight: '800', letterSpacing: -0.5, color: light ? '#fff' : colors.primaryDark }}>
        Ava <Text style={{ fontWeight: '600', color: light ? 'rgba(255,255,255,0.85)' : colors.primary }}>CRM</Text>
      </Text>
    </View>
  );
}

/** The company's logo, or its initials when it has none yet. */
export function CompanyLogo({ size = 32 }: { size?: number }) {
  const { company } = useStore();
  if (company.logo) return <Image source={{ uri: company.logo }} style={{ width: size * 1.6, height: size }} contentFit="contain" contentPosition="left" accessibilityLabel={`${company.name} logo`} />;
  const initials = (company.name || 'Ava CRM')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={company.name}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initials}</Text>
    </View>
  );
}

/** Header title on every page: the company logo at the top left, then the page title. */
export function HeaderTitle({ title }: { title?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 520 }}>
      <CompanyLogo size={28} />
      {!!title && (
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, flexShrink: 1 }} numberOfLines={1}>
          {title}
        </Text>
      )}
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
