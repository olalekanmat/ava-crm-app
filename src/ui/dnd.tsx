import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, ScrollView, StyleSheet, Text, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import type { Call } from '@/data/types';
import { colors, radius, shadow } from './theme';

/**
 * 2.15 drag and drop for the calendar. A computer drags with the mouse straight away; a phone or
 * tablet holds an item for a moment first, so scrolling still works. Drop targets are measured on
 * screen when a drag starts, and the ones under the finger light up.
 */
export type DragItem = { kind: 'call'; call: Call } | { kind: 'account'; accountId: string };
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Target {
  ref: { current: View | null };
  drop: { current: (item: DragItem, x: number, y: number, rect: Rect) => void };
}
interface Dnd {
  /** True while an item is held or dragged: scroll views stop scrolling. */
  holding: boolean;
  overId: string | null;
  active: DragItem | null;
  hold(on: boolean): void;
  begin(item: DragItem, label: string, x: number, y: number): void;
  move(x: number, y: number): void;
  end(drop: boolean): void;
  register(id: string, t: Target): () => void;
}

const Ctx = createContext<Dnd | null>(null);
export const useDnd = () => useContext(Ctx);

export function DndProvider({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const root = useRef<View | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const targets = useRef(new Map<string, Target>());
  const rects = useRef(new Map<string, Rect>());
  const [pos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const last = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState<DragItem | null>(null);
  const [label, setLabel] = useState('');
  const [holding, setHolding] = useState(false);
  const [overId, setOverId] = useState<string | null>(null);
  const over = useRef<string | null>(null);
  const item = useRef<DragItem | null>(null);

  const hit = (x: number, y: number) => {
    for (const [id, r] of rects.current) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return id;
    return null;
  };

  const api = useMemo<Dnd>(
    () => ({
      holding: false,
      overId: null,
      active: null,
      hold: (on) => setHolding(on),
      begin(it, text, x, y) {
        item.current = it;
        setActive(it);
        setLabel(text);
        setHolding(true);
        last.current = { x, y };
        root.current?.measureInWindow((ox, oy) => {
          origin.current = { x: ox, y: oy };
          pos.setValue({ x: last.current.x - ox, y: last.current.y - oy });
        });
        rects.current.clear();
        for (const [id, t] of targets.current) t.ref.current?.measureInWindow((rx, ry, w, h) => rects.current.set(id, { x: rx, y: ry, w, h }));
      },
      move(x, y) {
        last.current = { x, y };
        pos.setValue({ x: x - origin.current.x, y: y - origin.current.y });
        const id = hit(x, y);
        if (id !== over.current) {
          over.current = id;
          setOverId(id);
        }
      },
      end(drop) {
        const it = item.current;
        const id = hit(last.current.x, last.current.y);
        item.current = null;
        over.current = null;
        setActive(null);
        setOverId(null);
        setHolding(false);
        if (!drop || !it || !id) return;
        const t = targets.current.get(id);
        const r = rects.current.get(id);
        if (t && r) t.drop.current(it, last.current.x, last.current.y, r);
      },
      register(id, t) {
        targets.current.set(id, t);
        return () => {
          targets.current.delete(id);
          rects.current.delete(id);
        };
      },
    }),
    [pos],
  );
  const value = useMemo(() => ({ ...api, holding, overId, active }), [api, holding, overId, active]);

  return (
    <Ctx.Provider value={value}>
      <View ref={root} style={[{ flex: 1 }, style]} collapsable={false}>
        {children}
        {active && (
          <Animated.View pointerEvents="none" style={[styles.ghost, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}>
            <Text style={styles.ghostText} numberOfLines={1}>
              {label}
            </Text>
          </Animated.View>
        )}
      </View>
    </Ctx.Provider>
  );
}

/**
 * Something that can be picked up: a call on the calendar or a doctor in the plan list. Inside a
 * pressable (such as a day of the month), pass `onTap`: the item then takes the press itself and
 * a tap without a drag calls `onTap`.
 */
export function Draggable({ item, label, disabled, children, style, onTap }: { item: DragItem; label: string; disabled?: boolean; children: ReactNode; style?: StyleProp<ViewStyle>; onTap?: () => void }) {
  const dnd = useDnd();
  const armed = useRef(false);
  const started = useRef(false);
  const touched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const live = useRef({ dnd, item, label, onTap });
  useEffect(() => {
    live.current = { dnd, item, label, onTap };
  });
  const off = !dnd || disabled;

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const ready = (g: { dx: number; dy: number }) => armed.current || (Platform.OS === 'web' && !touched.current && Math.hypot(g.dx, g.dy) > 6);
  const go = (g: { moveX: number; moveY: number; x0: number; y0: number }) => {
    clear();
    started.current = true;
    live.current.dnd?.begin(live.current.item, live.current.label, g.moveX || g.x0, g.moveY || g.y0);
  };

  // Made once; its handlers only touch refs, on touch (never while rendering).
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      // With onTap the item takes the press at once and starts the drag once it moves (or is held).
      onStartShouldSetPanResponder: () => !!live.current.onTap,
      onMoveShouldSetPanResponderCapture: (_, g) => ready(g),
      onPanResponderGrant: (_, g) => {
        started.current = false;
        if (live.current.onTap && !ready(g)) return;
        go(g);
      },
      onPanResponderMove: (_, g) => {
        if (!started.current) {
          if (ready(g)) go(g);
          return;
        }
        live.current.dnd?.move(g.moveX, g.moveY);
      },
      onPanResponderRelease: (_, g) => {
        clear();
        armed.current = false;
        if (started.current) live.current.dnd?.end(true);
        else if (Math.hypot(g.dx, g.dy) < 8) live.current.onTap?.();
        started.current = false;
      },
      onPanResponderTerminate: () => {
        clear();
        armed.current = false;
        if (started.current) live.current.dnd?.end(false);
        started.current = false;
      },
      // Before the drag starts, a scroll view may still take over (to scroll); after, nothing may.
      onPanResponderTerminationRequest: () => !started.current,
    }),
  );

  if (off) return <View style={style}>{children}</View>;
  return (
    <View
      {...pan.panHandlers}
      style={[style, Platform.OS === 'web' && ({ userSelect: 'none', cursor: 'grab' } as object)]}
      onTouchStart={(e) => {
        touched.current = true;
        start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        clear();
        timer.current = setTimeout(() => {
          armed.current = true;
          live.current.dnd?.hold(true);
        }, 280);
      }}
      onTouchMove={(e) => {
        if (!armed.current && Math.hypot(e.nativeEvent.pageX - start.current.x, e.nativeEvent.pageY - start.current.y) > 8) clear();
      }}
      onTouchEnd={() => {
        clear();
        if (armed.current && !started.current) live.current.dnd?.hold(false);
        armed.current = false;
        // Browsers send mouse events after a touch; ignore them for a moment.
        setTimeout(() => (touched.current = false), 800);
      }}
    >
      {children}
    </View>
  );
}

/** Registers a view as a drop target; returns the ref to put on it and whether a dragged item is over it. */
export function useDropTarget(id: string, onDrop: (item: DragItem, x: number, y: number, rect: Rect) => void): { ref: { current: View | null }; over: boolean } {
  const dnd = useDnd();
  const ref = useRef<View | null>(null);
  const drop = useRef(onDrop);
  useEffect(() => {
    drop.current = onDrop;
  });
  const register = dnd?.register;
  useEffect(() => register?.(id, { ref, drop }), [register, id]);
  return { ref, over: dnd?.overId === id };
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    marginLeft: -60,
    marginTop: -40,
    width: 150,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    opacity: 0.92,
    ...shadow,
  },
  ghostText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

/** A scroll view that holds still while something is being dragged. */
export function DndScrollView(props: ScrollViewProps) {
  const dnd = useDnd();
  return <ScrollView {...props} scrollEnabled={props.scrollEnabled !== false && !dnd?.holding} />;
}
