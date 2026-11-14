import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoardLayout } from '../types.js';
import { generateTiles } from './generateTiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../');
const boardPath = path.join(repoRoot, 'data/board.json');
const tilesPath = path.join(repoRoot, 'data/tiles.json');

const board = JSON.parse(fs.readFileSync(boardPath, 'utf-8')) as BoardLayout;
const tiles = generateTiles(board);

fs.writeFileSync(tilesPath, JSON.stringify(tiles, null, 2) + '\n', 'utf-8');
console.log(`Generated ${tiles.length} tiles -> ${tilesPath}`);
