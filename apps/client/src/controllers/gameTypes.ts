import type {
  ActiveChallenge,
  ChallengeArchetype,
  ChallengeSubmission,
  EmoteId,
  GameEvent,
  GameState,
  RoomStatePayload,
} from '@doodle-dash/shared';

export interface SessionCallbacks {
  onStateChange: (state: GameState | null) => void;
  onEvents: (events: GameEvent[], state: GameState) => Promise<void>;
  onChallengePrompt: (challenge: ActiveChallenge, localParticipantId: string) => void;
  onChallengeStamp: (success: boolean, summary: string) => void;
  onChallengeClose: () => void;
  onRoomState?: (room: RoomStatePayload) => void;
  onEmote: (playerId: string, emoteId: EmoteId) => void;
  onError: (msg: string) => void;
  onTurnBanner: (playerName: string, extraRoll?: boolean) => void;
  onExitToMenu: () => void;
}

export interface GameSessionController {
  readonly mode: 'online' | 'local' | 'bot';
  getState: () => GameState | null;
  getLocalPlayerId: () => string | null;
  isSpectator: () => boolean;
  rollDice: (forcedDice?: number) => void;
  selectDice: (choiceIndex: 0 | 1) => void;
  useItem: (itemIndex: number) => void;
  buyStarItem: () => void;
  chooseDuelOpponent: (opponentId: string) => void;
  submitChallenge: (submission: ChallengeSubmission) => void;
  sendEmote: (emoteId: EmoteId) => void;
  rematch: () => void;
  leave: () => void;
  debugJumpToTile?: (tileId: number) => void;
  debugTriggerArchetype?: (archetype: ChallengeArchetype) => void;
}
