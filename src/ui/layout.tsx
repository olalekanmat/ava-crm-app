import { Children, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { space } from './theme';

/**
 * Screen shape. A phone turned on its side (or a tablet or computer) uses the full width and shows
 * lists in columns, so more fits on screen; a phone on its side also uses tighter margins.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const compact = landscape && height < 520;
  return {
    width,
    height,
    landscape,
    compact,
    /** Page margin. */
    pad: compact ? space.md : space.lg,
    /** Widest a list or dashboard page grows. Forms stay narrower (760). */
    maxWide: landscape ? 1440 : 1040,
  };
}

/** How many columns of cards at least `min` wide fit in `width`. */
export const columnsFor = (width: number, min = 330, max = 4) => Math.max(1, Math.min(max, Math.floor((width + space.sm) / (min + space.sm))));

/** Lays cards out in as many columns as fit (one on a phone held upright). */
export function Grid({ children, min = 330 }: { children: ReactNode; min?: number }) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState<number>();
  const items = Children.toArray(children);
  const cols = columnsFor(width ?? Math.min(windowWidth, 760) - 2 * space.lg, min);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: cols > 1 ? -space.xs : 0 }}>
      {items.map((child, i) => (
        <View key={(child as { key?: string }).key ?? i} style={{ width: `${100 / cols}%`, paddingHorizontal: cols > 1 ? space.xs : 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}
