import { describe, expect, it, vi } from 'vitest';
import {
  ARCHETYPE_REGISTRY,
  QUIZ_BANK,
  SeededRng,
  type ActiveChallenge,
  type GameEvent,
  type GameState,
  type RoomStatePayload,
} from '@doodle-dash/shared';
import {
  MqttPacketStreamParser,
  encodeMqttConnectPacket,
  encodeMqttPubackPacket,
  encodeMqttPublishPacket,
  encodeMqttSubscribePacket,
} from '../../client/src/controllers/realtimeTransport.js';
import { P2pRoomHost } from '../../client/src/controllers/p2pRoomHost.js';

describe('MQTT 3.1.1 WebSocket codec', () => {
  it('encodes CONNECT and SUBSCRIBE control packets with valid headers', () => {
    const conn = encodeMqttConnectPacket('ds_player1', 45);
    expect(conn[0]).toBe(0x10); // CONNECT
    expect(conn.slice(4, 8)).toEqual(new Uint8Array([0x4d, 0x51, 0x54, 0x54])); // "MQTT"
    expect(conn[8]).toBe(0x04); // Protocol level 4

    const sub = encodeMqttSubscribePacket(7, 'dodsnake/v1/room/ABCD');
    expect(sub[0]).toBe(0x82); // SUBSCRIBE with 0010 flags
    expect(sub[sub.length - 1]).toBe(0x00); // QoS 0
  });

  it('encodes PUBLISH and parses fragmented incoming MQTT chunks cleanly', () => {
    const payloadJson = JSON.stringify({ event: 'turn:roll', data: 6 });
    const bytes = new TextEncoder().encode(payloadJson);
    const pkt = encodeMqttPublishPacket('dodsnake/v1/room/WXYZ', bytes);

    const parser = new MqttPacketStreamParser();
    const splitAt = Math.floor(pkt.length / 2);
    const first = parser.push(pkt.slice(0, splitAt));
    expect(first).toHaveLength(0);

    const second = parser.push(pkt.slice(splitAt));
    expect(second).toHaveLength(1);
    expect(second[0].type).toBe(3);
    expect(second[0].topic).toBe('dodsnake/v1/room/WXYZ');
    expect(new TextDecoder().decode(second[0].payload)).toBe(payloadJson);

    const puback = encodeMqttPubackPacket(42);
    expect(puback).toEqual(new Uint8Array([0x40, 0x02, 0x00, 0x2a]));
  });
});

describe('Serverless P2pRoomHost realtime multiplayer roundtrip', () => {
  it('handles create, profanity guard, join, ready, roll onto ladder, challenge & rematch', async () => {
    vi.useFakeTimers();

    const guestInbox: Array<{ event: string; payload: unknown }> = [];
    const hostInbox: Array<{ event: string; payload: unknown }> = [];
    const allEvents: GameEvent[] = [];
    let latestState: GameState | null = null;
    let latestRoomState: RoomStatePayload | null = null;

    const host = new P2pRoomHost({
      roomCode: 'ABCD',
      hostPeerId: 'peer_host',
      hostCreate: {
        playerName: 'MochiHost',
        pawn: 'kucing',
        color: 'pink',
        accessory: 'crown',
      },
      delayScale: 0.01,
      emit: (event, payload, targetId) => {
        if (!targetId || targetId === '*' || targetId === 'peer_host') {
          hostInbox.push({ event, payload });
        }
        if (!targetId || targetId === '*' || targetId === 'peer_guest') {
          guestInbox.push({ event, payload });
        }
        if (event === 'room:state') {
          latestRoomState = payload as RoomStatePayload;
        }
        if (event === 'game:started') {
          latestState = (payload as { state: GameState }).state;
        }
        if (event === 'game:events') {
          const p = payload as { events: GameEvent[]; state?: GameState };
          allEvents.push(...p.events);
          if (p.state) latestState = p.state;
        }
      },
    });

    // Reject profane guest name
    host.handlePeerMessage('peer_bad', 'rpc:join', {
      roomCode: 'ABCD',
      playerName: 'anjing',
      pawn: 'kodok',
      color: 'mint',
    });
    expect(host.getRoomState().players).toHaveLength(1);

    // Reject wrong room code
    host.handlePeerMessage('peer_guest', 'rpc:join', {
      roomCode: 'ZZZZ',
      playerName: 'KokoGuest',
      pawn: 'kodok',
      color: 'mint',
    });
    expect(guestInbox.some((m) => m.event === 'error')).toBe(true);
    guestInbox.length = 0;

    // Guest joins valid room ABCD
    host.handlePeerMessage('peer_guest', 'rpc:join', {
      roomCode: 'ABCD',
      playerName: 'KokoGuest',
      pawn: 'kodok',
      color: 'mint',
      accessory: 'scarf',
    });

    const joinMsg = guestInbox.find((m) => m.event === 'room:joined');
    expect(joinMsg).toBeDefined();
    expect(host.getRoomState().players).toHaveLength(2);
    expect(latestRoomState?.players[1].ready).toBe(false);

    // Host cannot start before guest readies up
    host.handlePeerMessage('peer_host', 'game:start', {});
    expect(hostInbox.some((m) => m.event === 'error')).toBe(true);

    // Guest toggles ready and updates preset by host
    host.handlePeerMessage('peer_guest', 'player:ready', { ready: true });
    expect(host.getRoomState().players[1].ready).toBe(true);
    host.handlePeerMessage('peer_host', 'room:settings', { rulePreset: 'pesta_item' });
    expect(host.getRoomState().rulePreset).toBe('pesta_item');

    // Start game
    host.handlePeerMessage('peer_host', 'game:start', {});
    expect(latestState).not.toBeNull();
    expect(latestState!.players).toHaveLength(2);
    expect(latestState!.turnOrder[0]).toBe(host.hostPlayerId);

    // Host rolls 3 -> lands on tile 4 (Ladder 4 -> 25)
    host.handlePeerMessage('peer_host', 'turn:roll', { forcedDice: 3 });
    expect(allEvents.some((e) => e.type === 'PawnMoved' && e.to === 4)).toBe(true);

    // Advance timer to resolve tile challenge
    await vi.advanceTimersByTimeAsync(100);
    const ch = latestState!.activeChallenge;
    expect(ch).not.toBeNull();
    expect(ch!.tileId).toBe(4);

    // Submit deterministic winning outcome for whichever randomized archetype was drawn on Tile 4
    const makePassInput = (c: ActiveChallenge): Record<string, unknown> => {
      const sim = ARCHETYPE_REGISTRY[c.archetype].simulateBot(c.params, 'juara', new SeededRng(c.seed + 3));
      const base: Record<string, unknown> = { ...sim, startedAt: Date.now() - 2500, completedAt: Date.now() };
      if (c.archetype === 'tap_timing') {
        base.needlePos = Number(c.params.zoneCenter);
        base.reactionMs = 450;
      } else if (c.archetype === 'quick_quiz') {
        const q = QUIZ_BANK.find((x) => x.id === Number(c.params.questionId))!;
        base.answerIndex = q.correctIndex;
        base.reactionMs = 500;
      } else if (
        c.archetype === 'shadow_match' ||
        c.archetype === 'quick_math' ||
        c.archetype === 'stroop_color' ||
        c.archetype === 'color_count' ||
        c.archetype === 'odd_one_out' ||
        c.archetype === 'pattern_next' ||
        c.archetype === 'math_compare'
      ) {
        base.answerIndex = Number(c.params.correctIndex);
        base.reactionMs = 450;
      } else if (c.archetype === 'pair_flip') {
        const pc = Number(c.params.pairCount ?? 3);
        base.sequenceIndices = Array.from({ length: pc * 2 }, (_, i) => i);
        base.extra = { pairsMatched: pc };
        base.reactionMs = 2400;
      } else if (c.archetype === 'number_order') {
        base.sequenceIndices = [...((c.params.expectedIndices as number[]) ?? [0, 1, 2, 3, 4])];
        base.reactionMs = 1500;
      } else if (c.archetype === 'bubble_pop') {
        const tp = Number(c.params.targetPops ?? 5);
        base.tapTimestamps = Array.from({ length: tp }, (_, i) => 400 + i * 240);
        base.hitsTaken = 0;
        base.extra = { goodPopped: tp };
      } else if (c.archetype === 'rhythm_clap') {
        base.tapTimestamps = [...((c.params.beatTargetsMs as number[]) ?? [1050, 1900, 2750, 3600])];
        base.reactionMs = 950;
      } else if (c.archetype === 'balance_bar') {
        base.tapTimestamps = [450, 1100, 1900, 2700];
        base.hitsTaken = 0;
        base.extra = { balanceRatio: 0.88 };
      } else if (c.archetype === 'memory_doodle') {
        base.sequenceIndices = [...(c.params.sequence as number[])];
        base.reactionMs = 1500;
      } else if (c.archetype === 'spam_tap') {
        const t = Number(c.params.targetTaps);
        base.tapTimestamps = Array.from({ length: t + 2 }, (_, i) => 100 + i * 110);
      } else if (c.archetype === 'swipe_dodge') {
        base.hitsTaken = 0;
      } else if (c.archetype === 'word_scramble') {
        base.answerText = String(c.params.word);
        base.reactionMs = 700;
      } else if (c.archetype === 'trace_line') {
        base.pathAccuracy = 0.95;
        base.extra = { pointsCount: 20 };
        base.reactionMs = 900;
      } else if (c.archetype === 'quick_duel') {
        base.reactionMs = 180;
      } else if (c.archetype === 'target_sum') {
        base.sequenceIndices = [...((c.params.validPair as number[]) ?? [0, 1])];
        base.reactionMs = 700;
      } else if (c.archetype === 'arrow_blitz') {
        base.sequenceIndices = [...((c.params.sequence as number[]) ?? [0, 1, 2, 3])];
        base.reactionMs = 750;
      }
      return base;
    };

    expect(ch!.mode).toBe('solo');
    expect(ch!.participantIds).toEqual([host.hostPlayerId]);
    // Non-owner peer submission on a solo ladder challenge must be ignored cleanly
    host.handlePeerMessage('peer_guest', 'challenge:submit', {
      tileId: ch!.tileId,
      claimedSuccess: true,
      score: 100,
      inputLog: makePassInput(ch!),
    });
    expect(latestState!.phase).toBe('CHALLENGE');

    for (const pid of ch!.participantIds) {
      const peer = pid === host.hostPlayerId ? 'peer_host' : 'peer_guest';
      host.handlePeerMessage(peer, 'challenge:submit', {
        tileId: ch!.tileId,
        claimedSuccess: true,
        score: 100,
        inputLog: makePassInput(ch!),
      });
    }

    // Challenge resolution automatically climbs ladder 4 -> 25 & awards Kucing +1 star
    const climbed = allEvents.find((e) => e.type === 'LadderClimbed') as
      | Extract<GameEvent, { type: 'LadderClimbed' }>
      | undefined;
    expect(climbed).toBeDefined();
    expect(climbed!.from).toBe(4);
    expect(climbed!.to).toBe(25);
    expect(latestState!.players.find((p) => p.id === host.hostPlayerId)!.position).toBe(25);

    // Rematch resets back to tile 1 cleanly even if guest ready flag was toggled
    host.handlePeerMessage('peer_guest', 'player:ready', { ready: false });
    host.handlePeerMessage('peer_host', 'room:rematch', {});
    expect(latestState!.players.every((p) => p.position === 1)).toBe(true);

    // Peer leave during CHALLENGE phase reschedules challenge resolution without deadlocking
    host.handlePeerMessage('peer_host', 'turn:roll', { forcedDice: 3 });
    await vi.advanceTimersByTimeAsync(100);
    expect(latestState!.phase).toBe('CHALLENGE');
    host.handlePeerMessage('peer_guest', 'room:leave', {});
    expect(latestState!.phase).toBe('CHALLENGE');
    const chRematch = latestState!.activeChallenge!;
    host.handlePeerMessage('peer_host', 'challenge:submit', {
      tileId: chRematch.tileId,
      claimedSuccess: true,
      score: 100,
      inputLog: makePassInput(chRematch),
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(latestState!.phase).toBe('TURN_BEGIN');

    host.dispose();
    expect(guestInbox.some((m) => m.event === 'room:closed')).toBe(true);
    vi.useRealTimers();
  });
});
