/**
 * Deterministic 32-bit PRNG (Mulberry32) used across shared rules,
 * tile generation, server outcomes, and replayable match simulation.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mixes a match seed with an event sequence number or string salt
 * to produce an isolated deterministic sub-seed.
 */
export function hashSeed(baseSeed: number, ...salts: Array<number | string>): number {
  let h = (baseSeed >>> 0) ^ 0x9e3779b9;
  for (const salt of salts) {
    if (typeof salt === 'number') {
      h ^= (salt >>> 0) + 0x9e3779b9 + ((h << 6) >>> 0) + (h >>> 2);
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    } else {
      for (let i = 0; i < salt.length; i++) {
        h ^= salt.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
  }
  return h >>> 0;
}

export class SeededRng {
  private readonly fn: () => number;

  constructor(seed: number) {
    this.fn = mulberry32(seed);
  }

  next(): number {
    return this.fn();
  }

  nextInt(min: number, max: number): number {
    if (max < min) {
      throw new Error(`Invalid nextInt bounds: [${min}, ${max}]`);
    }
    return min + Math.floor(this.fn() * (max - min + 1));
  }

  nextFloat(min: number, max: number): number {
    return min + this.fn() * (max - min);
  }

  chance(probability: number): boolean {
    return this.fn() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return items[Math.floor(this.fn() * items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.fn() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export function deriveRng(matchSeed: number, eventSeq: number, label = ''): SeededRng {
  return new SeededRng(hashSeed(matchSeed, eventSeq, label));
}
