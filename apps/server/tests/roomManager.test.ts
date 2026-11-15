import { describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../src/roomManager.js';

function createTestHarness(opts?: {
  reconnectGraceMs?: number;
  turnTimeoutMs?: number;
  botDelayMs?: number;
  allowDebugDice?: boolean;
  maxRooms?: number;
  maxSpectatorsPerRoom?: number;
}) {
  const roomEmits: Array<{ roomCode: string; event: string; payload: unknown }> = [];
  const socketEmits: Array<{ socketId: string; event: string; payload: unknown }> = [];

  const mgr = new RoomManager(
    {
      emitToRoom: (roomCode, event, payload) => roomEmits.push({ roomCode, event, payload }),
      emitToSocket: (socketId, event, payload) => socketEmits.push({ socketId, event, payload }),
    },
    opts,
  );
  return { mgr, roomEmits, socketEmits };
}

describe('RoomManager multiplayer logic', () => {
  it('creates 4-letter room, joins players, transfers host when host leaves lobby', () => {
    const { mgr } = createTestHarness();
    const c = mgr.createRoom('s1', { playerName: 'Budi', pawn: 'kucing', color: 'pink' });
    expect(c.roomCode).toHaveLength(4);

    const j = mgr.joinRoom('s2', {
      roomCode: c.roomCode,
      playerName: 'Sari',
      pawn: 'kodok',
      color: 'mint',
    });
    expect(j.playerId).toBeTruthy();

    const roomBefore = mgr.getRoom(c.roomCode)!;
    expect(roomBefore.hostId).toBe(c.playerId);

    mgr.handleDisconnect('s1', true);
    const roomAfter = mgr.getRoom(c.roomCode)!;
    expect(roomAfter.hostId).toBe(j.playerId);
    expect(roomAfter.players).toHaveLength(1);
  });

  it('supports reconnect within grace window and bot takeover after timeout', async () => {
    vi.useFakeTimers();
    const { mgr, socketEmits } = createTestHarness({ reconnectGraceMs: 5000, botDelayMs: 50 });

    const c = mgr.createRoom('s1', { playerName: 'Host', pawn: 'kucing', color: 'pink' });
    const j = mgr.joinRoom('s2', {
      roomCode: c.roomCode,
      playerName: 'Teman',
      pawn: 'bebek',
      color: 'kuning',
    });
    mgr.setPlayerReady('s2', true);
    mgr.startRoomGame('s1', 12345);

    // Disconnect s2 and reconnect within 5s
    mgr.handleDisconnect('s2', false);
    vi.advanceTimersByTime(2000);
    const reconn = mgr.joinRoom('s2_new', {
      roomCode: c.roomCode,
      playerName: 'Teman',
      pawn: 'bebek',
      color: 'kuning',
      reconnectToken: j.reconnectToken,
    });
    expect(reconn.reconnected).toBe(true);
    expect(socketEmits.some((e) => e.socketId === 's2_new' && e.event === 'game:snapshot')).toBe(
      true,
    );

    // Now disconnect s2_new and let grace expire -> bot takes over!
    mgr.handleDisconnect('s2_new', false);
    vi.advanceTimersByTime(5100);
    const room = mgr.getRoom(c.roomCode)!;
    const slot = room.players.find((p) => p.id === j.playerId)!;
    expect(slot.isBot).toBe(true);

    vi.useRealTimers();
  });

  it('rejects rolls from non-active players and validates server-authoritative turns', () => {
    const { mgr } = createTestHarness();
    const c = mgr.createRoom('s1', { playerName: 'A', pawn: 'kucing', color: 'pink' });
    mgr.joinRoom('s2', {
      roomCode: c.roomCode,
      playerName: 'B',
      pawn: 'panda',
      color: 'biru',
    });
    mgr.setPlayerReady('s2', true);
    mgr.startRoomGame('s1', 999);

    // Player B tries rolling on Player A's turn -> throws!
    expect(() => mgr.roll('s2')).toThrow();
    // Player A rolls -> advances to CHALLENGE or next state
    mgr.roll('s1');
    const room = mgr.getRoom(c.roomCode)!;
    expect(room.state?.players[0].position).toBeGreaterThan(1);
  });

  it('allows host to change rulePreset, add/remove bots, and rejects non-host actions', () => {
    const { mgr } = createTestHarness();
    const c = mgr.createRoom('s1', { playerName: 'Host', pawn: 'kucing', color: 'pink' });
    mgr.joinRoom('s2', {
      roomCode: c.roomCode,
      playerName: 'Guest',
      pawn: 'kodok',
      color: 'mint',
    });

    // Non-host cannot change preset or remove bots
    expect(() => mgr.setRoomSettings('s2', 'kilat')).toThrow();

    mgr.setRoomSettings('s1', 'pesta_item');
    mgr.addBot('s1', 'juara');
    let room = mgr.getRoom(c.roomCode)!;
    expect(room.rulePreset).toBe('pesta_item');
    const bot = room.players.find((p) => p.isBot)!;
    expect(bot).toBeDefined();

    mgr.removeBot('s1', bot.id);
    room = mgr.getRoom(c.roomCode)!;
    expect(room.players.some((p) => p.id === bot.id)).toBe(false);

    mgr.setPlayerReady('s2', true);
    mgr.startRoomGame('s1', 4242);
    expect(room.state?.rulePreset).toBe('pesta_item');
    expect(room.state?.players[0].items.length).toBe(1);
  });

  it('stores and updates player accessories through room customization and game start', () => {
    const { mgr } = createTestHarness();
    const c = mgr.createRoom('s1', {
      playerName: 'Mochi',
      pawn: 'kucing',
      color: 'pink',
      accessory: 'glasses',
    });
    mgr.joinRoom('s2', {
      roomCode: c.roomCode,
      playerName: 'Koko',
      pawn: 'kodok',
      color: 'mint',
    });

    mgr.customizePlayer('s2', { accessory: 'headset' });
    mgr.addBot('s1', 'pintar');

    const room = mgr.getRoom(c.roomCode)!;
    expect(room.players[0].accessory).toBe('glasses');
    expect(room.players[1].accessory).toBe('headset');
    expect(room.players[2].accessory).not.toBe('none');

    mgr.setPlayerReady('s2', true);
    mgr.startRoomGame('s1', 7331);
    expect(room.state?.players.map((p) => p.accessory)).toEqual([
      'glasses',
      'headset',
      room.players[2].accessory,
    ]);
  });

  it('rejects profane, NSFW, SARA, or insulting player names in create/join/customize', () => {
    const { mgr } = createTestHarness();
    expect(() =>
      mgr.createRoom('s1', { playerName: 'anJ1nG', pawn: 'kucing', color: 'pink' }),
    ).toThrow();

    const ok = mgr.createRoom('s1', { playerName: 'Chenn', pawn: 'kucing', color: 'pink' });
    expect(() =>
      mgr.joinRoom('s2', {
        roomCode: ok.roomCode,
        playerName: 'p0rnstar',
        pawn: 'kodok',
        color: 'mint',
      }),
    ).toThrow();
    expect(() => mgr.customizePlayer('s1', { playerName: 'k.a.f.i.r' })).toThrow();
    expect(() => mgr.customizePlayer('s1', { playerName: 'tolol123' })).toThrow();
    mgr.customizePlayer('s1', { playerName: 'Nasution' });
    expect(mgr.getRoom(ok.roomCode)?.players[0].name).toBe('Nasution');
  });

  it('keeps consecutive player turns rollable and emits game:sync on syncToSocket', () => {
    const { mgr, socketEmits } = createTestHarness({ turnTimeoutMs: 5000, botDelayMs: 50 });
    const c = mgr.createRoom('s1', { playerName: 'Ali', pawn: 'kucing', color: 'pink' });
    mgr.joinRoom('s2', {
      roomCode: c.roomCode,
      playerName: 'Bima',
      pawn: 'kodok',
      color: 'mint',
    });
    mgr.setPlayerReady('s2', true);
    mgr.startRoomGame('s1', 2026);

    // Player 1 rolls; resolve any challenge or bonus, then Player 2 must be rollable in TURN_BEGIN
    mgr.roll('s1', 1);
    const room = mgr.getRoom(c.roomCode)!;
    if (room.state?.phase === 'CHALLENGE' && room.state.activeChallenge) {
      const ch = room.state.activeChallenge;
      for (const pid of ch.participantIds) {
        const sock = pid === room.players[0].id ? 's1' : 's2';
        mgr.submitChallenge(sock, {
          tileId: ch.tileId,
          claimedSuccess: true,
          score: 100,
          inputLog: { kind: ch.archetype, reactionMs: 400 },
        });
      }
    }

    // After resolving turn, whichever turn becomes TURN_BEGIN can be synced and rolled immediately
    mgr.syncToSocket('s2');
    expect(socketEmits.some((e) => e.socketId === 's2' && e.event === 'game:sync')).toBe(true);
    const activeId = room.state!.turnOrder[room.state!.currentTurnIndex];
    const activeSocket = activeId === room.players[0].id ? 's1' : 's2';
    expect(room.state?.phase).toBe('TURN_BEGIN');
    expect(() => mgr.roll(activeSocket, 2)).not.toThrow();
  });

  it('rejects challenge submissions from non-owner opponents on solo challenges', () => {
    const { mgr } = createTestHarness({ turnTimeoutMs: 5000, botDelayMs: 50 });
    const c = mgr.createRoom('s1', { playerName: 'Ali', pawn: 'kucing', color: 'pink' });
    mgr.joinRoom('s2', {
      roomCode: c.roomCode,
      playerName: 'Bima',
      pawn: 'kodok',
      color: 'mint',
    });
    mgr.setPlayerReady('s2', true);
    mgr.startRoomGame('s1', 4242);

    mgr.roll('s1', 3); // tile 4 (Ladder) -> strictly solo for p1
    const room = mgr.getRoom(c.roomCode)!;
    const ch = room.state!.activeChallenge!;
    expect(ch.mode).toBe('solo');
    expect(ch.ownerPlayerId).toBe(room.players[0].id);
    expect(ch.participantIds).toEqual([room.players[0].id]);

    expect(() =>
      mgr.submitChallenge('s2', {
        tileId: ch.tileId,
        claimedSuccess: true,
        score: 95,
        inputLog: { startedAt: 0, completedAt: 700, reactionMs: 700 },
      }),
    ).toThrow();
  });

  it('auto-resolves active CHALLENGE without deadlocking when active player leaves mid-challenge', () => {
    vi.useFakeTimers();
    const { mgr, roomEmits } = createTestHarness({ reconnectGraceMs: 1000, turnTimeoutMs: 5000, botDelayMs: 50 });
    const c = mgr.createRoom('s1', { playerName: 'Ali', pawn: 'kucing', color: 'pink' });
    mgr.joinRoom('s2', {
      roomCode: c.roomCode,
      playerName: 'Bima',
      pawn: 'kodok',
      color: 'mint',
    });
    mgr.setPlayerReady('s2', true);
    mgr.startRoomGame('s1', 4242);

    // s1 rolls onto tile 4 (CHALLENGE phase)
    mgr.roll('s1', 3);
    const room = mgr.getRoom(c.roomCode)!;
    expect(room.state?.phase).toBe('CHALLENGE');

    // s1 intentionally leaves mid-challenge -> promoted to bot -> challenge timer must reschedule and resolve!
    mgr.handleDisconnect('s1', true);
    vi.advanceTimersByTime(700);
    expect(room.state?.phase).toBe('TURN_BEGIN');
    expect(room.state?.activeChallenge).toBeNull();

    // Emote broadcast emits both emote:broadcast and emote:received
    mgr.sendEmote('s2', 'jempol');
    expect(roomEmits.some((e) => e.event === 'emote:broadcast')).toBe(true);
    expect(roomEmits.some((e) => e.event === 'emote:received')).toBe(true);

    // Creating a new room with an already-joined socket cleans up its previous room membership
    const c2 = mgr.createRoom('s2', { playerName: 'Bima', pawn: 'kodok', color: 'mint' });
    expect(c2.roomCode).not.toBe(c.roomCode);
    expect(mgr.getRoom(c.roomCode)).toBeUndefined();

    vi.useRealTimers();
  });

  it('enforces allowDebugDice=false, maxSpectatorsPerRoom, maxRooms eviction, and socket rate limits', () => {
    const { mgr } = createTestHarness({
      allowDebugDice: false,
      maxRooms: 2,
      maxSpectatorsPerRoom: 2,
    });

    // 1. Create 2 rooms (reaching maxRooms=2), then attempt a 3rd room while both are active -> throws
    const r1 = mgr.createRoom('h1', { playerName: 'HostSatu', pawn: 'kucing', color: 'pink' });
    const r2 = mgr.createRoom('h2', { playerName: 'HostDua', pawn: 'kodok', color: 'mint' });
    expect(() =>
      mgr.createRoom('h3', { playerName: 'HostTiga', pawn: 'bebek', color: 'kuning' }),
    ).toThrow(/penuh/i);

    // Disconnect h2 in-game so r2 has no connected humans -> creating r3 evicts stale r2!
    mgr.addBot('h2', 'pintar');
    mgr.startRoomGame('h2', 111);
    mgr.handleDisconnect('h2', false);
    const r3 = mgr.createRoom('h3', { playerName: 'HostTiga', pawn: 'bebek', color: 'kuning' });
    expect(r3.roomCode).toHaveLength(4);
    expect(mgr.getRoom(r2.roomCode)).toBeUndefined();

    // 2. Spectator cap enforcement (maxSpectatorsPerRoom = 2)
    mgr.joinRoom('p2', {
      roomCode: r1.roomCode,
      playerName: 'Tamu',
      pawn: 'panda',
      color: 'biru',
    });
    mgr.setPlayerReady('p2', true);
    mgr.startRoomGame('h1', 123456); // Seed 123456 rolls a non-6 on turn 1

    mgr.joinRoom('spec1', {
      roomCode: r1.roomCode,
      playerName: 'Penonton1',
      pawn: 'dino',
      color: 'oranye',
      asSpectator: true,
    });
    mgr.joinRoom('spec2', {
      roomCode: r1.roomCode,
      playerName: 'Penonton2',
      pawn: 'jamur',
      color: 'ungu',
      asSpectator: true,
    });
    expect(() =>
      mgr.joinRoom('spec3', {
        roomCode: r1.roomCode,
        playerName: 'Penonton3',
        pawn: 'kucing',
        color: 'pink',
        asSpectator: true,
      }),
    ).toThrow(/penuh/i);

    // 3. Invalid reconnectToken of different length does not throw timingSafeEqual buffer error, falls back to spectator in-game
    mgr.handleDisconnect('spec2', true);
    const badTokenJoin = mgr.joinRoom('spec2', {
      roomCode: r1.roomCode,
      playerName: 'Penonton2',
      pawn: 'jamur',
      color: 'ungu',
      reconnectToken: 'short_invalid_token',
    });
    expect(badTokenJoin.asSpectator).toBe(true);

    // 4. allowDebugDice=false ignores forcedDice: compare with a reference room with same seed and no forcedDice
    const { mgr: refMgr } = createTestHarness({ allowDebugDice: false });
    const refRoom = refMgr.createRoom('rh1', { playerName: 'HostSatu', pawn: 'kucing', color: 'pink' });
    refMgr.joinRoom('rp2', {
      roomCode: refRoom.roomCode,
      playerName: 'Tamu',
      pawn: 'panda',
      color: 'biru',
    });
    refMgr.setPlayerReady('rp2', true);
    refMgr.startRoomGame('rh1', 123456);

    mgr.roll('h1', 6); // Client attempts to force a 6
    refMgr.roll('rh1'); // Server rolls naturally without forcedDice
    expect(mgr.getRoom(r1.roomCode)!.state!.players[0].position).toBe(
      refMgr.getRoom(refRoom.roomCode)!.state!.players[0].position,
    );

    // 5. Rate limiter blocks after maxPerSec calls within 1s window
    for (let i = 0; i < 5; i++) {
      expect(mgr.checkRateLimit('flood_sock', 5)).toBe(true);
    }
    expect(mgr.checkRateLimit('flood_sock', 5)).toBe(false);
  });
});
