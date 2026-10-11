import type { Call, Product, Reaction, SlideView } from './types';

/** Name of a presentation file in the company folder. The hash makes each upload a new file. */
export const deckFileName = (productId: string, hash: string) => `ava-deck-${productId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}-${hash.slice(0, 12)}.json`;

/** What a presentation file holds: the slides as JPEG or PNG data URIs. */
export interface DeckFile {
  format: 'ava-deck/1';
  productId: string;
  slides: string[];
}

export const MAX_SLIDE_CHARS = 450_000;
const SLIDE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** The slides from a downloaded presentation file, or null when it is not one. */
export function parseDeckFile(text: string): DeckFile | null {
  try {
    const d = JSON.parse(text) as DeckFile;
    if (d?.format !== 'ava-deck/1' || !Array.isArray(d.slides) || !d.slides.length) return null;
    if (d.slides.some((x) => typeof x !== 'string' || x.length > MAX_SLIDE_CHARS || !SLIDE_RE.test(x))) return null;
    return d;
  } catch {
    return null;
  }
}

export const productsWithDecks = (products: Product[]) => products.filter((p) => p.active && p.deck);

/** Time per slide merged into one list: the same slide shown twice adds up. */
export function mergeViews(views: SlideView[]): SlideView[] {
  const by = new Map<string, SlideView>();
  for (const v of views) {
    const key = `${v.product}#${v.slide}`;
    const cur = by.get(key);
    if (cur) cur.seconds = Math.min(3 * 3600, cur.seconds + v.seconds);
    else by.set(key, { ...v });
  }
  return [...by.values()].filter((v) => v.seconds > 0).sort((a, b) => a.product.localeCompare(b.product) || a.slide - b.slide);
}

export interface DeckStats {
  product: string;
  /** Submitted calls in which the presentation was shown. */
  calls: number;
  /** Average seconds per call. */
  avgSeconds: number;
  /** Seconds per slide over all calls, slide 1 first. */
  bySlide: { slide: number; seconds: number; calls: number }[];
  reactions: Record<Reaction, number>;
}

/** How each product's presentation is used, from submitted calls. */
export function detailingStats(calls: Call[]): DeckStats[] {
  const by = new Map<string, { calls: Set<string>; seconds: number; slides: Map<number, { seconds: number; calls: Set<string> }>; reactions: Record<Reaction, number> }>();
  for (const c of calls) {
    if (c.status !== 'Submitted' || !c.detailing?.length) continue;
    const products = new Set<string>();
    for (const v of c.detailing) {
      let x = by.get(v.product);
      if (!x) by.set(v.product, (x = { calls: new Set(), seconds: 0, slides: new Map(), reactions: { Positive: 0, Neutral: 0, Negative: 0 } }));
      x.calls.add(c.id);
      x.seconds += v.seconds;
      const sl = x.slides.get(v.slide) ?? { seconds: 0, calls: new Set<string>() };
      sl.seconds += v.seconds;
      sl.calls.add(c.id);
      x.slides.set(v.slide, sl);
      products.add(v.product);
    }
    if (c.reaction) for (const p of products) by.get(p)!.reactions[c.reaction]++;
  }
  return [...by.entries()]
    .map(([product, x]) => ({
      product,
      calls: x.calls.size,
      avgSeconds: Math.round(x.seconds / Math.max(1, x.calls.size)),
      bySlide: [...x.slides.entries()].sort((a, b) => a[0] - b[0]).map(([slide, v]) => ({ slide, seconds: v.seconds, calls: v.calls.size })),
      reactions: x.reactions,
    }))
    .sort((a, b) => b.calls - a.calls);
}

/** "1 min 20 s", "45 s". */
export function formatSeconds(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}
