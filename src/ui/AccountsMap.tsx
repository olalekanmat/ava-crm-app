import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { DEFAULT_LICENSE_SERVER } from '@/cloud/license';
import { fitBounds, OSM_TILES, parseTileSource, project, TILE, tileAddress, unproject, type TileSource } from '@/data/mapData';
import { colors, radius, shadow } from './theme';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  color: string;
  /** Highlighted with a red ring (overdue). */
  ring?: boolean;
  /** HCOs are drawn as squares. */
  square?: boolean;
}

const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
/**
 * Map pictures (2.12.1): OpenStreetMap's own tiles unless the website's app settings name a provider
 * ("mapTiles" in avahealthcareltd.com/AvaCRM/app-config.json). OpenStreetMap's servers are not meant for
 * heavy use by a busy app, so a provider with a free tier can be switched in without a new app release.
 */
let tileSource: Promise<TileSource> | undefined;
function loadTileSource(): Promise<TileSource> {
  tileSource ??= fetch(`${DEFAULT_LICENSE_SERVER}/app-config.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then(parseTileSource)
    .catch(() => OSM_TILES);
  return tileSource;
}
function useTileSource(): TileSource | undefined {
  const [src, setSrc] = useState<TileSource>();
  useEffect(() => {
    let live = true;
    loadTileSource().then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, []);
  return src;
}
/** The cache key leaves out a provider key in the address, so changing the key keeps the cached tiles. */
const cacheKeyOf = (src: TileSource, z: number, x: number, y: number) => (src.osm ? `osm2/${tileAddress(src, z, x, y)}` : `tiles/${/^https:\/\/([^/?#]+)/.exec(src.url)?.[1] ?? 'map'}/${z}/${x}/${y}`);
/**
 * The same policy blocks apps that do not say who they are: phones would otherwise send the image
 * library's generic User-Agent (okhttp) and no Referer, and get "403 Access blocked" tiles. Browsers
 * send both on their own (and do not allow setting them), so the web app sends nothing extra.
 */
const TILE_HEADERS: Record<string, string> | undefined =
  Platform.OS === 'web'
    ? undefined
    : {
        'User-Agent': `AvaCRM/${Constants.expoConfig?.version ?? '0'} (${Platform.OS}; com.avacrm.app; +https://avahealthcareltd.com/AvaCRM)`,
        Referer: 'https://avahealthcareltd.com/AvaCRM/',
      };

/**
 * A small map with no extra libraries or API keys (2.9): OpenStreetMap tiles laid out by hand,
 * drag to move, buttons to zoom. Works the same on phones and on the web.
 */
export function AccountsMap({ pins, selected, onSelect, height = 420 }: { pins: MapPin[]; selected?: string; onSelect: (id: string | undefined) => void; height?: number }) {
  const src = useTileSource();
  const [size, setSize] = useState({ w: 0, h: height });
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  // The view fits the pins until someone drags or zooms; a new size or a new set of pins fits again.
  const fitKey = `${size.w}x${size.h}|${pins.map((p) => p.id).join(',')}`;
  const [moved, setMoved] = useState<{ key: string; lat: number; lng: number; zoom: number } | null>(null);
  // Pixels dragged since the view was last set; folded into the view on the next zoom.
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const fitted = useMemo(() => (size.w ? fitBounds(pins, size.w, size.h) : null), [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = moved && moved.key === fitKey ? moved : fitted;
  const view =
    base && (shift.x || shift.y)
      ? (() => {
          const c = project(base.lat, base.lng, base.zoom);
          return {
            ...unproject(c.x - shift.x, c.y - shift.y, base.zoom),
            zoom: base.zoom,
          };
        })()
      : base;
  const setView = (v: { lat: number; lng: number; zoom: number } | null) => {
    setMoved(v && { ...v, key: fitKey });
    setShift({ x: 0, y: 0 });
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
        onPanResponderMove: (_, g) => setDrag({ dx: g.dx, dy: g.dy }),
        onPanResponderRelease: (_, g) => {
          setShift((s) => ({ x: s.x + g.dx, y: s.y + g.dy }));
          setDrag({ dx: 0, dy: 0 });
        },
        onPanResponderTerminate: () => setDrag({ dx: 0, dy: 0 }),
      }),
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: height });
  const zoomBy = (d: number) =>
    view &&
    setView({
      ...view,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom + d)),
    });

  let tiles: { key: string; uri: string; cacheKey: string; left: number; top: number }[] = [];
  let placed: (MapPin & { left: number; top: number })[] = [];
  if (view && size.w) {
    const c = project(view.lat, view.lng, view.zoom);
    const ox = c.x - size.w / 2 - drag.dx;
    const oy = c.y - size.h / 2 - drag.dy;
    const n = 2 ** view.zoom;
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + size.w) / TILE); tx++) {
      for (let ty = Math.max(0, Math.floor(oy / TILE)); ty <= Math.min(n - 1, Math.floor((oy + size.h) / TILE)); ty++) {
        const wx = ((tx % n) + n) % n;
        if (src) tiles.push({
          key: `${view.zoom}/${tx}/${ty}`,
          uri: tileAddress(src, view.zoom, wx, ty),
          cacheKey: cacheKeyOf(src, view.zoom, wx, ty),
          left: tx * TILE - ox,
          top: ty * TILE - oy,
        });
      }
    }
    placed = pins
      .map((p) => {
        const q = project(p.lat, p.lng, view.zoom);
        return { ...p, left: q.x - ox, top: q.y - oy };
      })
      .filter((p) => p.left > -20 && p.top > -20 && p.left < size.w + 20 && p.top < size.h + 20);
    // The selected pin is drawn last, on top.
    placed.sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
  } else {
    tiles = [];
  }

  return (
    <View style={[styles.wrap, { height }]} onLayout={onLayout} {...pan.panHandlers}>
      {tiles.map((t) => (
        <Image
          key={t.key}
          // OpenStreetMap tiles keep the "osm2/" key: phones may have kept blocked tiles under the first one.
          source={{ uri: t.uri, headers: src?.osm ? TILE_HEADERS : undefined, cacheKey: t.cacheKey }}
          style={{
            position: 'absolute',
            left: t.left,
            top: t.top,
            width: TILE,
            height: TILE,
          }}
          cachePolicy="disk"
          transition={0}
          accessible={false}
        />
      ))}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(undefined)} accessible={false} />
      {placed.map((p) => {
        const big = p.id === selected;
        const d = big ? 22 : 14;
        return (
          <Pressable
            key={p.id}
            onPress={() => onSelect(p.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Account on map"
            style={{
              position: 'absolute',
              left: p.left - d / 2,
              top: p.top - d / 2,
              width: d,
              height: d,
              borderRadius: p.square ? 3 : d / 2,
              backgroundColor: p.color,
              borderWidth: p.ring ? 3 : 2,
              borderColor: p.ring ? colors.danger : '#fff',
              ...(big ? shadow : null),
            }}
          />
        );
      })}
      <View style={styles.zoom}>
        <Pressable onPress={() => zoomBy(1)} style={styles.zoomBtn} accessibilityLabel="Zoom in">
          <Ionicons name="add" size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => zoomBy(-1)} style={styles.zoomBtn} accessibilityLabel="Zoom out">
          <Ionicons name="remove" size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => setView(null)} style={styles.zoomBtn} accessibilityLabel="Show all">
          <Ionicons name="scan-outline" size={18} color={colors.text} />
        </Pressable>
      </View>
      <Text style={styles.credit}>{src?.attribution ?? OSM_TILES.attribution}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: '#dfe6ee',
    marginBottom: 12,
  },
  zoom: { position: 'absolute', right: 8, top: 8, gap: 6 },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ffffffee',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  credit: {
    position: 'absolute',
    right: 4,
    bottom: 2,
    fontSize: 10,
    color: '#333',
    backgroundColor: '#ffffffcc',
    paddingHorizontal: 4,
  },
});
