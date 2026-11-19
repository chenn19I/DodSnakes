import { ethers, fhevm, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  await fhevm.initializeCLIApi();
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account configured. Set DEPLOYER_PRIVATE_KEY in .env or run `npm run wallets:gen --workspace=@doodle-dash/contracts`."
    );
  }

  const chain = await ethers.provider.getNetwork();
  const chainId = Number(chain.chainId);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Deploying DodSnake Confidential contracts to ${network.name} (chainId=${chainId})...`);
  console.log(`Deployer: ${deployer.address} (balance: ${ethers.formatEther(bal)} ETH)`);

  if (chainId === 11155111 && bal === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has 0 Sepolia ETH. Fund it via a Sepolia faucet first (e.g. https://cloud.google.com/application/web3/faucet/ethereum/sepolia or https://sepolia-faucet.pk910.de/).`
    );
  }

  const ChipFactory = await ethers.getContractFactory("DodChipERC7984");
  const chip = await ChipFactory.deploy();
  await chip.waitForDeployment();
  const chipAddress = await chip.getAddress();
  console.log(`DodChipERC7984 deployed at: ${chipAddress}`);

  const ArenaFactory = await ethers.getContractFactory("DodSnakeArena");
  const arena = await ArenaFactory.deploy(chipAddress);
  await arena.waitForDeployment();
  const arenaAddress = await arena.getAddress();
  console.log(`DodSnakeArena deployed at:  ${arenaAddress}`);

  // Persist deployment metadata + ABIs for frontend consumption
  const deploymentsDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const deploymentPayload = {
    network: network.name,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    dodChipAddress: chipAddress,
    dodSnakeArenaAddress: arenaAddress,
    sepoliaCUsdt: "0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50",
    sepoliaCUsdc: "0xe978F22157048E5DB8E5d07971376e86671672B2",
    wrappersRegistry: "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
  };
  fs.writeFileSync(
    path.join(deploymentsDir, `${network.name}.json`),
    JSON.stringify(deploymentPayload, null, 2)
  );

  // Sync into client web3 config
  const clientWeb3Dir = path.resolve(__dirname, "../../../apps/client/src/web3");
  fs.mkdirSync(clientWeb3Dir, { recursive: true });
  const clientDeploymentsPath = path.join(clientWeb3Dir, "deployments.json");
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(clientDeploymentsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(clientDeploymentsPath, "utf8"));
    } catch {
      existing = {};
    }
  }
  existing[String(chainId)] = deploymentPayload;
  fs.writeFileSync(clientDeploymentsPath, JSON.stringify(existing, null, 2));

  // Export compiled ABIs for frontend viem/ethers usage
  const chipArtifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../artifacts/contracts/DodChipERC7984.sol/DodChipERC7984.json"),
      "utf8"
    )
  );
  const arenaArtifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../artifacts/contracts/DodSnakeArena.sol/DodSnakeArena.json"),
      "utf8"
    )
  );
  const abisTsPath = path.join(clientWeb3Dir, "abis.ts");
  fs.writeFileSync(
    abisTsPath,
    [
      "// Auto-generated from Hardhat artifacts — do not hand-edit.",
      `export const DOD_CHIP_ABI = ${JSON.stringify(chipArtifact.abi, null, 2)} as const;`,
      `export const DOD_SNAKE_ARENA_ABI = ${JSON.stringify(arenaArtifact.abi, null, 2)} as const;`,
      "",
    ].join("\n")
  );

  console.log("\nDeployment saved to:");
  console.log(`  - ${path.join(deploymentsDir, `${network.name}.json`)}`);
  console.log(`  - ${clientDeploymentsPath}`);
  if (chainId === 11155111) {
    console.log("\nVerify on Etherscan:");
    console.log(`  npx hardhat verify --network sepolia ${chipAddress}`);
    console.log(`  npx hardhat verify --network sepolia ${arenaAddress} ${chipAddress}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
