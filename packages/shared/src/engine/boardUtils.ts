import type {
  BoardLayout,
  BoardSpecialKind,
  BoardSpecialTile,
  LadderDef,
  PawnId,
  SnakeDef,
  ZoneDef,
  ZoneId,
} from '../types.js';

export const BOARD_SPECIAL_TILES: readonly BoardSpecialTile[] = [
  {
    tileId: 12,
    kind: 'star_fountain',
    name: 'Mata Air Bintang',
    description: 'Dapat +2 Bintang bonus seketika!',
  },
  {
    tileId: 22,
    kind: 'supply_crate',
    name: 'Peti Suplai',
    description: 'Dapat 1 Item taktis gratis (atau +2 ★ jika penuh)!',
  },
  {
    tileId: 38,
    kind: 'shield_shrine',
    name: 'Kuil Perisai',
    description: 'Dapat +1 Perisai Anti-Ular otomatis!',
  },
  {
    tileId: 43,
    kind: 'tailwind',
    name: 'Portal Angin',
    description: 'Dorongan cepat +2 kotak ke depan!',
  },
  {
    tileId: 60,
    kind: 'star_fountain',
    name: 'Mata Air Bintang',
    description: 'Dapat +2 Bintang bonus seketika!',
  },
  {
    tileId: 69,
    kind: 'supply_crate',
    name: 'Peti Suplai',
    description: 'Dapat 1 Item taktis gratis (atau +2 ★ jika penuh)!',
  },
  {
    tileId: 84,
    kind: 'shield_shrine',
    name: 'Kuil Perisai',
    description: 'Dapat +1 Perisai Anti-Ular otomatis!',
  },
  {
    tileId: 88,
    kind: 'tailwind',
    name: 'Portal Angin',
    description: 'Dorongan cepat +2 kotak ke depan!',
  },
];

export function getBoardSpecialTile(tileId: number): BoardSpecialTile | undefined {
  return BOARD_SPECIAL_TILES.find((t) => t.tileId === tileId);
}

export interface TileGridCoord {
  tileId: number;
  row: number; // 0 (bottom, 1..10) to 9 (top, 91..100)
  col: number; // 0 (left) to 9 (right)
  x: number;   // world space centered around 0
  z: number;   // world space centered around 0 (row 0 at +z, row 9 at -z)
}

export const TILE_SPACING = 1.8;

export function getZoneForTile(tileId: number): ZoneId {
  if (tileId <= 25) return 'taman_permen';
  if (tileId <= 50) return 'hutan_ngantuk';
  if (tileId <= 75) return 'gunung_es';
  return 'kastil_awan';
}

export function getZoneDef(board: BoardLayout, tileId: number): ZoneDef {
  return (
    board.zones.find((z) => tileId >= z.startTile && tileId <= z.endTile) ?? board.zones[0]
  );
}

/**
 * Computes boustrophedon (zigzag) 10x10 coordinates for tile 1..100.
 * Row 0: 1 -> 10 (left to right)
 * Row 1: 20 <- 11 (right to left)
 * ...
 * Row 9: 100 <- 91 (right to left, so 100 is at col 0, row 9)
 */
export function getTileGridCoord(tileId: number, spacing = TILE_SPACING): TileGridCoord {
  const clamped = Math.max(1, Math.min(100, tileId));
  const zeroBased = clamped - 1;
  const row = Math.floor(zeroBased / 10);
  const offsetInRow = zeroBased % 10;
  const col = row % 2 === 0 ? offsetInRow : 9 - offsetInRow;

  const halfBoard = 4.5 * spacing;
  const x = col * spacing - halfBoard;
  const z = (9 - row) * spacing - halfBoard;

  return { tileId: clamped, row, col, x, z };
}

export interface MoveComputation {
  from: number;
  to: number;
  path: number[];
  bounced: boolean;
}

/**
 * Computes step-by-step pawn movement from `from` with `steps`.
 * Landing on 100 must be exact; overshooting bounces backward by remaining steps.
 */
export function computeMove(from: number, steps: number, boardSize = 100): MoveComputation {
  if (steps <= 0) {
    return { from, to: from, path: [], bounced: false };
  }
  const path: number[] = [];
  let current = from;
  let direction = 1;
  let bounced = false;

  for (let i = 0; i < steps; i++) {
    if (current === boardSize) {
      direction = -1;
      bounced = true;
    } else if (current === 1 && direction === -1) {
      direction = 1;
    }
    current += direction;
    path.push(current);
  }

  return {
    from,
    to: current,
    path,
    bounced,
  };
}

export function findLadderAt(board: BoardLayout, tileId: number): LadderDef | undefined {
  return board.ladders.find((l) => l.from === tileId);
}

export function findSnakeAt(board: BoardLayout, tileId: number): SnakeDef | undefined {
  return board.snakes.find((s) => s.from === tileId);
}

export interface LandingPreview {
  diceValue: number;
  steps: number;
  to: number;
  bounced: boolean;
  ladderTo?: number;
  snakeTo?: number;
  specialKind?: BoardSpecialKind;
}

/**
 * Computes effective board steps including Sepatu Turbo and Koko's Frog Hop perk.
 */
export function computeEffectiveDiceSteps(
  diceValue: number,
  usedTurbo = false,
  pawn?: PawnId,
): number {
  const frogHop = pawn === 'kodok' && diceValue === 1 ? 1 : 0;
  return diceValue + (usedTurbo ? 2 : 0) + frogHop;
}

/**
 * Computes tactical landing destination & ladder/snake/special-event preview for a dice roll.
 */
export function previewDiceLanding(
  board: BoardLayout,
  fromTile: number,
  diceValue: number,
  usedTurbo = false,
  pawn?: PawnId,
): LandingPreview {
  const steps = computeEffectiveDiceSteps(diceValue, usedTurbo, pawn);
  const move = computeMove(fromTile, steps, board.size);
  const ladder = findLadderAt(board, move.to);
  const snake = findSnakeAt(board, move.to);
  const special = getBoardSpecialTile(move.to);
  return {
    diceValue,
    steps,
    to: move.to,
    bounced: move.bounced,
    ladderTo: ladder?.to,
    snakeTo: snake?.to,
    specialKind: special?.kind,
  };
}

/**
 * Validates that ladders & snakes form no chains (endpoints never overlap any start/head)
 * and stay strictly within 2..99.
 */
export function validateBoardLayout(board: BoardLayout): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const used = new Set<number>();

  for (const ladder of board.ladders) {
    if (ladder.from <= 1 || ladder.to >= board.size || ladder.from >= ladder.to) {
      errors.push(`Invalid ladder ${ladder.id}: ${ladder.from}->${ladder.to}`);
    }
    if (used.has(ladder.from) || used.has(ladder.to)) {
      errors.push(`Overlapping endpoint in ladder ${ladder.id}`);
    }
    used.add(ladder.from);
    used.add(ladder.to);
  }

  for (const snake of board.snakes) {
    if (snake.from >= board.size || snake.to <= 1 || snake.from <= snake.to) {
      errors.push(`Invalid snake ${snake.id}: ${snake.from}->${snake.to}`);
    }
    if (used.has(snake.from) || used.has(snake.to)) {
      errors.push(`Overlapping endpoint in snake ${snake.id}`);
    }
    used.add(snake.from);
    used.add(snake.to);
  }

  return { valid: errors.length === 0, errors };
}
