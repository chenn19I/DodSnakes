// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {
    FHE,
    ebool,
    euint8,
    euint32,
    euint64,
    externalEuint8,
    externalEuint64
} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DodSnakeArena
 * @notice Onchain FHEVM Confidential Snakes & Ladders engine for DodSnake.
 *
 *         Confidential mechanics impossible on a transparent blockchain:
 *         1. Secret Board Traps (euint8 tile & kind): planted encrypted onchain; non-matching
 *            tiles are evaluated homomorphically and never revealed unless stepped on.
 *         2. Confidential Tactical Bag (euint8 shields & trap charges): encrypted inventory
 *            decryptable only by its owner via FHE.allow / EIP-712 permit.
 *         3. Verifiable FHE Onchain Dice (FHE.randEuint32 + FHE.makePubliclyDecryptable + FHE.checkSignatures):
 *            unpredictable until KMS proof verification with replay protection.
 *         4. Encrypted Blind 1v1 Duel (Rock / Paper / Scissors): moves stay encrypted during commit
 *            and evaluation; only the outcome (0 tie, 1 challenger, 2 opponent) is decrypted.
 *         5. Encrypted Secret Match Mission (euint8): assigned randomly at match start, readable
 *            only by the player, verified homomorphically when claimed.
 *         6. Confidential ERC-7984 Match Pot (cDOD or Sepolia cUSDT): wager sizes & payouts stay encrypted.
 */
contract DodSnakeArena is ZamaEthereumConfig, ReentrancyGuard {
    uint8 public constant MAX_PLAYERS = 4;
    uint8 public constant MAX_TRAPS_PER_MATCH = 8;
    uint8 public constant MAX_TRAPS_PER_PLAYER = 3;
    uint8 public constant BOARD_CLASSIC_SIZE = 100;
    uint8 public constant BOARD_SPRINT_SIZE = 30;
    uint8 public constant TRAP_MUD_SLIDE = 1;
    uint8 public constant TRAP_INK_SNARE = 2;
    uint8 public constant TRAP_SNAKE_AMBUSH = 3;
    uint8 public constant TRAP_GOLDEN_WARP = 4;

    /// @notice Official Sepolia cUSDT wrapper address for optional confidential wagers.
    address public constant SEPOLIA_CUSDT = 0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50;

    IERC7984 public immutable chipToken;

    enum MatchStatus {
        Lobby,
        Active,
        Finished
    }

    enum PendingAction {
        None,
        WaitingDiceReveal,
        WaitingTrapReveal,
        WaitingBlindDuelReveal,
        WaitingMissionReveal
    }

    struct PlayerState {
        address addr;
        uint8 position;
        uint16 stars;
        uint8 laddersClimbed;
        uint8 snakesDodged;
        uint8 duelWins;
        uint8 trapsPlanted;
        euint8 encryptedMission;
        euint8 encryptedShields;
        euint8 encryptedTrapCharges;
        euint64 encryptedStake;
        ebool encryptedBrake;
        bool missionClaimed;
    }

    struct SecretTrap {
        address owner;
        euint8 encryptedTile;
        euint8 encryptedKind;
    }

    struct BlindDuel {
        bool active;
        address challenger;
        address opponent;
        bool challengerCommitted;
        bool opponentCommitted;
        euint8 challengerChoice;
        euint8 opponentChoice;
        bytes32 pendingResultHandle;
    }

    struct MatchData {
        uint256 id;
        address host;
        address stakeToken;
        uint8 boardSize;
        uint8 maxPlayers;
        uint8 playerCount;
        uint8 turnIndex;
        uint16 turnNumber;
        MatchStatus status;
        PendingAction pendingAction;
        bytes32 pendingRollHandle;
        bytes32 pendingTrapHandle;
        bytes32 pendingShieldHandle;
        bytes32 pendingMissionHandle;
        uint8 pendingLandingPos;
        address pendingMover;
        address winner;
        bool payoutClaimed;
        euint64 encryptedPot;
        BlindDuel duel;
        uint8 trapCount;
        address[4] playerOrder;
    }

    uint256 public nextMatchId = 1;

    // Classic 100-tile & Sprint 30-tile board links matching data/board.json
    mapping(uint8 tileId => uint8 destTile) public classicLadders;
    mapping(uint8 tileId => uint8 destTile) public classicSnakes;
    mapping(uint8 tileId => uint8 destTile) public sprintLadders;
    mapping(uint8 tileId => uint8 destTile) public sprintSnakes;

    mapping(uint256 matchId => MatchData) private _matches;
    mapping(uint256 matchId => mapping(address => uint8)) private _playerIndexPlusOne;
    mapping(uint256 matchId => mapping(address => PlayerState)) private _players;
    mapping(uint256 matchId => mapping(uint8 => SecretTrap)) private _traps;
    mapping(uint256 matchId => mapping(bytes32 => bool)) private _consumedHandles;

    event MatchCreated(
        uint256 indexed matchId,
        address indexed host,
        uint8 boardSize,
        uint8 maxPlayers,
        address stakeToken
    );
    event PlayerJoined(uint256 indexed matchId, address indexed player, uint8 seatIndex);
    event MatchStarted(uint256 indexed matchId, uint8 playerCount);
    event SecretTrapPlanted(uint256 indexed matchId, address indexed planter, uint8 trapIndex);
    event MysteryItemBought(uint256 indexed matchId, address indexed buyer, uint16 starsLeft);
    event SecretBrakeCast(uint256 indexed matchId, address indexed caster, uint16 starsLeft);
    event DiceRollRequested(uint256 indexed matchId, address indexed player, bytes32 rollHandle);
    event DiceMoved(
        uint256 indexed matchId,
        address indexed player,
        uint8 dieValue,
        uint8 fromPos,
        uint8 toPos
    );
    event ConfidentialTileCheckRequested(
        uint256 indexed matchId,
        address indexed player,
        uint8 tileId,
        bytes32 trapHandle,
        bytes32 shieldHandle
    );
    event TileResolved(
        uint256 indexed matchId,
        address indexed player,
        uint8 finalPos,
        uint8 trapKindTriggered,
        bool shieldBlockedSnake,
        uint8 ladderTo,
        uint8 snakeTo
    );
    event BlindDuelStarted(
        uint256 indexed matchId,
        address indexed challenger,
        address indexed opponent
    );
    event BlindDuelCommitted(uint256 indexed matchId, address indexed player);
    event BlindDuelReadyForReveal(uint256 indexed matchId, bytes32 resultHandle);
    event BlindDuelResolved(uint256 indexed matchId, uint8 outcome, address winner);
    event SecretMissionCheckRequested(uint256 indexed matchId, address indexed player, bytes32 resultHandle);
    event SecretMissionClaimed(uint256 indexed matchId, address indexed player, bool completed);
    event MatchWon(uint256 indexed matchId, address indexed winner, uint16 turnNumber);
    event PotClaimed(uint256 indexed matchId, address indexed winner, address stakeToken);

    error MatchNotFound();
    error InvalidMatchConfig();
    error UnsupportedStakeToken();
    error MatchNotInLobby();
    error MatchNotActive();
    error MatchFull();
    error AlreadyJoined();
    error NotHost();
    error NotEnoughPlayers();
    error NotYourTurn();
    error PendingActionExists();
    error InvalidPendingAction();
    error ProofAlreadyConsumed();
    error InvalidCleartextValue();
    error TrapLimitReached();
    error NotEnoughStars();
    error NotInMatch();
    error InvalidDuelOpponent();
    error DuelAlreadyActive();
    error AlreadyCommitted();
    error MissionAlreadyClaimed();
    error MatchNotFinished();
    error PayoutAlreadyClaimed();

    constructor(address chipTokenAddress) {
        require(chipTokenAddress != address(0), "Invalid chip token");
        chipToken = IERC7984(chipTokenAddress);

        // Classic 100-tile layout from data/board.json
        classicLadders[4] = 25;
        classicLadders[9] = 31;
        classicLadders[20] = 42;
        classicLadders[28] = 56;
        classicLadders[40] = 59;
        classicLadders[51] = 67;
        classicLadders[63] = 81;
        classicLadders[71] = 91;

        classicSnakes[17] = 7;
        classicSnakes[34] = 13;
        classicSnakes[47] = 26;
        classicSnakes[54] = 36;
        classicSnakes[62] = 19;
        classicSnakes[87] = 57;
        classicSnakes[93] = 73;
        classicSnakes[98] = 79;

        // Sprint 30-tile fast Sepolia layout
        sprintLadders[3] = 11;
        sprintLadders[8] = 19;
        sprintLadders[15] = 24;

        sprintSnakes[14] = 5;
        sprintSnakes[21] = 10;
        sprintSnakes[27] = 18;
    }

    /**
     * @notice Creates a new confidential DodSnake match.
     * @param boardMode 0 = Classic (100 tiles), 1 = Sprint (30 tiles, fast Sepolia demo).
     * @param maxPlayers 1 = Solo vs FHE House Traps, 2..4 = Multiplayer.
     * @param stakeToken address(0) for free-play, or cDOD / Sepolia cUSDT ERC-7984 token.
     */
    function createMatch(
        uint8 boardMode,
        uint8 maxPlayers,
        address stakeToken,
        externalEuint64 encStake,
        bytes calldata stakeProof
    ) external returns (uint256 matchId) {
        if (boardMode > 1 || maxPlayers < 1 || maxPlayers > MAX_PLAYERS) {
            revert InvalidMatchConfig();
        }
        _validateStakeToken(stakeToken);

        matchId = nextMatchId++;
        MatchData storage m = _matches[matchId];
        m.id = matchId;
        m.host = msg.sender;
        m.stakeToken = stakeToken;
        m.boardSize = boardMode == 1 ? BOARD_SPRINT_SIZE : BOARD_CLASSIC_SIZE;
        m.maxPlayers = maxPlayers;
        m.status = MatchStatus.Lobby;
        m.turnNumber = 1;

        euint64 zeroPot = FHE.asEuint64(0);
        FHE.allowThis(zeroPot);
        m.encryptedPot = zeroPot;

        euint64 stakeTransferred = _collectStake(m, stakeToken, encStake, stakeProof);
        _seatPlayer(m, msg.sender, stakeTransferred);

        emit MatchCreated(matchId, msg.sender, m.boardSize, maxPlayers, stakeToken);
        emit PlayerJoined(matchId, msg.sender, 0);

        if (maxPlayers == 1) {
            _activateMatchWithHouseTraps(m);
        }
    }

    /**
     * @notice Joins an open lobby match with an optional confidential ERC-7984 stake.
     */
    function joinMatch(
        uint256 matchId,
        externalEuint64 encStake,
        bytes calldata stakeProof
    ) external {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Lobby) revert MatchNotInLobby();
        if (_playerIndexPlusOne[matchId][msg.sender] != 0) revert AlreadyJoined();
        if (m.playerCount >= m.maxPlayers) revert MatchFull();

        euint64 stakeTransferred = _collectStake(m, m.stakeToken, encStake, stakeProof);
        uint8 seat = m.playerCount;
        _seatPlayer(m, msg.sender, stakeTransferred);

        emit PlayerJoined(matchId, msg.sender, seat);

        if (m.playerCount == m.maxPlayers) {
            _activateMatch(m);
        }
    }

    /**
     * @notice Host starts a lobby match early once at least 2 players have joined.
     */
    function startMatch(uint256 matchId) external {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Lobby) revert MatchNotInLobby();
        if (msg.sender != m.host) revert NotHost();
        if (m.playerCount < 2) revert NotEnoughPlayers();
        _activateMatch(m);
    }

    /**
     * @notice Plants an encrypted Secret Trap on a hidden tile (2 .. boardSize-1).
     *         Rivals cannot see the tile number or trap effect onchain.
     */
    function plantSecretTrap(
        uint256 matchId,
        externalEuint8 encTile,
        externalEuint8 encKind,
        bytes calldata inputProof
    ) external {
        MatchData storage m = _matches[matchId];
        _requireTurnReady(m, msg.sender);

        PlayerState storage p = _players[matchId][msg.sender];
        if (p.trapsPlanted >= MAX_TRAPS_PER_PLAYER || m.trapCount >= MAX_TRAPS_PER_MATCH) {
            revert TrapLimitReached();
        }

        euint8 rawTile = FHE.fromExternal(encTile, inputProof);
        euint8 rawKind = FHE.fromExternal(encKind, inputProof);

        // Homomorphically clamp tile into [2, boardSize - 1] & kind into [1, 3]
        euint8 clampedTile = FHE.max(
            FHE.asEuint8(2),
            FHE.min(FHE.asEuint8(m.boardSize - 1), rawTile)
        );
        euint8 clampedKind = FHE.max(
            FHE.asEuint8(TRAP_MUD_SLIDE),
            FHE.min(FHE.asEuint8(TRAP_SNAKE_AMBUSH), rawKind)
        );

        ebool hasCharge = FHE.gt(p.encryptedTrapCharges, FHE.asEuint8(0));
        euint8 effectiveTile = FHE.select(hasCharge, clampedTile, FHE.asEuint8(0));
        p.encryptedTrapCharges = FHE.select(
            hasCharge,
            FHE.sub(p.encryptedTrapCharges, FHE.asEuint8(1)),
            p.encryptedTrapCharges
        );
        FHE.allowThis(p.encryptedTrapCharges);
        FHE.allow(p.encryptedTrapCharges, msg.sender);

        uint8 idx = m.trapCount++;
        SecretTrap storage trap = _traps[matchId][idx];
        trap.owner = msg.sender;
        trap.encryptedTile = effectiveTile;
        trap.encryptedKind = clampedKind;
        FHE.allowThis(trap.encryptedTile);
        FHE.allowThis(trap.encryptedKind);
        FHE.allow(trap.encryptedTile, msg.sender);
        FHE.allow(trap.encryptedKind, msg.sender);

        p.trapsPlanted += 1;
        emit SecretTrapPlanted(matchId, msg.sender, idx);
    }

    /**
     * @notice Spends 2 stars to roll an encrypted Mystery Tactical Item onchain.
     *         Only the buyer can decrypt whether they received Shields or Trap Charges.
     */
    function buyEncryptedMysteryItem(uint256 matchId) external {
        MatchData storage m = _matches[matchId];
        _requireTurnReady(m, msg.sender);

        PlayerState storage p = _players[matchId][msg.sender];
        if (p.stars < 2) revert NotEnoughStars();
        p.stars -= 2;

        euint8 roll = FHE.randEuint8(4); // 0..3
        euint8 shieldBonus = FHE.select(
            FHE.eq(roll, FHE.asEuint8(2)),
            FHE.asEuint8(2),
            FHE.select(FHE.eq(roll, FHE.asEuint8(1)), FHE.asEuint8(0), FHE.asEuint8(1))
        );
        euint8 trapBonus = FHE.select(
            FHE.or(FHE.eq(roll, FHE.asEuint8(1)), FHE.eq(roll, FHE.asEuint8(3))),
            FHE.asEuint8(1),
            FHE.asEuint8(0)
        );

        p.encryptedShields = FHE.add(p.encryptedShields, shieldBonus);
        p.encryptedTrapCharges = FHE.add(p.encryptedTrapCharges, trapBonus);
        FHE.allowThis(p.encryptedShields);
        FHE.allowThis(p.encryptedTrapCharges);
        FHE.allow(p.encryptedShields, msg.sender);
        FHE.allow(p.encryptedTrapCharges, msg.sender);

        emit MysteryItemBought(matchId, msg.sender, p.stars);
    }

    /**
     * @notice Spends 2 stars to cast a secret FHE-encrypted Dice Brake (caps next roll to 1..3)
     *         onto a hidden rival seat index. Neither observers nor the victim know who is cursed!
     */
    function castSecretBrake(
        uint256 matchId,
        externalEuint8 encTargetSeat,
        bytes calldata inputProof
    ) external {
        MatchData storage m = _matches[matchId];
        _requireTurnReady(m, msg.sender);

        PlayerState storage caster = _players[matchId][msg.sender];
        if (caster.stars < 2) revert NotEnoughStars();
        caster.stars -= 2;

        euint8 targetSeat = FHE.fromExternal(encTargetSeat, inputProof);
        for (uint8 i = 0; i < m.playerCount; i++) {
            address seatAddr = m.playerOrder[i];
            if (seatAddr == msg.sender) continue;
            ebool isTarget = FHE.eq(targetSeat, FHE.asEuint8(i));
            PlayerState storage rival = _players[matchId][seatAddr];
            ebool nextBrake = FHE.or(rival.encryptedBrake, isTarget);
            rival.encryptedBrake = nextBrake;
            FHE.allowThis(nextBrake);
        }

        emit SecretBrakeCast(matchId, msg.sender, caster.stars);
    }

    /**
     * @notice Step 1 of verifiable onchain FHE dice: generates encrypted 1..6 roll onchain
     *         (secretly capped to 1..3 if an encrypted Brake curse is active) and flags it
     *         publicly decryptable via KMS.
     */
    function requestDiceRoll(uint256 matchId) external {
        MatchData storage m = _matches[matchId];
        _requireTurnReady(m, msg.sender);

        PlayerState storage p = _players[matchId][msg.sender];
        euint32 rawRand = FHE.randEuint32();
        euint8 baseDie = FHE.add(FHE.asEuint8(FHE.rem(rawRand, 6)), FHE.asEuint8(1));
        euint8 maxAllowed = FHE.select(p.encryptedBrake, FHE.asEuint8(3), FHE.asEuint8(6));
        euint8 die = FHE.min(baseDie, maxAllowed);

        p.encryptedBrake = FHE.asEbool(false);
        FHE.allowThis(p.encryptedBrake);
        FHE.makePubliclyDecryptable(die);

        bytes32 rollHandle = FHE.toBytes32(die);
        m.pendingAction = PendingAction.WaitingDiceReveal;
        m.pendingRollHandle = rollHandle;
        m.pendingMover = msg.sender;

        emit DiceRollRequested(matchId, msg.sender, rollHandle);
    }

    /**
     * @notice Step 2 of verifiable FHE dice: verifies KMS proof with FHE.checkSignatures,
     *         advances pawn, and either resolves immediately or triggers homomorphic trap/shield check.
     */
    function finalizeDiceRoll(
        uint256 matchId,
        uint8 clearDie,
        bytes calldata decryptionProof
    ) external {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Active) revert MatchNotActive();
        if (m.pendingAction != PendingAction.WaitingDiceReveal) revert InvalidPendingAction();
        if (clearDie < 1 || clearDie > 6) revert InvalidCleartextValue();

        bytes32 rollHandle = m.pendingRollHandle;
        if (_consumedHandles[matchId][rollHandle]) revert ProofAlreadyConsumed();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = rollHandle;
        FHE.checkSignatures(handles, abi.encode(clearDie), decryptionProof);

        _consumedHandles[matchId][rollHandle] = true;
        m.pendingRollHandle = bytes32(0);

        address mover = m.pendingMover;
        PlayerState storage p = _players[matchId][mover];
        uint8 fromPos = p.position;
        uint8 target = m.boardSize;

        uint16 rawNext = uint16(fromPos) + uint16(clearDie);
        uint8 toPos = rawNext <= target
            ? uint8(rawNext)
            : uint8(uint16(target) - (rawNext - uint16(target)));
        p.position = toPos;

        emit DiceMoved(matchId, mover, clearDie, fromPos, toPos);

        uint8 snakeDest = _getSnakeDest(m.boardSize, toPos);
        bool isExactFinish = toPos >= target;
        bool hasEnemyTrap = !isExactFinish && _hasEnemyTrap(m, mover);
        bool needsShieldCheck = !isExactFinish && snakeDest > 0;

        if (!hasEnemyTrap && !needsShieldCheck) {
            _finishTileResolution(m, mover, toPos, 0, false);
            return;
        }

        euint8 encTrapOutcome = hasEnemyTrap
            ? _evaluateHiddenTraps(m, mover, toPos)
            : FHE.asEuint8(0);
        euint8 encShieldUsed = needsShieldCheck
            ? _consumeSnakeShield(p, mover)
            : FHE.asEuint8(0);

        FHE.makePubliclyDecryptable(encTrapOutcome);
        FHE.makePubliclyDecryptable(encShieldUsed);

        m.pendingAction = PendingAction.WaitingTrapReveal;
        m.pendingLandingPos = toPos;
        m.pendingTrapHandle = FHE.toBytes32(encTrapOutcome);
        m.pendingShieldHandle = FHE.toBytes32(encShieldUsed);

        emit ConfidentialTileCheckRequested(
            matchId,
            mover,
            toPos,
            m.pendingTrapHandle,
            m.pendingShieldHandle
        );
    }

    function _hasEnemyTrap(MatchData storage m, address mover) internal view returns (bool) {
        uint256 matchId = m.id;
        for (uint8 i = 0; i < m.trapCount; i++) {
            if (_traps[matchId][i].owner != mover) {
                return true;
            }
        }
        return false;
    }

    function _evaluateHiddenTraps(
        MatchData storage m,
        address mover,
        uint8 toPos
    ) internal returns (euint8 encTrapOutcome) {
        uint256 matchId = m.id;
        encTrapOutcome = FHE.asEuint8(0);
        euint8 targetTileEnc = FHE.asEuint8(toPos);

        for (uint8 i = 0; i < m.trapCount; i++) {
            SecretTrap storage trap = _traps[matchId][i];
            if (trap.owner == mover) continue;

            ebool hit = FHE.eq(trap.encryptedTile, targetTileEnc);
            encTrapOutcome = FHE.select(hit, trap.encryptedKind, encTrapOutcome);
            // Disarm only the matched trap homomorphically by shifting its encrypted tile to 0
            euint8 updatedTile = FHE.select(hit, FHE.asEuint8(0), trap.encryptedTile);
            trap.encryptedTile = updatedTile;
            FHE.allowThis(updatedTile);
            if (trap.owner != address(0)) {
                FHE.allow(updatedTile, trap.owner);
            }
        }
    }

    function _consumeSnakeShield(
        PlayerState storage p,
        address mover
    ) internal returns (euint8 encShieldUsed) {
        ebool hasShield = FHE.gt(p.encryptedShields, FHE.asEuint8(0));
        euint8 nextShields = FHE.select(
            hasShield,
            FHE.sub(p.encryptedShields, FHE.asEuint8(1)),
            p.encryptedShields
        );
        p.encryptedShields = nextShields;
        FHE.allowThis(nextShields);
        FHE.allow(nextShields, mover);
        encShieldUsed = FHE.select(hasShield, FHE.asEuint8(1), FHE.asEuint8(0));
    }

    /**
     * @notice Verifies KMS proof for homomorphic trap + shield evaluation and settles the turn.
     */
    function finalizeTileCheck(
        uint256 matchId,
        uint8 clearTrapKind,
        uint8 clearShieldUsed,
        bytes calldata decryptionProof
    ) external {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Active) revert MatchNotActive();
        if (m.pendingAction != PendingAction.WaitingTrapReveal) revert InvalidPendingAction();
        if (clearTrapKind > TRAP_GOLDEN_WARP || clearShieldUsed > 1) {
            revert InvalidCleartextValue();
        }

        bytes32 trapHandle = m.pendingTrapHandle;
        bytes32 shieldHandle = m.pendingShieldHandle;
        if (_consumedHandles[matchId][trapHandle]) revert ProofAlreadyConsumed();

        bytes32[] memory handles = new bytes32[](2);
        handles[0] = trapHandle;
        handles[1] = shieldHandle;
        FHE.checkSignatures(handles, abi.encode(clearTrapKind, clearShieldUsed), decryptionProof);

        _consumedHandles[matchId][trapHandle] = true;
        m.pendingTrapHandle = bytes32(0);
        m.pendingShieldHandle = bytes32(0);

        _finishTileResolution(
            m,
            m.pendingMover,
            m.pendingLandingPos,
            clearTrapKind,
            clearShieldUsed == 1
        );
    }

    /**
     * @notice Starts a Blind Encrypted 1v1 Duel (Rock=0, Paper=1, Scissors=2).
     *         Passing opponent = address(0) challenges the FHE Encrypted House!
     */
    function startBlindDuel(uint256 matchId, address opponent) external {
        MatchData storage m = _matches[matchId];
        _requireTurnReady(m, msg.sender);
        if (m.duel.active) revert DuelAlreadyActive();
        if (opponent == msg.sender) revert InvalidDuelOpponent();
        if (opponent != address(0) && _playerIndexPlusOne[matchId][opponent] == 0) {
            revert InvalidDuelOpponent();
        }

        BlindDuel storage d = m.duel;
        d.active = true;
        d.challenger = msg.sender;
        d.opponent = opponent;
        d.challengerCommitted = false;
        d.opponentCommitted = false;
        d.pendingResultHandle = bytes32(0);

        if (opponent == address(0)) {
            d.opponentChoice = FHE.rem(FHE.randEuint8(4), 3);
            FHE.allowThis(d.opponentChoice);
            d.opponentCommitted = true;
        }

        emit BlindDuelStarted(matchId, msg.sender, opponent);
    }

    /**
     * @notice Submits an FHE-encrypted Rock/Paper/Scissors move (0=Ink, 1=Scroll, 2=Scissors).
     *         Neither opponent nor mempool observers can see the move.
     */
    function submitBlindDuelMove(
        uint256 matchId,
        externalEuint8 encChoice,
        bytes calldata inputProof
    ) external {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Active) revert MatchNotActive();
        if (!m.duel.active || m.pendingAction != PendingAction.None) revert InvalidPendingAction();

        BlindDuel storage d = m.duel;
        euint8 choice = FHE.min(FHE.asEuint8(2), FHE.fromExternal(encChoice, inputProof));

        if (msg.sender == d.challenger) {
            if (d.challengerCommitted) revert AlreadyCommitted();
            d.challengerChoice = choice;
            FHE.allowThis(d.challengerChoice);
            d.challengerCommitted = true;
        } else if (msg.sender == d.opponent) {
            if (d.opponentCommitted) revert AlreadyCommitted();
            d.opponentChoice = choice;
            FHE.allowThis(d.opponentChoice);
            d.opponentCommitted = true;
        } else {
            revert NotInMatch();
        }

        emit BlindDuelCommitted(matchId, msg.sender);

        if (d.challengerCommitted && d.opponentCommitted) {
            bytes32 resultHandle = _evaluateBlindDuel(d);
            m.pendingAction = PendingAction.WaitingBlindDuelReveal;
            emit BlindDuelReadyForReveal(matchId, resultHandle);
        }
    }

    function _evaluateBlindDuel(BlindDuel storage d) internal returns (bytes32 resultHandle) {
        euint8 a = d.challengerChoice;
        euint8 b = d.opponentChoice;

        ebool aWins = FHE.or(
            FHE.or(
                FHE.and(FHE.eq(a, FHE.asEuint8(0)), FHE.eq(b, FHE.asEuint8(2))),
                FHE.and(FHE.eq(a, FHE.asEuint8(1)), FHE.eq(b, FHE.asEuint8(0)))
            ),
            FHE.and(FHE.eq(a, FHE.asEuint8(2)), FHE.eq(b, FHE.asEuint8(1)))
        );
        ebool isTie = FHE.eq(a, b);
        euint8 encOutcome = FHE.select(
            isTie,
            FHE.asEuint8(0),
            FHE.select(aWins, FHE.asEuint8(1), FHE.asEuint8(2))
        );
        FHE.makePubliclyDecryptable(encOutcome);

        resultHandle = FHE.toBytes32(encOutcome);
        d.pendingResultHandle = resultHandle;
    }

    /**
     * @notice Finalizes the Blind Duel via KMS proof without revealing raw player choices.
     */
    function finalizeBlindDuel(
        uint256 matchId,
        uint8 clearOutcome,
        bytes calldata decryptionProof
    ) external {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Active) revert MatchNotActive();
        if (m.pendingAction != PendingAction.WaitingBlindDuelReveal) revert InvalidPendingAction();
        if (clearOutcome > 2) revert InvalidCleartextValue();

        BlindDuel storage d = m.duel;
        bytes32 resultHandle = d.pendingResultHandle;
        if (_consumedHandles[matchId][resultHandle]) revert ProofAlreadyConsumed();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = resultHandle;
        FHE.checkSignatures(handles, abi.encode(clearOutcome), decryptionProof);

        _consumedHandles[matchId][resultHandle] = true;
        address winnerAddr = address(0);

        if (clearOutcome == 1) {
            winnerAddr = d.challenger;
            PlayerState storage c = _players[matchId][d.challenger];
            c.stars += 2;
            c.duelWins += 1;
            if (d.opponent != address(0) && _players[matchId][d.opponent].stars > 0) {
                _players[matchId][d.opponent].stars -= 1;
            }
        } else if (clearOutcome == 2) {
            winnerAddr = d.opponent;
            if (d.opponent != address(0)) {
                PlayerState storage opp = _players[matchId][d.opponent];
                opp.stars += 2;
                opp.duelWins += 1;
                if (_players[matchId][d.challenger].stars > 0) {
                    _players[matchId][d.challenger].stars -= 1;
                }
            }
        } else {
            // Friendly tie bonus so dueling is always rewarding
            _players[matchId][d.challenger].stars += 1;
        }

        d.active = false;
        d.pendingResultHandle = bytes32(0);
        m.pendingAction = PendingAction.None;

        emit BlindDuelResolved(matchId, clearOutcome, winnerAddr);
    }

    /**
     * @notice Homomorphically evaluates whether the caller satisfied their Secret Match Mission
     *         without revealing which mission ID they were assigned!
     */
    function requestMissionCheck(uint256 matchId) external {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (_playerIndexPlusOne[matchId][msg.sender] == 0) revert NotInMatch();
        if (m.pendingAction != PendingAction.None) revert PendingActionExists();

        PlayerState storage p = _players[matchId][msg.sender];
        if (p.missionClaimed) revert MissionAlreadyClaimed();

        bool c0 = p.laddersClimbed >= 1;
        bool c1 = p.snakesDodged >= 1 || p.position >= (m.boardSize / 2);
        bool c2 = p.duelWins >= 1;
        bool c3 = p.trapsPlanted >= 1 && p.stars >= 4;

        ebool m0 = FHE.and(FHE.eq(p.encryptedMission, FHE.asEuint8(0)), FHE.asEbool(c0));
        ebool m1 = FHE.and(FHE.eq(p.encryptedMission, FHE.asEuint8(1)), FHE.asEbool(c1));
        ebool m2 = FHE.and(FHE.eq(p.encryptedMission, FHE.asEuint8(2)), FHE.asEbool(c2));
        ebool m3 = FHE.and(FHE.eq(p.encryptedMission, FHE.asEuint8(3)), FHE.asEbool(c3));

        ebool passed = FHE.or(FHE.or(m0, m1), FHE.or(m2, m3));
        euint8 encPassed = FHE.select(passed, FHE.asEuint8(1), FHE.asEuint8(0));
        FHE.makePubliclyDecryptable(encPassed);

        bytes32 handle = FHE.toBytes32(encPassed);
        m.pendingAction = PendingAction.WaitingMissionReveal;
        m.pendingMissionHandle = handle;
        m.pendingMover = msg.sender;

        emit SecretMissionCheckRequested(matchId, msg.sender, handle);
    }

    /**
     * @notice Verifies Secret Mission result via FHE.checkSignatures and awards +3 stars + 1 Shield.
     */
    function finalizeMissionCheck(
        uint256 matchId,
        uint8 clearPassed,
        bytes calldata decryptionProof
    ) external {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (m.pendingAction != PendingAction.WaitingMissionReveal) revert InvalidPendingAction();
        if (clearPassed > 1) revert InvalidCleartextValue();

        bytes32 handle = m.pendingMissionHandle;
        if (_consumedHandles[matchId][handle]) revert ProofAlreadyConsumed();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        FHE.checkSignatures(handles, abi.encode(clearPassed), decryptionProof);

        _consumedHandles[matchId][handle] = true;
        m.pendingMissionHandle = bytes32(0);
        m.pendingAction = PendingAction.None;

        address claimant = m.pendingMover;
        PlayerState storage p = _players[matchId][claimant];

        if (clearPassed == 1) {
            p.missionClaimed = true;
            p.stars += 3;
            p.encryptedShields = FHE.add(p.encryptedShields, FHE.asEuint8(1));
            FHE.allowThis(p.encryptedShields);
            FHE.allow(p.encryptedShields, claimant);
        }

        emit SecretMissionClaimed(matchId, claimant, clearPassed == 1);
    }

    /**
     * @notice Transfers the entire encrypted ERC-7984 pot confidentially to the match winner.
     */
    function claimMatchPayout(uint256 matchId) external nonReentrant {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Finished) revert MatchNotFinished();
        if (m.payoutClaimed) revert PayoutAlreadyClaimed();

        m.payoutClaimed = true;
        if (m.stakeToken != address(0) && m.winner != address(0)) {
            FHE.allowTransient(m.encryptedPot, m.stakeToken);
            IERC7984(m.stakeToken).confidentialTransfer(m.winner, m.encryptedPot);
        }

        emit PotClaimed(matchId, m.winner, m.stakeToken);
    }

    // ─────────────────────────── View Getters ───────────────────────────

    function getMatchSummary(
        uint256 matchId
    )
        external
        view
        returns (
            address host,
            address stakeToken,
            uint8 boardSize,
            uint8 maxPlayers,
            uint8 playerCount,
            uint8 turnIndex,
            uint16 turnNumber,
            MatchStatus status,
            PendingAction pendingAction,
            address winner,
            bool payoutClaimed,
            uint8 trapCount
        )
    {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        return (
            m.host,
            m.stakeToken,
            m.boardSize,
            m.maxPlayers,
            m.playerCount,
            m.turnIndex,
            m.turnNumber,
            m.status,
            m.pendingAction,
            m.winner,
            m.payoutClaimed,
            m.trapCount
        );
    }

    function getMatchPendingHandles(
        uint256 matchId
    )
        external
        view
        returns (
            bytes32 rollHandle,
            bytes32 trapHandle,
            bytes32 shieldHandle,
            bytes32 duelHandle,
            bytes32 missionHandle,
            address pendingMover,
            uint8 pendingLandingPos
        )
    {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        return (
            m.pendingRollHandle,
            m.pendingTrapHandle,
            m.pendingShieldHandle,
            m.duel.pendingResultHandle,
            m.pendingMissionHandle,
            m.pendingMover,
            m.pendingLandingPos
        );
    }

    function getBlindDuelState(
        uint256 matchId
    )
        external
        view
        returns (
            bool active,
            address challenger,
            address opponent,
            bool challengerCommitted,
            bool opponentCommitted,
            bytes32 pendingResultHandle
        )
    {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        BlindDuel storage d = m.duel;
        return (
            d.active,
            d.challenger,
            d.opponent,
            d.challengerCommitted,
            d.opponentCommitted,
            d.pendingResultHandle
        );
    }

    function getMatchPlayers(uint256 matchId) external view returns (address[] memory list) {
        MatchData storage m = _matches[matchId];
        if (m.id == 0) revert MatchNotFound();
        list = new address[](m.playerCount);
        for (uint8 i = 0; i < m.playerCount; i++) {
            list[i] = m.playerOrder[i];
        }
    }

    function getPlayerPublicState(
        uint256 matchId,
        address player
    )
        external
        view
        returns (
            uint8 position,
            uint16 stars,
            uint8 laddersClimbed,
            uint8 snakesDodged,
            uint8 duelWins,
            uint8 trapsPlanted,
            bool missionClaimed
        )
    {
        PlayerState storage p = _players[matchId][player];
        return (
            p.position,
            p.stars,
            p.laddersClimbed,
            p.snakesDodged,
            p.duelWins,
            p.trapsPlanted,
            p.missionClaimed
        );
    }

    function getPlayerEncryptedState(
        uint256 matchId,
        address player
    )
        external
        view
        returns (
            euint8 encryptedMission,
            euint8 encryptedShields,
            euint8 encryptedTrapCharges,
            euint64 encryptedStake
        )
    {
        PlayerState storage p = _players[matchId][player];
        return (
            p.encryptedMission,
            p.encryptedShields,
            p.encryptedTrapCharges,
            p.encryptedStake
        );
    }

    function getSecretTrap(
        uint256 matchId,
        uint8 index
    ) external view returns (address owner, euint8 encryptedTile, euint8 encryptedKind) {
        SecretTrap storage t = _traps[matchId][index];
        return (t.owner, t.encryptedTile, t.encryptedKind);
    }

    function getMatchEncryptedPot(uint256 matchId) external view returns (euint64) {
        return _matches[matchId].encryptedPot;
    }

    function getBoardLinks(
        uint8 boardSize,
        uint8 tileId
    ) external view returns (uint8 ladderTo, uint8 snakeTo) {
        return (_getLadderDest(boardSize, tileId), _getSnakeDest(boardSize, tileId));
    }

    // ─────────────────────────── Internal Helpers ───────────────────────────

    function _validateStakeToken(address stakeToken) internal view {
        if (stakeToken == address(0)) return;
        if (stakeToken == address(chipToken) || stakeToken == SEPOLIA_CUSDT) return;
        if (!IERC165(stakeToken).supportsInterface(type(IERC7984).interfaceId)) {
            revert UnsupportedStakeToken();
        }
    }

    function _collectStake(
        MatchData storage m,
        address stakeToken,
        externalEuint64 encStake,
        bytes calldata stakeProof
    ) internal returns (euint64 transferred) {
        if (stakeToken == address(0)) {
            transferred = FHE.asEuint64(0);
            FHE.allowThis(transferred);
            return transferred;
        }
        euint64 amount = FHE.fromExternal(encStake, stakeProof);
        FHE.allowTransient(amount, stakeToken);
        transferred = IERC7984(stakeToken).confidentialTransferFrom(msg.sender, address(this), amount);
        m.encryptedPot = FHE.add(m.encryptedPot, transferred);
        FHE.allowThis(m.encryptedPot);
        FHE.allowThis(transferred);
    }

    function _seatPlayer(MatchData storage m, address playerAddr, euint64 stakeTransferred) internal {
        uint8 seat = m.playerCount;
        m.playerOrder[seat] = playerAddr;
        m.playerCount += 1;
        _playerIndexPlusOne[m.id][playerAddr] = seat + 1;

        PlayerState storage p = _players[m.id][playerAddr];
        p.addr = playerAddr;
        p.position = 1;
        p.stars = 2; // Starter pocket stars for Mystery Item / Duel testing

        euint8 mission = FHE.randEuint8(4);
        euint8 shields = FHE.asEuint8(1);
        euint8 trapCharges = FHE.asEuint8(2);

        FHE.allowThis(mission);
        FHE.allowThis(shields);
        FHE.allowThis(trapCharges);
        FHE.allowThis(stakeTransferred);

        FHE.allow(mission, playerAddr);
        FHE.allow(shields, playerAddr);
        FHE.allow(trapCharges, playerAddr);
        FHE.allow(stakeTransferred, playerAddr);

        p.encryptedMission = mission;
        p.encryptedShields = shields;
        p.encryptedTrapCharges = trapCharges;
        p.encryptedStake = stakeTransferred;
        p.encryptedBrake = FHE.asEbool(false);
        FHE.allowThis(p.encryptedBrake);
    }

    function _activateMatch(MatchData storage m) internal {
        // Every match spawns 1 hidden Golden Warp shortcut (+3 steps +1 star) via FHE randomness
        uint8 modSpan = m.boardSize - 4;
        uint8 bound = m.boardSize <= 30 ? 32 : 128;
        euint8 warpTile = FHE.add(
            FHE.rem(FHE.randEuint8(bound), modSpan),
            FHE.asEuint8(2)
        );
        if (m.trapCount < MAX_TRAPS_PER_MATCH) {
            uint8 wIdx = m.trapCount++;
            SecretTrap storage warp = _traps[m.id][wIdx];
            warp.owner = address(0);
            warp.encryptedTile = warpTile;
            warp.encryptedKind = FHE.asEuint8(TRAP_GOLDEN_WARP);
            FHE.allowThis(warp.encryptedTile);
            FHE.allowThis(warp.encryptedKind);
        }

        m.status = MatchStatus.Active;
        m.turnIndex = 0;
        m.turnNumber = 1;
        emit MatchStarted(m.id, m.playerCount);
    }

    function _activateMatchWithHouseTraps(MatchData storage m) internal {
        // Plant 2 encrypted FHE House Traps so Solo players face hidden hazards immediately
        uint8 modSpan = m.boardSize - 2; // 28 for Sprint(30), 98 for Classic(100)
        uint8 bound = m.boardSize <= 30 ? 32 : 128;

        for (uint8 i = 0; i < 2; i++) {
            euint8 randTile = FHE.add(
                FHE.rem(FHE.randEuint8(bound), modSpan),
                FHE.asEuint8(2)
            );
            euint8 randKind = FHE.add(
                FHE.rem(FHE.randEuint8(4), 3),
                FHE.asEuint8(1)
            );
            uint8 idx = m.trapCount++;
            SecretTrap storage trap = _traps[m.id][idx];
            trap.owner = address(0);
            trap.encryptedTile = randTile;
            trap.encryptedKind = randKind;
            FHE.allowThis(trap.encryptedTile);
            FHE.allowThis(trap.encryptedKind);
        }

        _activateMatch(m);
    }

    function _requireTurnReady(MatchData storage m, address caller) internal view {
        if (m.id == 0) revert MatchNotFound();
        if (m.status != MatchStatus.Active) revert MatchNotActive();
        if (m.pendingAction != PendingAction.None || m.duel.active) {
            revert PendingActionExists();
        }
        if (m.playerOrder[m.turnIndex] != caller) revert NotYourTurn();
    }

    function _finishTileResolution(
        MatchData storage m,
        address mover,
        uint8 landedPos,
        uint8 clearTrapKind,
        bool clearShieldUsed
    ) internal {
        PlayerState storage p = _players[m.id][mover];
        uint8 finalPos = landedPos;

        // 1. Apply secret trap or hidden Golden Warp effect if triggered
        if (clearTrapKind == TRAP_MUD_SLIDE) {
            finalPos = finalPos > 3 ? finalPos - 2 : 1;
        } else if (clearTrapKind == TRAP_INK_SNARE) {
            if (p.stars > 0) p.stars -= 1;
        } else if (clearTrapKind == TRAP_SNAKE_AMBUSH) {
            finalPos = finalPos > 5 ? finalPos - 4 : 1;
        } else if (clearTrapKind == TRAP_GOLDEN_WARP) {
            uint8 boosted = finalPos + 3;
            finalPos = boosted >= m.boardSize ? m.boardSize - 1 : boosted;
            p.stars += 1;
        }

        // 2. Check ladder / snake on finalPos (unless trap already displaced pawn away from original link)
        uint8 ladderDest = _getLadderDest(m.boardSize, finalPos);
        uint8 snakeDest = _getSnakeDest(m.boardSize, finalPos);

        if (ladderDest > 0) {
            finalPos = ladderDest;
            p.laddersClimbed += 1;
            p.stars += 2;
        } else if (snakeDest > 0) {
            if (clearShieldUsed) {
                p.snakesDodged += 1;
                p.stars += 1;
            } else {
                finalPos = snakeDest;
            }
        } else if (clearTrapKind == 0) {
            p.stars += 1; // Normal safe landing grants +1 star
        }

        p.position = finalPos;
        m.pendingAction = PendingAction.None;
        m.pendingMover = address(0);
        m.pendingLandingPos = 0;

        emit TileResolved(
            m.id,
            mover,
            finalPos,
            clearTrapKind,
            clearShieldUsed,
            ladderDest,
            snakeDest
        );

        if (finalPos >= m.boardSize) {
            m.status = MatchStatus.Finished;
            m.winner = mover;
            emit MatchWon(m.id, mover, m.turnNumber);
            return;
        }

        m.turnIndex = (m.turnIndex + 1) % m.playerCount;
        m.turnNumber += 1;
    }

    function _getLadderDest(uint8 boardSize, uint8 tileId) internal view returns (uint8) {
        return boardSize == BOARD_SPRINT_SIZE ? sprintLadders[tileId] : classicLadders[tileId];
    }

    function _getSnakeDest(uint8 boardSize, uint8 tileId) internal view returns (uint8) {
        return boardSize == BOARD_SPRINT_SIZE ? sprintSnakes[tileId] : classicSnakes[tileId];
    }
}
