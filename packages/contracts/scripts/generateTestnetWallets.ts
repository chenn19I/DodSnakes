import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  const randomWallet = ethers.Wallet.createRandom();
  const mnemonicPhrase = randomWallet.mnemonic?.phrase;
  if (!mnemonicPhrase) {
    throw new Error("Failed to generate BIP-39 mnemonic");
  }

  const rootMnemonic = ethers.Mnemonic.fromPhrase(mnemonicPhrase);
  const deployerNode = ethers.HDNodeWallet.fromMnemonic(rootMnemonic, "m/44'/60'/0'/0/0");

  const playerWallets: Array<{
    index: number;
    label: string;
    path: string;
    address: string;
    privateKey: string;
  }> = [];

  for (let i = 1; i <= 10; i++) {
    const hdPath = `m/44'/60'/0'/0/${i}`;
    const node = ethers.HDNodeWallet.fromMnemonic(rootMnemonic, hdPath);
    playerWallets.push({
      index: i,
      label: `Sepolia Testnet Player #${i}`,
      path: hdPath,
      address: node.address,
      privateKey: node.privateKey,
    });
  }

  const contractsRoot = path.resolve(__dirname, "..");
  const privateJsonPath = path.join(contractsRoot, "testnet-wallets.local.json");
  const envLocalPath = path.join(contractsRoot, ".env.testnet.local");
  const publicJsonPath = path.join(contractsRoot, "testnet-wallets.public.json");

  fs.writeFileSync(
    privateJsonPath,
    JSON.stringify(
      {
        network: "sepolia",
        chainId: 11155111,
        generatedAt: new Date().toISOString(),
        mnemonic: mnemonicPhrase,
        deployer: {
          label: "Sepolia Deployer",
          path: "m/44'/60'/0'/0/0",
          address: deployerNode.address,
          privateKey: deployerNode.privateKey,
        },
        players: playerWallets,
      },
      null,
      2
    )
  );

  const envLines = [
    "# Auto-generated local Sepolia testnet credentials (GITIGNORED - NEVER COMMIT)",
    `SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com`,
    `DEPLOYER_PRIVATE_KEY=${deployerNode.privateKey}`,
    `DEPLOYER_ADDRESS=${deployerNode.address}`,
    `TESTNET_MNEMONIC="${mnemonicPhrase}"`,
    ...playerWallets.map((w) => `TESTNET_PLAYER_${w.index}_ADDRESS=${w.address}`),
  ];
  fs.writeFileSync(envLocalPath, envLines.join("\n") + "\n");

  // Public-safe directory (addresses only, zero private keys)
  fs.writeFileSync(
    publicJsonPath,
    JSON.stringify(
      {
        network: "sepolia",
        chainId: 11155111,
        generatedAt: new Date().toISOString(),
        deployerAddress: deployerNode.address,
        testAccounts: playerWallets.map((w) => ({
          index: w.index,
          label: w.label,
          path: w.path,
          address: w.address,
        })),
        faucets: [
          "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
          "https://sepolia-faucet.pk910.de/",
          "https://www.alchemy.com/faucets/ethereum-sepolia",
          "https://faucets.chain.link/sepolia",
          "https://faucet.quicknode.com/ethereum/sepolia",
          "https://www.infura.io/faucet/sepolia",
          "https://portal.cdp.coinbase.com/products/faucet",
          "https://moralis.com/faucets/",
          "https://thirdweb.com/sepolia",
          "https://tokentool.bitbond.com/faucet/ethereum-sepolia",
          "https://learnweb3.io/faucets/sepolia",
        ],
      },
      null,
      2
    )
  );

  console.log("=== Generated Sepolia Deployer + 10 Testnet Player Accounts ===");
  console.log(`Deployer Address (fund with Sepolia ETH): ${deployerNode.address}`);
  for (const w of playerWallets) {
    console.log(`  [${w.index}] ${w.address}`);
  }
  console.log(`\nPrivate keys stored ONLY in gitignored files:\n  - ${privateJsonPath}\n  - ${envLocalPath}`);
  console.log(`Public address list saved to:\n  - ${publicJsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
