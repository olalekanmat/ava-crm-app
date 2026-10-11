import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadDeck } from '@/cloud/decks';
import { mergeViews } from '@/data/detailing';
import { useStore } from '@/data/store';
import { REACTIONS, type Product, type Reaction, type SlideView } from '@/data/types';
import { colors, radius, space } from './theme';

/** The time now, in ms (slide timing happens in touch handlers, not while rendering). */
const clock = () => Date.now();
const STAGE = '#000';
const ON_STAGE = '#fff';
const REACTION_ICON: Record<Reaction, keyof typeof Ionicons.glyphMap> = { Positive: 'happy-outline', Neutral: 'remove-circle-outline', Negative: 'sad-outline' };

/**
 * Full-screen product presentation for a call. Swipe or tap the arrows to move between slides;
 * Ava times each slide and, at the end, asks how the doctor responded.
 */
export function Presenter({
  visible,
  products,
  onClose,
  onDone,
}: {
  visible: boolean;
  /** Products with a presentation, in the order to offer them. */
  products: Product[];
  onClose: () => void;
  onDone: (views: SlideView[], reaction?: Reaction) => void;
}) {
  const { drive } = useStore();
  const { width, height } = useWindowDimensions();
  const [productIdx, setProductIdx] = useState(0);
  const [slides, setSlides] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [asking, setAsking] = useState(false);
  const views = useRef<SlideView[]>([]);
  const since = useRef(0);
  const list = useRef<FlatList<string>>(null);
  const product = products[productIdx];
  const deck = product ? slides[product.name] : undefined;
  const error = product ? errors[product.name] : undefined;

  // The parent mounts the presenter each time it opens, so state starts fresh; the clock starts now.
  useEffect(() => {
    since.current = Date.now();
  }, []);

  useEffect(() => {
    if (!visible || !product?.deck || slides[product.name]) return;
    let live = true;
    loadDeck(drive(), product.deck)
      .then((s) => live && setSlides((x) => ({ ...x, [product.name]: s })))
      .catch((e) => live && setErrors((x) => ({ ...x, [product.name]: e instanceof Error ? e.message : String(e) })));
    return () => {
      live = false;
    };
  }, [visible, product, slides, drive]);


  /** Adds the time on the slide being left. */
  const record = () => {
    if (!product || !deck?.length) return;
    const seconds = Math.round((clock() - since.current) / 1000);
    if (seconds > 0) views.current.push({ product: product.name, slide: index + 1, seconds: Math.min(seconds, 3 * 3600) });
    since.current = clock();
  };

  const goTo = (i: number) => {
    if (!deck || i < 0 || i >= deck.length || i === index) return;
    record();
    setIndex(i);
    list.current?.scrollToIndex({ index: i, animated: true });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      record();
      setIndex(i);
    }
  };

  const switchProduct = (i: number) => {
    if (i === productIdx) return;
    record();
    setProductIdx(i);
    setIndex(0);
  };

  const finish = () => {
    record();
    setAsking(true);
  };

  const close = (reaction?: Reaction) => {
    const merged = mergeViews(views.current);
    setAsking(false);
    if (merged.length) onDone(merged, reaction);
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={finish} supportedOrientations={['portrait', 'landscape']} statusBarTranslucent>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.bar}>
          <View style={styles.tabs}>
            {products.map((p, i) => (
              <Pressable key={p.id} onPress={() => switchProduct(i)} style={[styles.tab, i === productIdx && styles.tabOn]} accessibilityRole="button" accessibilityState={{ selected: i === productIdx }}>
                <Text style={[styles.tabText, i === productIdx && styles.tabTextOn]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
          {!!deck?.length && (
            <Text style={styles.count}>
              {index + 1} / {deck.length}
            </Text>
          )}
          <Pressable onPress={finish} style={styles.done} accessibilityRole="button" accessibilityLabel="Finish presentation">
            <Text style={styles.doneText}>Finish</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          {error ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={36} color={ON_STAGE} />
              <Text style={styles.message}>{error}</Text>
            </View>
          ) : !deck ? (
            <View style={styles.center}>
              <ActivityIndicator color={ON_STAGE} />
              <Text style={styles.message}>Opening the {product?.name} presentation…</Text>
            </View>
          ) : (
            <FlatList
              key={product?.id}
              ref={list}
              data={deck}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              onMomentumScrollEnd={onScrollEnd}
              renderItem={({ item, index: i }) => (
                <View style={{ width, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={{ uri: item }} style={{ width, height: Math.max(200, height - 140) }} contentFit="contain" accessibilityLabel={`Slide ${i + 1}`} />
                </View>
              )}
            />
          )}
          {!!deck && deck.length > 1 && (
            <>
              {index > 0 && (
                <Pressable onPress={() => goTo(index - 1)} style={[styles.arrow, { left: space.sm }]} accessibilityLabel="Previous slide">
                  <Ionicons name="chevron-back" size={28} color={ON_STAGE} />
                </Pressable>
              )}
              {index < deck.length - 1 && (
                <Pressable onPress={() => goTo(index + 1)} style={[styles.arrow, { right: space.sm }]} accessibilityLabel="Next slide">
                  <Ionicons name="chevron-forward" size={28} color={ON_STAGE} />
                </Pressable>
              )}
            </>
          )}
        </View>

        {asking && (
          <View style={styles.sheetWrap}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>How did the doctor respond?</Text>
              <View style={styles.reactions}>
                {REACTIONS.map((r) => (
                  <Pressable key={r} onPress={() => close(r)} style={styles.reaction} accessibilityRole="button">
                    <Ionicons name={REACTION_ICON[r]} size={30} color={r === 'Positive' ? colors.success : r === 'Negative' ? colors.danger : colors.muted} />
                    <Text style={styles.reactionText}>{r}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => close()} style={{ alignSelf: 'center', padding: space.sm }}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Skip</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAsking(false);
                  since.current = Date.now();
                }}
                style={{ alignSelf: 'center', padding: space.xs }}
              >
                <Text style={{ color: colors.muted }}>Back to the slides</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: STAGE },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  tabs: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)', maxWidth: 180 },
  tabOn: { backgroundColor: ON_STAGE },
  tabText: { color: ON_STAGE, fontWeight: '600', fontSize: 13 },
  tabTextOn: { color: STAGE },
  count: { color: 'rgba(255,255,255,0.75)', fontVariant: ['tabular-nums'] },
  done: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
  doneText: { color: '#fff', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  message: { color: ON_STAGE, textAlign: 'center', maxWidth: 420 },
  arrow: { position: 'absolute', top: '45%', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  sheetWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  reactions: { flexDirection: 'row', justifyContent: 'space-around' },
  reaction: { alignItems: 'center', gap: 4, padding: space.sm, minWidth: 80 },
  reactionText: { color: colors.text, fontWeight: '600' },
});
