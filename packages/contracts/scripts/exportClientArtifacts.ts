import * as fs from "node:fs";
import * as path from "node:path";

function main() {
  const contractsRoot = path.resolve(__dirname, "..");
  const clientWeb3Dir = path.resolve(contractsRoot, "../../apps/client/src/web3");
  fs.mkdirSync(clientWeb3Dir, { recursive: true });

  const chipArtifact = JSON.parse(
    fs.readFileSync(
      path.join(contractsRoot, "artifacts/contracts/DodChipERC7984.sol/DodChipERC7984.json"),
      "utf8"
    )
  );
  const arenaArtifact = JSON.parse(
    fs.readFileSync(
      path.join(contractsRoot, "artifacts/contracts/DodSnakeArena.sol/DodSnakeArena.json"),
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

  const deploymentsPath = path.join(clientWeb3Dir, "deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    fs.writeFileSync(
      deploymentsPath,
      JSON.stringify(
        {
          "11155111": {
            network: "sepolia",
            chainId: 11155111,
            deployedAt: null,
            deployer: "0xb2e53D52d38bc87Aaf7E3C81d121dfBD845E9B7D",
            dodChipAddress: "",
            dodSnakeArenaAddress: "",
            sepoliaCUsdt: "0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50",
            sepoliaCUsdc: "0xe978F22157048E5DB8E5d07971376e86671672B2",
            wrappersRegistry: "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
          },
        },
        null,
        2
      )
    );
  }

  console.log(`Exported frontend ABIs to ${abisTsPath}`);
}

main();
