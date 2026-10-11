import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MAX_SIGNATURE_POINTS } from '@/data/mutations';
import type { Signature } from '@/data/types';
import { Button, Field, Row, text } from './components';
import { colors, radius, space } from './theme';

/** Signature coordinates are stored on a 0..1000 grid, whatever the pad's size on screen. */
const GRID = 1000;
const ASPECT = 0.38;

const toPath = (strokes: number[][], w: number, h: number) =>
  strokes
    .map((st) => {
      let d = '';
      for (let i = 0; i < st.length; i += 2) d += `${i ? 'L' : 'M'}${((st[i] / GRID) * w).toFixed(1)} ${((st[i + 1] / GRID) * h).toFixed(1)} `;
      // A single tap draws a dot.
      if (st.length === 2) d += `l0.1 0.1`;
      return d;
    })
    .join(' ');

/** Shows a saved signature. */
export function SignatureView({ signature, height = 90 }: { signature: Signature; height?: number }) {
  const [w, setW] = useState(0);
  return (
    <View>
      <View style={[styles.view, { height }]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} accessibilityLabel={`Signature of ${signature.name}`}>
        {w > 0 && (
          <Svg width={w} height={height}>
            <Path d={toPath(signature.strokes, w, height)} stroke={colors.text} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        )}
      </View>
      <Text style={text.small}>
        Signed by {signature.name} · {new Date(signature.at).toLocaleString()}
      </Text>
    </View>
  );
}

/** Lets a doctor sign on the screen with a finger. Calls onDone with the signature, or onCancel. */
export function SignaturePad({ initialName = '', onDone, onCancel }: { initialName?: string; onDone: (s: Signature) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  const current = useRef<number[] | null>(null);
  const points = strokes.reduce((n, s) => n + s.length / 2, 0);
  const [error, setError] = useState('');

  const add = (x: number, y: number) => {
    const { w, h } = sizeRef.current;
    if (!w || !h || !current.current) return;
    const gx = Math.max(0, Math.min(GRID, Math.round((x / w) * GRID)));
    const gy = Math.max(0, Math.min(GRID, Math.round((y / h) * GRID)));
    const st = current.current;
    // Skip points closer than ~0.6% of the pad, which keeps signatures small.
    if (st.length >= 2 && Math.abs(st[st.length - 2] - gx) + Math.abs(st[st.length - 1] - gy) < 6) return;
    st.push(gx, gy);
    setStrokes((all) => [...all.slice(0, -1), [...st]]);
  };

  // Made once; its handlers only touch refs and state setters, on touch (never while rendering).
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        current.current = [];
        setStrokes((all) => [...all, []]);
        add(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) => add(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderRelease: () => {
        current.current = null;
        setStrokes((all) => all.filter((s) => s.length >= 2));
      },
    }),
  );

  const done = () => {
    if (!name.trim()) return setError('Write the name of the person signing.');
    if (points < 2) return setError('Ask them to sign in the box.');
    if (points > MAX_SIGNATURE_POINTS || strokes.length > 60) return setError('The signature is too detailed. Clear it and sign again.');
    onDone({ name: name.trim(), strokes: strokes.filter((s) => s.length >= 2), at: new Date().toISOString() });
  };

  return (
    <View>
      <Field label="Name of the person signing" value={name} onChangeText={setName} placeholder="e.g. Dr Amara Okafor" />
      <Text style={[text.small, { marginBottom: 4 }]}>Sign in the box with a finger</Text>
      <View
        style={[styles.pad, { aspectRatio: 1 / ASPECT }]}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        {...pan.panHandlers}
        accessibilityLabel="Signature box"
      >
        {size.w > 0 && (
          <Svg width={size.w} height={size.h} pointerEvents="none">
            <Path d={toPath(strokes, size.w, size.h)} stroke={colors.text} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        )}
        <View style={styles.line} pointerEvents="none" />
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
        <Button title="Save signature" icon="checkmark-outline" onPress={done} />
        <Button title="Clear" variant="secondary" onPress={() => { setStrokes([]); setError(''); }} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { width: '100%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  view: { width: '100%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.sm, overflow: 'hidden', marginBottom: 4 },
  line: { position: 'absolute', left: '8%', right: '8%', bottom: '22%', borderBottomWidth: 1, borderColor: colors.border },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
});
