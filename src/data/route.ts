import { distanceM } from './geo';

export interface Stop {
  id: string;
  lat: number;
  lng: number;
}

const legs = (start: Stop | undefined, order: Stop[]) => {
  let total = 0;
  let prev = start;
  for (const s of order) {
    if (prev) total += distanceM(prev, s);
    prev = s;
  }
  return total;
};

/**
 * A short visiting order: nearest stop first from where you are, then improved by reversing
 * stretches of the route (2-opt) while that makes it shorter. Good for the handful of visits in a day.
 */
export function bestRoute(stops: Stop[], start?: { lat: number; lng: number }): { order: Stop[]; metres: number } {
  const from = start ? { id: '_start', ...start } : undefined;
  const left = [...stops];
  const order: Stop[] = [];
  let cur: Stop | undefined = from;
  while (left.length) {
    let best = 0;
    if (cur) {
      let d = Infinity;
      left.forEach((s, i) => {
        const x = distanceM(cur!, s);
        if (x < d) [d, best] = [x, i];
      });
    }
    cur = left.splice(best, 1)[0];
    order.push(cur);
  }
  let improved = order.length > 3;
  for (let pass = 0; improved && pass < 50; pass++) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const next = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (legs(from, next) + 1 < legs(from, order)) {
          order.splice(0, order.length, ...next);
          improved = true;
        }
      }
    }
  }
  return { order, metres: legs(from, order) };
}

/** Google Maps directions through the stops in order (it opens the Maps app on phones). */
export function directionsUrl(order: { lat: number; lng: number }[], start?: { lat: number; lng: number }): string {
  const p = (x: { lat: number; lng: number }) => `${x.lat.toFixed(6)},${x.lng.toFixed(6)}`;
  const dest = order[order.length - 1];
  const via = order.slice(0, -1).slice(0, 9).map(p).join('|');
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving${start ? `&origin=${p(start)}` : ''}&destination=${p(dest)}${via ? `&waypoints=${encodeURIComponent(via)}` : ''}`;
}
