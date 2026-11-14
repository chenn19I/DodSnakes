# DodSnake

A **Semi-Doodle** 3D multiplayer tabletop Snakes & Ladders board game set on a textured sketchbook desk: **100 tiles** featuring unique challenges on every space (mini-games across tiles `2–99` and the final **Bos Doodle** boss fight on tile `100`), interactive **Character & Accessory Studio**, cute 3D animations, procedural tabletop audio, Online Multiplayer, Local Hot-Seat Mode, and Smart Bots.

## Monorepo Architecture

- `packages/shared` (`@doodle-dash/shared`): Pure deterministic game engine (no DOM dependency), seeded PRNG, turn state machine, challenge archetype registry, `data/tiles.json` generator, Zod multiplayer protocol schemas, 1,000-match bot simulator, and Vitest unit tests.
- `apps/server` (`@doodle-dash/server`): Authoritative Node.js + TypeScript + Socket.IO + Express server (4-letter room codes, anti-cheat challenge validation, 60-second reconnect window with automatic bot takeover, configurable `CORS_ORIGIN`, live emotes, and spectators).
- `apps/client` (`@doodle-dash/client`): Vite + TypeScript + Three.js + GSAP web client with 8-band smooth cel shading, gentle doodle outlines, 4-zone pastel 3D diorama board, interactive 3D Character & Accessory Studio, procedural Web Audio SFX + 32-bar tabletop BGM, and responsive portrait-first UI.
- `data/board.json` & `data/tiles.json`: Board configuration (snakes, ladders, zones) and 100 deterministic tile challenge definitions.

## Public Deployment on Vercel (`dodsnake.vercel.app`)

`vercel.json` is pre-configured to build `@doodle-dash/shared` and `@doodle-dash/client` (`apps/client/dist`) with SPA URL rewrites:

1. **Deploy Frontend to Vercel**:
   - Import `https://github.com/chenn19I/DodSnake` into [Vercel](https://vercel.com/) and name the project **`dodsnake`** (so it publishes at **`https://dodsnake.vercel.app`**).
   - If `dodsnake.vercel.app` is already claimed globally on Vercel, recommended clean alternatives are `dodsnake-game.vercel.app`, `dodsnake-play.vercel.app`, `dodsnake-id.vercel.app`, `play-dodsnake.vercel.app`, or `dodsnake-3d.vercel.app`.
   - Or deploy from CLI inside the repository root:
     ```bash
     npx vercel --prod --name dodsnake
     ```
2. **Offline vs. Online Multiplayer on Vercel**:
   - **Local Hot-Seat Mode** and **Smart Bots (*Lawan Bot*)** run 100% client-side in the browser on Vercel without needing a backend server.
   - Because Vercel static hosting does not run stateful Socket.IO WebSockets, deploy `apps/server` to a Node host (a one-click `render.yaml` blueprint is included at the repository root) and configure:
     - Backend (`@doodle-dash/server`): `CORS_ORIGIN=https://dodsnake.vercel.app`
     - Frontend (Vercel Environment Variable): `VITE_SERVER_URL=https://<your-backend-host>`

## Getting Started

```bash
npm install
npm run generate:tiles   # optional: deterministically regenerate data/tiles.json
npm run dev              # start both backend server (:3001) and Vite client (:5173)
```

## Testing & Debug Tools

```bash
npm test                 # run Vitest suites (@doodle-dash/shared and @doodle-dash/server)
npm run sim              # run 1,000-match bot-vs-bot simulation for deadlock checks
npm run build            # compile shared, server, and client for production
```

- **Debug Panel**: Open the client with `?debug=1` (e.g. `http://localhost:5173/?debug=1`) in Local/Bot mode to force dice values, jump directly to any tile (`1–100`), trigger any challenge archetype immediately, and inspect FPS & draw call metrics.

## Playable Characters, Accessories & Passive Perks (*Bakat Unik*)

Customize any pawn inside the **Studio Karakter & Aksesoris** with a draggable live 3D turntable, pastel swatches, and 7 accessories (`none`, `crown`, `glasses`, `scarf`, `headset`, `flower`, `backpack`). Each character features custom sculpted meshes, matching SVG portraits, floating 3D nameplates, and a signature passive perk:

1. **Mochi** (*Mochi si Kucing* — *Kaki Gesit*): Gains **+1 ★** bonus every time Mochi climbs a ladder.
2. **Koko** (*Koko si Kodok* — *Lompatan Kodok*): Rolling a **1** automatically hops **+1** extra step forward.
3. **Wekwek** (*Wekwek si Bebek* — *Semangat Pesta*): Gains **+1 ★** bonus when winning a `duel` or `all_play` challenge.
4. **Boba** (*Boba si Panda* — *Santai Fokus*): Receives **+1.5s** extra timer duration on Boba's turn challenges.
5. **Roro** (*Roro si Dino* — *Diskon Kantin*): Buys items at **Kantin Bintang** for **3 ★** instead of the standard **4 ★**.
6. **Toady** (*Toady si Jamur* — *Aura Hoki*): Gains **+1 ★** luck bonus whenever dodging a snake or blocking a bite with a shield.

## Gameplay Rules

1. **Movement & Dice**: Roll `1d6` (or press **Space**). Rolling a `6` grants a bonus roll (up to `2` consecutive extra rolls). Landing on tile `100` requires an exact roll; excess steps bounce backward from `100`.
2. **Rule Presets**:
   - **Klasik Seru**: Balanced standard 100-tile ruleset.
   - **Mode Kilat**: Start with 1 item + 2 stars and faster forward challenge momentum.
   - **Pesta Item**: Start with 1 item and greatly increased item drop chances.
3. **Landing Resolution Order**:
   - Play one of **17 interactive mini-game archetypes** on tiles `2–99` (`tap_timing`, `quick_quiz`, `memory_doodle`, `spam_tap`, `swipe_dodge`, `shadow_match`, `quick_math`, `word_scramble`, `trace_line`, `lucky_wheel`, `stroop_color`, `quick_duel`, `gift_trap`, `bubble_pop`, `rhythm_clap`, `color_count`, `balance_bar`), excluding tile `1` (`start`).
   - Apply challenge rewards (stars `★`, `advance` / `shield` / `extra_dice`, comeback **Bonus Ngejar +1 ★** when trailing the leader by `>= 25` tiles) or penalties (`retreat` / `skip_turn`).
   - Resolve ladders or snakes on the landed tile:
     - **Ladder base**: Pawn climbs up to the ladder top.
     - **Snake head**: Snake slides pawn down to the tail, **EXCEPT** when the player wins the tile challenge (snake dodge!) or activates/holds **Perisai Anti-Ular** (Anti-Snake Shield).
   - **No infinite chains**: Destination tiles from ladders, snakes, or movement bonuses/penalties do not trigger another challenge or snake/ladder in the same turn.
4. **Items (Max 2 in Inventory)** & **Kantin Bintang** (`4 ★`, or `3 ★` for **Roro**):
   - **Perisai Anti-Ular** (`shield`): Blocks 1 snake bite automatically or when activated before rolling.
   - **Dadu Emas** (`golden_dice`): Roll 2 golden 3D dice and choose your preferred roll.
   - **Rem Mendadak** (`brake`): Caps the next dice roll to `1–3`.
   - **Kotak Kejutan** (`surprise`): Triggers one of 4 playful deterministic random effects before moving.
   - **Magnet Bintang** (`magnet_star`): Pulls 1 ★ from the current leader (or grants +1 ★ bonus).
   - **Sepatu Turbo** (`swap_turbo`): Adds `+2` extra steps to the next dice roll.
5. **Anti-Frustration Safeguards**:
   - Last-place players receive higher item drop odds upon winning challenges.
   - At most 2 consecutive turn penalties; a 3rd consecutive penalty is automatically forgiven (*Kartu Kasihan*).
6. **Victory**: The first player to land cleanly on tile `100` and clear the **Bos Doodle** finale wins! Total stars (`★`) break ties and determine podium rankings alongside superlative titles.

## Adding a New Challenge Archetype

1. Add the archetype identifier to the `ChallengeArchetype` union in `packages/shared/src/types.ts`.
2. Register the specification in `ARCHETYPE_REGISTRY` inside `packages/shared/src/content/archetypes.ts` (`displayName`, `instruction`, `baseDurationMs`, `allowedModes`, `buildParams`, `validate`, `simulateBot`), and include its ID in `PLAYABLE_TILE_ARCHETYPES`.
3. Add title templates in `ARCHETYPE_TITLE_TEMPLATES` inside `packages/shared/src/generator/generateTiles.ts` and run `npm run generate:tiles`.
4. Implement the interactive mini-game renderer inside `apps/client/src/challenges/`.

## Design Assumptions

- **Bos Doodle Failure (Tile 100)**: Failing Bos Doodle bounces the pawn back 3 spaces (to tile `97`) without Pity Card protection so players cannot camp permanently on tile `100`.
- **Advance Bonus Cap**: `advance` rewards on tiles `2–99` stop at tile `99` so entering tile `100` for Bos Doodle still requires an exact dice roll.
- **Local Hot-Seat `all_play`**: On a single shared device, `all_play` challenges run quickly for the active player alongside simulated bot scores to keep mobile one-hand play comfortable.
- **Color-Blind Accessibility in Stroop**: High-contrast color buttons also render distinct shape icons so every player can play fairly.
