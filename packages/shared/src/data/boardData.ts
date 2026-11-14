import type { BoardLayout, Tile } from '../types.js';
import boardJson from '../../../../data/board.json' with { type: 'json' };
import tilesJson from '../../../../data/tiles.json' with { type: 'json' };

export const BOARD_LAYOUT: BoardLayout = boardJson as BoardLayout;
export const TILES: Tile[] = tilesJson as Tile[];
