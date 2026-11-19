import { ethers, fhevm, network } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Runs an end-to-end confidential gameplay smoke test against a deployed
 * DodChipERC7984 + DodSnakeArena instance (on Hardhat local or Sepolia testnet).
 */
async function main() {
  if (network.name === "hardhat") {
    await fhevm.createInstance();
  } else {
    await fhevm.initializeCLIApi();
  }
  const [player] = await ethers.getSigners();
  if (!player) {
    throw new Error("No signer available. Check DEPLOYER_PRIVATE_KEY / network config.");
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const deploymentFile = path.resolve(__dirname, `../deployments/${network.name}.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Missing deployment file ${deploymentFile}. Run deploy script first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const chipAddr: string = deployment.dodChipAddress;
  const arenaAddr: string = deployment.dodSnakeArenaAddress;

  console.log(`Running smoke test on ${network.name} (chainId=${chainId}) as ${player.address}`);
  const chip = await ethers.getContractAt("DodChipERC7984", chipAddr, player);
  const arena = await ethers.getContractAt("DodSnakeArena", arenaAddr, player);

  // 1. Check faucet cooldown & claim if ready
  const cooldown = await chip.faucetCooldownRemaining(player.address);
  if (cooldown === 0n) {
    console.log("1) Claiming 100 cDOD from DodChipERC7984 faucet...");
    const tx = await chip.claimFaucet();
    await tx.wait();
  } else {
    console.log(`1) Faucet cooldown active (${cooldown}s remaining), skipping claim.`);
  }

  // 2. Ensure operator approval
  const isOp = await chip.isOperator(player.address, arenaAddr);
  if (!isOp) {
    console.log("2) Approving DodSnakeArena as ERC-7984 operator...");
    const until = Math.floor(Date.now() / 1000) + 86400 * 7;
    const tx = await chip.setOperator(arenaAddr, until);
    await tx.wait();
  }

  // 3. Create a Solo Sprint Match with confidential 10 cDOD stake
  console.log("3) Creating Solo Sprint Match with encrypted 10 cDOD stake...");
  const encStake = await fhevm.createEncryptedInput(arenaAddr, player.address).add64(10_000_000n).encrypt();
  const txCreate = await arena.createMatch(1, 1, chipAddr, encStake.handles[0], encStake.inputProof);
  await txCreate.wait();
  const matchId = (await arena.nextMatchId()) - 1n;
  console.log(`   Match #${matchId} created & activated!`);

  // 4. Decrypt Secret Mission
  const encState = await arena.getPlayerEncryptedState(matchId, player.address);
  const mission = await fhevm.userDecryptEuint(FhevmType.euint8, encState.encryptedMission, arenaAddr, player);
  console.log(`4) Decrypted private Secret Mission ID: ${mission}`);

  // 5. Plant encrypted Secret Trap on tile 12 (kind 2 = Ink Snare)
  console.log("5) Planting encrypted Secret Trap...");
  const encTrap = await fhevm.createEncryptedInput(arenaAddr, player.address).add8(12).add8(2).encrypt();
  await (await arena.plantSecretTrap(matchId, encTrap.handles[0], encTrap.handles[1], encTrap.inputProof)).wait();

  // 6. Roll verifiable FHE Dice + finalize via KMS proof
  console.log("6) Rolling verifiable onchain FHE dice...");
  await (await arena.requestDiceRoll(matchId)).wait();
  const pending = await arena.getMatchPendingHandles(matchId);
  const rollDec = await fhevm.publicDecrypt([pending[0]]);
  const clearDie = Number(rollDec.clearValues[pending[0] as `0x${string}`]);
  console.log(`   Verifiable FHE Die rolled: ${clearDie}`);
  await (await arena.finalizeDiceRoll(matchId, clearDie, rollDec.decryptionProof)).wait();

  const summaryAfter = await arena.getMatchSummary(matchId);
  if (Number(summaryAfter.pendingAction) === 2) {
    const p2 = await arena.getMatchPendingHandles(matchId);
    const trapDec = await fhevm.publicDecrypt([p2[1], p2[2]]);
    const trapKind = Number(trapDec.clearValues[p2[1] as `0x${string}`]);
    const shieldUsed = Number(trapDec.clearValues[p2[2] as `0x${string}`]);
    await (await arena.finalizeTileCheck(matchId, trapKind, shieldUsed, trapDec.decryptionProof)).wait();
    console.log(`   Homomorphic trap/shield check finalized (trap=${trapKind}, shield=${shieldUsed}).`);
  }

  const pub = await arena.getPlayerPublicState(matchId, player.address);
  console.log(`Smoke test complete! Player position=${pub.position}, stars=${pub.stars}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
