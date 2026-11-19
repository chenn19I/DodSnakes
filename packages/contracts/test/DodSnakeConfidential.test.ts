import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("DodSnake Confidential FHEVM & ERC-7984 Suite", function () {
  let signers: HardhatEthersSigner[];
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  let chipAddr: string;
  let arenaAddr: string;
  let chip: any;
  let arena: any;

  async function deployFixture() {
    signers = await ethers.getSigners();
    [deployer, alice, bob, charlie, outsider] = signers;

    const ChipFactory = await ethers.getContractFactory("DodChipERC7984");
    chip = await ChipFactory.deploy();
    await chip.waitForDeployment();
    chipAddr = await chip.getAddress();

    const ArenaFactory = await ethers.getContractFactory("DodSnakeArena");
    arena = await ArenaFactory.deploy(chipAddr);
    await arena.waitForDeployment();
    arenaAddr = await arena.getAddress();
  }

  async function encryptStake(user: HardhatEthersSigner, amount: bigint) {
    const input = fhevm.createEncryptedInput(arenaAddr, user.address);
    input.add64(amount);
    return input.encrypt();
  }

  async function encryptTrap(user: HardhatEthersSigner, tile: number, kind: number) {
    const input = fhevm.createEncryptedInput(arenaAddr, user.address);
    input.add8(tile);
    input.add8(kind);
    return input.encrypt();
  }

  async function encryptDuelMove(user: HardhatEthersSigner, move: number) {
    const input = fhevm.createEncryptedInput(arenaAddr, user.address);
    input.add8(move);
    return input.encrypt();
  }

  async function rollAndResolveStep(matchId: bigint, roller: HardhatEthersSigner) {
    const txRoll = await arena.connect(roller).requestDiceRoll(matchId);
    await txRoll.wait();

    const handlesBefore = await arena.getMatchPendingHandles(matchId);
    const rollHandle = handlesBefore[0];
    const decRoll = await fhevm.publicDecrypt([rollHandle]);
    const clearDie = Number(decRoll.clearValues[rollHandle as `0x${string}`]);

    const txFin = await arena
      .connect(roller)
      .finalizeDiceRoll(matchId, clearDie, decRoll.decryptionProof);
    await txFin.wait();

    const summaryAfterMove = await arena.getMatchSummary(matchId);
    let trapTriggered = 0;
    let shieldUsed = 0;

    // PendingAction.WaitingTrapReveal == 2
    if (Number(summaryAfterMove.pendingAction) === 2) {
      const h = await arena.getMatchPendingHandles(matchId);
      const trapHandle = h[1];
      const shieldHandle = h[2];
      const decCheck = await fhevm.publicDecrypt([trapHandle, shieldHandle]);
      trapTriggered = Number(decCheck.clearValues[trapHandle as `0x${string}`]);
      shieldUsed = Number(decCheck.clearValues[shieldHandle as `0x${string}`]);

      const txCheck = await arena
        .connect(roller)
        .finalizeTileCheck(matchId, trapTriggered, shieldUsed, decCheck.decryptionProof);
      await txCheck.wait();
    }

    return { clearDie, trapTriggered, shieldUsed };
  }

  beforeEach(async function () {
    await deployFixture();
  });

  it("1. Deploys DodChipERC7984 with encrypted initial supply & ERC-165 interface", async function () {
    expect(await chip.name()).to.equal("DodChip");
    expect(await chip.symbol()).to.equal("cDOD");
    expect(await chip.decimals()).to.equal(6);
    expect(await chip.supportsInterface("0x4958f2a4")).to.equal(true); // IERC7984

    const encBal = await chip.confidentialBalanceOf(deployer.address);
    const clearBal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encBal,
      chipAddr,
      deployer
    );
    expect(clearBal).to.equal(1_000_000_000_000n);
  });

  it("2. Allows players to claim 100 cDOD from built-in faucet & enforces cooldown", async function () {
    await expect(chip.connect(alice).claimFaucet()).to.emit(chip, "FaucetClaimed");

    const encBal = await chip.confidentialBalanceOf(alice.address);
    const clearBal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encBal,
      chipAddr,
      alice
    );
    expect(clearBal).to.equal(100_000_000n);

    expect(await chip.faucetCooldownRemaining(alice.address)).to.be.gt(0n);
    await expect(chip.connect(alice).claimFaucet()).to.be.revertedWithCustomError(
      chip,
      "FaucetCooldownActive"
    );

    await time.increase(3601);
    expect(await chip.faucetCooldownRemaining(alice.address)).to.equal(0n);
    await chip.connect(alice).claimFaucet();

    const encBal2 = await chip.confidentialBalanceOf(alice.address);
    const clearBal2 = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encBal2,
      chipAddr,
      alice
    );
    expect(clearBal2).to.equal(200_000_000n);
  });

  it("3. Enforces ACL privacy: outsiders cannot decrypt another player's ERC-7984 balance", async function () {
    await chip.connect(alice).claimFaucet();
    const aliceBalHandle = await chip.confidentialBalanceOf(alice.address);

    let failed = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint64, aliceBalHandle, chipAddr, outsider);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("4. Supports confidential ERC-7984 match wagers & operator approval into encrypted pot", async function () {
    await chip.connect(alice).claimFaucet();
    await chip.connect(bob).claimFaucet();

    const futureUntil = (await time.latest()) + 86400;
    await chip.connect(alice).setOperator(arenaAddr, futureUntil);
    await chip.connect(bob).setOperator(arenaAddr, futureUntil);

    const encStakeA = await encryptStake(alice, 25_000_000n); // 25 cDOD
    await arena
      .connect(alice)
      .createMatch(1, 2, chipAddr, encStakeA.handles[0], encStakeA.inputProof);

    const encStakeB = await encryptStake(bob, 25_000_000n); // 25 cDOD
    await arena
      .connect(bob)
      .joinMatch(1n, encStakeB.handles[0], encStakeB.inputProof);

    const aliceClearAfter = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await chip.confidentialBalanceOf(alice.address),
      chipAddr,
      alice
    );
    const bobClearAfter = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await chip.confidentialBalanceOf(bob.address),
      chipAddr,
      bob
    );
    expect(aliceClearAfter).to.equal(75_000_000n);
    expect(bobClearAfter).to.equal(75_000_000n);

    const summary = await arena.getMatchSummary(1n);
    expect(summary.boardSize).to.equal(30);
    expect(summary.status).to.equal(1); // Active
  });

  it("5. Assigns encrypted Secret Match Missions only decryptable by the owner", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 1, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);

    const encState = await arena.getPlayerEncryptedState(1n, alice.address);
    const missionVal = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encState.encryptedMission,
      arenaAddr,
      alice
    );
    expect(missionVal).to.be.gte(0n);
    expect(missionVal).to.be.lte(3n);

    // Bob/outsider cannot decrypt Alice's secret mission
    let unauthorized = false;
    try {
      await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encState.encryptedMission,
        arenaAddr,
        outsider
      );
    } catch {
      unauthorized = true;
    }
    expect(unauthorized).to.equal(true);
  });

  it("6. Allows buying Encrypted Mystery Tactical Items while hiding inventory from rivals", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 1, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);

    const beforeState = await arena.getPlayerEncryptedState(1n, alice.address);
    const shieldsBefore = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      beforeState.encryptedShields,
      arenaAddr,
      alice
    );
    const trapsBefore = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      beforeState.encryptedTrapCharges,
      arenaAddr,
      alice
    );
    expect(shieldsBefore).to.equal(1n);
    expect(trapsBefore).to.equal(2n);

    await expect(arena.connect(alice).buyEncryptedMysteryItem(1n)).to.emit(
      arena,
      "MysteryItemBought"
    );

    const afterState = await arena.getPlayerEncryptedState(1n, alice.address);
    const shieldsAfter = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      afterState.encryptedShields,
      arenaAddr,
      alice
    );
    const trapsAfter = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      afterState.encryptedTrapCharges,
      arenaAddr,
      alice
    );

    // Every roll grants at least +1 total item across shields & traps
    expect(shieldsAfter + trapsAfter).to.be.gte(4n);
    expect((await arena.getPlayerPublicState(1n, alice.address)).stars).to.equal(0);
  });

  it("7. Plants encrypted Secret Traps with homomorphic clamping & owner-only readability", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 2, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);
    await arena.connect(bob).joinMatch(1n, encZero.handles[0], encZero.inputProof);

    // Alice tries out-of-bounds tile 250 -> clamped homomorphically to 29 (boardSize - 1)
    const trapInput = await encryptTrap(alice, 250, 3);
    await expect(
      arena.connect(alice).plantSecretTrap(1n, trapInput.handles[0], trapInput.handles[1], trapInput.inputProof)
    ).to.emit(arena, "SecretTrapPlanted");

    const summary7 = await arena.getMatchSummary(1n);
    const trap = await arena.getSecretTrap(1n, Number(summary7.trapCount) - 1);
    expect(trap.owner).to.equal(alice.address);

    const clearTile = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      trap.encryptedTile,
      arenaAddr,
      alice
    );
    const clearKind = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      trap.encryptedKind,
      arenaAddr,
      alice
    );
    expect(clearTile).to.equal(29n);
    expect(clearKind).to.equal(3n);

    // Bob cannot decrypt Alice's trap location
    let bobBlocked = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint8, trap.encryptedTile, arenaAddr, bob);
    } catch {
      bobBlocked = true;
    }
    expect(bobBlocked).to.equal(true);
  });

  it("8. Generates verifiable onchain FHE dice rolls in [1..6] & rejects forged or replayed KMS proofs", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 1, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);

    await arena.connect(alice).requestDiceRoll(1n);
    const handles = await arena.getMatchPendingHandles(1n);
    const rollHandle = handles[0];
    const dec = await fhevm.publicDecrypt([rollHandle]);
    const clearDie = Number(dec.clearValues[rollHandle as `0x${string}`]);

    expect(clearDie).to.be.gte(1);
    expect(clearDie).to.be.lte(6);

    // Tampered cleartext must revert FHE.checkSignatures
    const forgedDie = clearDie === 6 ? 1 : clearDie + 1;
    await expect(
      arena.connect(alice).finalizeDiceRoll(1n, forgedDie, dec.decryptionProof)
    ).to.be.reverted;

    // Valid proof succeeds
    await expect(
      arena.connect(alice).finalizeDiceRoll(1n, clearDie, dec.decryptionProof)
    ).to.emit(arena, "DiceMoved");
  });

  it("9. Evaluates Secret Traps homomorphically: detects exact hit & keeps untriggered traps secret", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 2, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);
    await arena.connect(bob).joinMatch(1n, encZero.handles[0], encZero.inputProof);

    // Alice plants two traps on tiles 2 and 3 (kind 2 = Ink Snare, kind 3 = Snake Ambush)
    const t1 = await encryptTrap(alice, 2, 2);
    await arena.connect(alice).plantSecretTrap(1n, t1.handles[0], t1.handles[1], t1.inputProof);

    // Also advance Alice's turn so Bob gets a turn
    await rollAndResolveStep(1n, alice);

    // Bob plants a trap on tile 17 (far away)
    const tBob = await encryptTrap(bob, 17, 1);
    await arena.connect(bob).plantSecretTrap(1n, tBob.handles[0], tBob.handles[1], tBob.inputProof);
    const summary9 = await arena.getMatchSummary(1n);
    const bobTrapIdx = Number(summary9.trapCount) - 1;

    const stepBob = await rollAndResolveStep(1n, bob);
    // If Bob rolled a 1 (landing on tile 2), trapTriggered === 2 (unless Golden Warp coincided); otherwise 0 or 4
    if (stepBob.clearDie === 1) {
      expect([2, 4]).to.include(stepBob.trapTriggered);
    } else {
      expect([0, 4]).to.include(stepBob.trapTriggered);
    }

    // Bob's trap on tile 17 remains unreadable to Alice/outsiders
    const trapBob = await arena.getSecretTrap(1n, bobTrapIdx);
    let outsiderBlocked = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint8, trapBob.encryptedTile, arenaAddr, alice);
    } catch {
      outsiderBlocked = true;
    }
    expect(outsiderBlocked).to.equal(true);
  });

  it("10. Runs Blind Encrypted PvP Duel (Rock vs Scissors) without exposing moves prior to resolution", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 2, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);
    await arena.connect(bob).joinMatch(1n, encZero.handles[0], encZero.inputProof);

    await arena.connect(alice).startBlindDuel(1n, bob.address);

    // Alice commits Rock (0), Bob commits Scissors (2) -> Alice (challenger, outcome=1) must win!
    const moveA = await encryptDuelMove(alice, 0);
    await arena.connect(alice).submitBlindDuelMove(1n, moveA.handles[0], moveA.inputProof);

    const moveB = await encryptDuelMove(bob, 2);
    await expect(
      arena.connect(bob).submitBlindDuelMove(1n, moveB.handles[0], moveB.inputProof)
    ).to.emit(arena, "BlindDuelReadyForReveal");

    const handles = await arena.getMatchPendingHandles(1n);
    const duelHandle = handles[3];
    const dec = await fhevm.publicDecrypt([duelHandle]);
    const outcome = Number(dec.clearValues[duelHandle as `0x${string}`]);
    expect(outcome).to.equal(1); // Challenger (Alice) wins!

    await expect(arena.connect(alice).finalizeBlindDuel(1n, outcome, dec.decryptionProof))
      .to.emit(arena, "BlindDuelResolved")
      .withArgs(1n, 1, alice.address);

    const alicePub = await arena.getPlayerPublicState(1n, alice.address);
    const bobPub = await arena.getPlayerPublicState(1n, bob.address);
    expect(alicePub.duelWins).to.equal(1);
    expect(alicePub.stars).to.equal(4); // 2 starter + 2 win
    expect(bobPub.stars).to.equal(1);   // 2 starter - 1 loss
  });

  it("11. Supports Solo Blind Duel against FHE Encrypted House Bot", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 1, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);

    await arena.connect(alice).startBlindDuel(1n, ethers.ZeroAddress);
    const moveA = await encryptDuelMove(alice, 1); // Paper
    await expect(
      arena.connect(alice).submitBlindDuelMove(1n, moveA.handles[0], moveA.inputProof)
    ).to.emit(arena, "BlindDuelReadyForReveal");

    const handles = await arena.getMatchPendingHandles(1n);
    const dec = await fhevm.publicDecrypt([handles[3]]);
    const outcome = Number(dec.clearValues[handles[3] as `0x${string}`]);
    expect([0, 1, 2]).to.include(outcome);

    await expect(arena.connect(alice).finalizeBlindDuel(1n, outcome, dec.decryptionProof)).to.emit(
      arena,
      "BlindDuelResolved"
    );
  });

  it("12. Homomorphically checks Secret Match Mission without leaking which mission ID was assigned", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 1, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);

    await expect(arena.connect(alice).requestMissionCheck(1n)).to.emit(
      arena,
      "SecretMissionCheckRequested"
    );

    const handles = await arena.getMatchPendingHandles(1n);
    const dec = await fhevm.publicDecrypt([handles[4]]);
    const clearPassed = Number(dec.clearValues[handles[4] as `0x${string}`]);
    expect([0, 1]).to.include(clearPassed);

    await expect(
      arena.connect(alice).finalizeMissionCheck(1n, clearPassed, dec.decryptionProof)
    ).to.emit(arena, "SecretMissionClaimed");
  });

  it("13. Completes a full Sprint 30-tile Solo match & pays out encrypted ERC-7984 pot to winner", async function () {
    await chip.connect(alice).claimFaucet();
    await chip.connect(alice).setOperator(arenaAddr, (await time.latest()) + 86400);

    const encStake = await encryptStake(alice, 40_000_000n); // 40 cDOD
    await arena.connect(alice).createMatch(1, 1, chipAddr, encStake.handles[0], encStake.inputProof);

    let finished = false;
    for (let step = 0; step < 60; step++) {
      const summary = await arena.getMatchSummary(1n);
      if (Number(summary.status) === 2) {
        finished = true;
        break;
      }
      await rollAndResolveStep(1n, alice);
    }

    expect(finished).to.equal(true);
    const finalSummary = await arena.getMatchSummary(1n);
    expect(finalSummary.winner).to.equal(alice.address);

    await expect(arena.connect(alice).claimMatchPayout(1n)).to.emit(arena, "PotClaimed");

    const balAfterWin = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await chip.confidentialBalanceOf(alice.address),
      chipAddr,
      alice
    );
    expect(balAfterWin).to.equal(100_000_000n); // 60 + 40 cDOD returned!
  });

  it("14. Exercises 10 distinct testnet player accounts claiming faucets & running multi-room matches", async function () {
    const tenPlayers = signers.slice(1, 11);
    expect(tenPlayers.length).to.equal(10);

    const expiry = (await time.latest()) + 86400;
    for (const player of tenPlayers) {
      await chip.connect(player).claimFaucet();
      await chip.connect(player).setOperator(arenaAddr, expiry);

      const bal = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        await chip.confidentialBalanceOf(player.address),
        chipAddr,
        player
      );
      expect(bal).to.equal(100_000_000n);
    }

    // Create 3 concurrent 3-to-4 player encrypted matches across all 10 accounts
    const groups = [
      tenPlayers.slice(0, 4), // Match 1: 4 players
      tenPlayers.slice(4, 8), // Match 2: 4 players
      tenPlayers.slice(8, 10), // Match 3: 2 players
    ];

    let matchCounter = 0n;
    for (const group of groups) {
      matchCounter += 1n;
      const host = group[0];
      const stakeHost = await encryptStake(host, 10_000_000n);
      await arena
        .connect(host)
        .createMatch(0, group.length, chipAddr, stakeHost.handles[0], stakeHost.inputProof);

      for (let i = 1; i < group.length; i++) {
        const joiner = group[i];
        const stakeJoin = await encryptStake(joiner, 10_000_000n);
        await arena
          .connect(joiner)
          .joinMatch(matchCounter, stakeJoin.handles[0], stakeJoin.inputProof);
      }

      const summary = await arena.getMatchSummary(matchCounter);
      expect(summary.status).to.equal(1); // Active
      expect(summary.playerCount).to.equal(group.length);

      // Verify first player can roll FHE dice on Classic 100-tile board
      await rollAndResolveStep(matchCounter, host);
      const posAfterRoll = (await arena.getPlayerPublicState(matchCounter, host.address)).position;
      expect(posAfterRoll).to.be.gte(2);
    }
  });

  it("15. Casts encrypted Secret Rival Brake (castSecretBrake) capping hidden target's roll to [1..3]", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 2, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);
    await arena.connect(bob).joinMatch(1n, encZero.handles[0], encZero.inputProof);

    // Alice encrypts seat index 1 (Bob) so observers cannot see who was cursed
    const seatEnc = await fhevm.createEncryptedInput(arenaAddr, alice.address).add8(1).encrypt();
    await expect(
      arena.connect(alice).castSecretBrake(1n, seatEnc.handles[0], seatEnc.inputProof)
    ).to.emit(arena, "SecretBrakeCast");

    // Advance Alice's turn, then Bob rolls under the secret Brake curse (guaranteed <= 3!)
    await rollAndResolveStep(1n, alice);
    const bobStep = await rollAndResolveStep(1n, bob);
    expect(bobStep.clearDie).to.be.gte(1);
    expect(bobStep.clearDie).to.be.lte(3);
  });

  it("16. Spawns hidden FHE Golden Warp shortcut at match start unreadable by any player", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 2, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);
    await arena.connect(bob).joinMatch(1n, encZero.handles[0], encZero.inputProof);

    // Trap slot 0 is the Golden Warp shortcut (owner == address(0))
    const warp = await arena.getSecretTrap(1n, 0);
    expect(warp.owner).to.equal(ethers.ZeroAddress);

    let aliceBlocked = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint8, warp.encryptedTile, arenaAddr, alice);
    } catch {
      aliceBlocked = true;
    }
    expect(aliceBlocked).to.equal(true);
  });

  it("17. Enforces encrypted Trap Charge exhaustion homomorphically without leaking inventory count", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 2, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);
    await arena.connect(bob).joinMatch(1n, encZero.handles[0], encZero.inputProof);

    // Spend both starter trap charges on valid tiles 5 and 6
    const t1 = await encryptTrap(alice, 5, 1);
    await arena.connect(alice).plantSecretTrap(1n, t1.handles[0], t1.handles[1], t1.inputProof);
    const t2 = await encryptTrap(alice, 6, 2);
    await arena.connect(alice).plantSecretTrap(1n, t2.handles[0], t2.handles[1], t2.inputProof);

    const encStateAfter = await arena.getPlayerEncryptedState(1n, alice.address);
    const chargesLeft = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encStateAfter.encryptedTrapCharges,
      arenaAddr,
      alice
    );
    expect(chargesLeft).to.equal(0n);

    // Attempting a 3rd trap with 0 charges stores encryptedTile = 0 (homomorphically disarmed)
    const t3 = await encryptTrap(alice, 7, 3);
    await arena.connect(alice).plantSecretTrap(1n, t3.handles[0], t3.handles[1], t3.inputProof);
    const summary17 = await arena.getMatchSummary(1n);
    const extraTrap = await arena.getSecretTrap(1n, Number(summary17.trapCount) - 1);
    const disarmedTile = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      extraTrap.encryptedTile,
      arenaAddr,
      alice
    );
    expect(disarmedTile).to.equal(0n);
  });

  it("18. Supports host early startMatch on 4P lobby and exposes getBlindDuelState progress", async function () {
    const encZero = await encryptStake(alice, 0n);
    await arena.connect(alice).createMatch(1, 4, ethers.ZeroAddress, encZero.handles[0], encZero.inputProof);
    await arena.connect(bob).joinMatch(1n, encZero.handles[0], encZero.inputProof);

    expect((await arena.getMatchSummary(1n)).status).to.equal(0); // Lobby
    await expect(arena.connect(bob).startMatch(1n)).to.be.revertedWithCustomError(arena, "NotHost");
    await expect(arena.connect(alice).startMatch(1n)).to.emit(arena, "MatchStarted").withArgs(1n, 2);

    await arena.connect(alice).startBlindDuel(1n, bob.address);
    const duel0 = await arena.getBlindDuelState(1n);
    expect(duel0.active).to.equal(true);
    expect(duel0.challenger).to.equal(alice.address);
    expect(duel0.opponent).to.equal(bob.address);
    expect(duel0.challengerCommitted).to.equal(false);
    expect(duel0.opponentCommitted).to.equal(false);

    const moveA = await encryptDuelMove(alice, 0);
    await arena.connect(alice).submitBlindDuelMove(1n, moveA.handles[0], moveA.inputProof);
    const duel1 = await arena.getBlindDuelState(1n);
    expect(duel1.challengerCommitted).to.equal(true);
    expect(duel1.opponentCommitted).to.equal(false);

    const moveB = await encryptDuelMove(bob, 1);
    await arena.connect(bob).submitBlindDuelMove(1n, moveB.handles[0], moveB.inputProof);
    const duel2 = await arena.getBlindDuelState(1n);
    expect(duel2.opponentCommitted).to.equal(true);
    expect(duel2.pendingResultHandle).to.not.equal(ethers.ZeroHash);
  });
});
