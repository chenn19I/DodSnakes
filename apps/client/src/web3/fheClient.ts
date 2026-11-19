import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  formatEther,
  http,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { hardhat as viemHardhat, sepolia as viemSepolia } from 'viem/chains';
import { ZamaSDK, indexedDBStorage } from '@zama-fhe/sdk';
import { createConfig as createZamaConfig } from '@zama-fhe/sdk/viem';
import { hardhat as fheHardhat, sepolia as fheSepolia } from '@zama-fhe/sdk/chains';
import { web } from '@zama-fhe/sdk/web';
import deploymentsRaw from './deployments.json';
import { DOD_CHIP_ABI, DOD_SNAKE_ARENA_ABI } from './abis.js';
import { PROTOCOL_SEPOLIA_ADDRESSES, SEPOLIA_CHAIN_ID } from './faucets.js';

export interface DeploymentAddresses {
  chipAddress: Address | '';
  arenaAddress: Address | '';
}

export interface FheProofLogEntry {
  id: string;
  ts: number;
  kind: 'encrypt' | 'user_decrypt' | 'public_decrypt' | 'tx' | 'info';
  title: string;
  detail: string;
  handle?: string;
  txHash?: string;
}

export interface OnchainMatchSnapshot {
  matchId: bigint;
  host: Address;
  stakeToken: Address;
  boardSize: number;
  maxPlayers: number;
  playerCount: number;
  turnIndex: number;
  turnNumber: number;
  status: number; // 0 Lobby, 1 Active, 2 Finished
  pendingAction: number; // 0 None, 1 Dice, 2 Trap, 3 Duel, 4 Mission
  winner: Address;
  payoutClaimed: boolean;
  trapCount: number;
  players: Array<{
    address: Address;
    position: number;
    stars: number;
    laddersClimbed: number;
    snakesDodged: number;
    duelWins: number;
    trapsPlanted: number;
    missionClaimed: boolean;
  }>;
  mySecret?: {
    missionHandle: Hex;
    shieldsHandle: Hex;
    trapChargesHandle: Hex;
    stakeHandle: Hex;
    missionId?: number;
    shields?: number;
    trapCharges?: number;
    stakeMicro?: bigint;
  };
  myPlantedTrapTiles: number[];
  duel?: {
    active: boolean;
    challenger: Address;
    opponent: Address;
    challengerCommitted: boolean;
    opponentCommitted: boolean;
    pendingResultHandle: Hex;
  };
}

const STORAGE_CUSTOM_ADDR_KEY = 'dodsnake_custom_contracts_v1';
const ZERO_HANDLE: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';
const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

type RawDeployMap = Record<
  string,
  { dodChipAddress?: string; dodSnakeArenaAddress?: string }
>;

export function resolveConfiguredAddresses(chainId: number = SEPOLIA_CHAIN_ID): DeploymentAddresses {
  const envChip = (import.meta.env.VITE_DOD_CHIP_ADDRESS || '').trim();
  const envArena = (import.meta.env.VITE_DOD_ARENA_ADDRESS || '').trim();

  let customChip = '';
  let customArena = '';
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_ADDR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { chip?: string; arena?: string };
      customChip = (parsed.chip || '').trim();
      customArena = (parsed.arena || '').trim();
    }
  } catch {
    // ignore storage failures
  }

  const map = deploymentsRaw as RawDeployMap;
  const entry = map[String(chainId)] || map[String(SEPOLIA_CHAIN_ID)] || {};

  const chip = customChip || envChip || entry.dodChipAddress || '';
  const arena = customArena || envArena || entry.dodSnakeArenaAddress || '';

  return {
    chipAddress: /^0x[a-fA-F0-9]{40}$/.test(chip) ? (chip as Address) : '',
    arenaAddress: /^0x[a-fA-F0-9]{40}$/.test(arena) ? (arena as Address) : '',
  };
}

export function saveCustomAddresses(chip: string, arena: string): void {
  try {
    localStorage.setItem(
      STORAGE_CUSTOM_ADDR_KEY,
      JSON.stringify({ chip: chip.trim(), arena: arena.trim() }),
    );
  } catch {
    // ignore storage failures
  }
}

export class FheArenaClient {
  private ethereum: EIP1193Provider | null = null;
  private publicClient: PublicClient | null = null;
  private walletClient: WalletClient | null = null;
  private sdk: ZamaSDK | null = null;
  private account: Address | null = null;
  private chainId = SEPOLIA_CHAIN_ID;
  private readonly logs: FheProofLogEntry[] = [];
  private onLogCallback?: (logs: FheProofLogEntry[]) => void;

  public setLogListener(cb: (logs: FheProofLogEntry[]) => void): void {
    this.onLogCallback = cb;
  }

  public getLogs(): FheProofLogEntry[] {
    return [...this.logs];
  }

  private pushLog(entry: Omit<FheProofLogEntry, 'id' | 'ts'>): void {
    this.logs.unshift({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      ...entry,
    });
    if (this.logs.length > 40) this.logs.length = 40;
    this.onLogCallback?.([...this.logs]);
  }

  public getAccount(): Address | null {
    return this.account;
  }

  public getChainId(): number {
    return this.chainId;
  }

  public isConnected(): boolean {
    return Boolean(this.account && this.walletClient && this.publicClient);
  }

  public hasInjectedWallet(): boolean {
    return typeof window !== 'undefined' && Boolean((window as { ethereum?: EIP1193Provider }).ethereum);
  }

  public async connectWallet(): Promise<{
    address: Address;
    chainId: number;
    ethBalance: string;
  }> {
    const eth = (window as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) {
      throw new Error('MetaMask / EIP-1193 browser wallet not detected.');
    }
    this.ethereum = eth;

    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    if (!accounts || accounts.length === 0) {
      throw new Error('No wallet account authorized.');
    }
    this.account = accounts[0] as Address;

    let hexChain = (await eth.request({ method: 'eth_chainId' })) as string;
    let currentChain = Number.parseInt(hexChain, 16);

    if (currentChain !== SEPOLIA_CHAIN_ID && currentChain !== 31337) {
      try {
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
        currentChain = SEPOLIA_CHAIN_ID;
      } catch (err: unknown) {
        const code = (err as { code?: number })?.code;
        if (code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0xaa36a7',
                chainName: 'Ethereum Sepolia',
                nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [
                  import.meta.env.VITE_SEPOLIA_RPC_URL ||
                    'https://ethereum-sepolia-rpc.publicnode.com',
                ],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              },
            ],
          });
          currentChain = SEPOLIA_CHAIN_ID;
        } else {
          throw err;
        }
      }
    }

    this.chainId = currentChain;
    const viemChain = currentChain === 31337 ? viemHardhat : viemSepolia;
    const rpcTransport =
      currentChain === 31337
        ? http('http://127.0.0.1:8545')
        : custom(eth);

    this.publicClient = createPublicClient({
      chain: viemChain,
      transport: rpcTransport,
    }) as PublicClient;

    this.walletClient = createWalletClient({
      account: this.account,
      chain: viemChain,
      transport: custom(eth),
    });

    this.sdk?.terminate();
    const cfg = createZamaConfig({
      chains: [fheSepolia, fheHardhat],
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      ethereum: eth,
      relayers: {
        [fheSepolia.id]: web({ offloadWorker: '/encrypt.worker.js' }),
        [fheHardhat.id]: web({ offloadWorker: '/encrypt.worker.js' }),
      },
      storage: indexedDBStorage,
    });
    this.sdk = new ZamaSDK(cfg);

    const balWei = await this.publicClient.getBalance({ address: this.account });
    const ethBalance = Number(formatEther(balWei)).toFixed(4);
    this.pushLog({
      kind: 'info',
      title: 'Wallet Connected',
      detail: `${this.account.slice(0, 6)}...${this.account.slice(-4)} on Chain ${this.chainId} (${ethBalance} ETH)`,
    });

    return {
      address: this.account,
      chainId: this.chainId,
      ethBalance,
    };
  }

  private requireSdk(): {
    sdk: ZamaSDK;
    publicClient: PublicClient;
    walletClient: WalletClient;
    account: Address;
    addrs: DeploymentAddresses;
  } {
    if (!this.sdk || !this.publicClient || !this.walletClient || !this.account) {
      throw new Error('Connect wallet first.');
    }
    const addrs = resolveConfiguredAddresses(this.chainId);
    if (!addrs.chipAddress || !addrs.arenaAddress) {
      throw new Error(
        'Contract addresses not configured for this network. Deploy to Sepolia or paste addresses in Contract Setup.',
      );
    }
    return {
      sdk: this.sdk,
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      account: this.account,
      addrs,
    };
  }

  public async readChipStatus(tokenAddress?: Address): Promise<{
    encryptedBalanceHandle: Hex;
    cooldownSeconds: bigint;
    isArenaOperator: boolean;
  }> {
    const { publicClient, account, addrs } = this.requireSdk();
    const targetToken = (tokenAddress || addrs.chipAddress) as Address;
    const isCustomDod = targetToken.toLowerCase() === (addrs.chipAddress as string).toLowerCase();

    const [encBal, cooldown, isOp] = await Promise.all([
      publicClient.readContract({
        address: targetToken,
        abi: DOD_CHIP_ABI,
        functionName: 'confidentialBalanceOf',
        args: [account],
      }),
      isCustomDod
        ? publicClient.readContract({
            address: targetToken,
            abi: DOD_CHIP_ABI,
            functionName: 'faucetCooldownRemaining',
            args: [account],
          })
        : Promise.resolve(0n),
      publicClient.readContract({
        address: targetToken,
        abi: DOD_CHIP_ABI,
        functionName: 'isOperator',
        args: [account, addrs.arenaAddress as Address],
      }),
    ]);

    return {
      encryptedBalanceHandle: encBal as Hex,
      cooldownSeconds: cooldown as bigint,
      isArenaOperator: Boolean(isOp),
    };
  }

  public async decryptChipBalance(
    tokenAddress?: Address,
    symbol: string = 'cDOD',
  ): Promise<{ handle: Hex; clearMicro: bigint }> {
    const { sdk, publicClient, account, addrs } = this.requireSdk();
    const targetToken = (tokenAddress || addrs.chipAddress) as Address;
    const handle = (await publicClient.readContract({
      address: targetToken,
      abi: DOD_CHIP_ABI,
      functionName: 'confidentialBalanceOf',
      args: [account],
    })) as Hex;

    if (!handle || handle === ZERO_HANDLE) {
      return { handle: ZERO_HANDLE, clearMicro: 0n };
    }

    const res = await sdk.decryption.decryptValues([
      { encryptedValue: handle, contractAddress: targetToken },
    ]);
    const clearMicro = BigInt(res[handle] ?? 0);
    this.pushLog({
      kind: 'user_decrypt',
      title: `ERC-7984 ${symbol} Balance Decrypted (EIP-712)`,
      detail: `${(Number(clearMicro) / 1e6).toFixed(2)} ${symbol}`,
      handle,
    });
    return { handle, clearMicro };
  }

  public async claimChipFaucet(): Promise<Hex> {
    const { publicClient, walletClient, account, addrs } = this.requireSdk();
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: addrs.chipAddress as Address,
      abi: DOD_CHIP_ABI,
      functionName: 'claimFaucet',
    });
    await publicClient.waitForTransactionReceipt({ hash });
    this.pushLog({
      kind: 'tx',
      title: 'Claimed 100 cDOD Faucet',
      detail: 'Encrypted ERC-7984 chips minted onchain.',
      txHash: hash,
    });
    return hash;
  }

  public async approveArenaOperator(
    tokenAddress?: Address,
    symbol: string = 'cDOD',
  ): Promise<Hex> {
    const { publicClient, walletClient, account, addrs } = this.requireSdk();
    const targetToken = (tokenAddress || addrs.chipAddress) as Address;
    const until = Math.floor(Date.now() / 1000) + 86400 * 30;
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: targetToken,
      abi: DOD_CHIP_ABI,
      functionName: 'setOperator',
      args: [addrs.arenaAddress as Address, until],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    this.pushLog({
      kind: 'tx',
      title: `ERC-7984 ${symbol} Operator Approved`,
      detail: 'DodSnakeArena authorized for confidential pot transfers.',
      txHash: hash,
    });
    return hash;
  }

  public async createMatch(params: {
    boardMode: 0 | 1;
    maxPlayers: number;
    useChipStake: boolean;
    stakeWholeTokens: number;
    stakeTokenAddress?: Address;
    stakeSymbol?: string;
  }): Promise<{ matchId: bigint; txHash: Hex }> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const stakeMicro = params.useChipStake ? BigInt(Math.max(0, Math.round(params.stakeWholeTokens * 1e6))) : 0n;
    const stakeToken: Address = params.useChipStake
      ? ((params.stakeTokenAddress || addrs.chipAddress) as Address)
      : ZERO_ADDRESS;
    const symbol = params.stakeSymbol || 'cDOD';

    const enc = await sdk.encrypt({
      values: [{ type: 'euint64', value: stakeMicro }],
      contractAddress: addrs.arenaAddress as Address,
      userAddress: account,
    });
    this.pushLog({
      kind: 'encrypt',
      title: 'Encrypted Wager Input (euint64)',
      detail: `${params.useChipStake ? params.stakeWholeTokens : 0} ${symbol}`,
      handle: enc.encryptedValues[0],
    });

    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: addrs.arenaAddress as Address,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'createMatch',
      args: [
        params.boardMode,
        params.maxPlayers,
        stakeToken,
        enc.encryptedValues[0],
        enc.inputProof,
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    let matchId = 0n;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: DOD_SNAKE_ARENA_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'MatchCreated') {
          matchId = (decoded.args as { matchId: bigint }).matchId;
          break;
        }
      } catch {
        // non-matching log
      }
    }
    if (matchId === 0n) {
      const next = (await publicClient.readContract({
        address: addrs.arenaAddress as Address,
        abi: DOD_SNAKE_ARENA_ABI,
        functionName: 'nextMatchId',
      })) as bigint;
      matchId = next > 1n ? next - 1n : 1n;
    }

    this.pushLog({
      kind: 'tx',
      title: `Created Match #${matchId}`,
      detail: `${params.boardMode === 1 ? 'Sprint 30' : 'Classic 100'} • ${params.maxPlayers === 1 ? 'Solo vs FHE House' : `${params.maxPlayers}P`}`,
      txHash: hash,
    });
    return { matchId, txHash: hash };
  }

  public async joinMatch(
    matchId: bigint,
    useChipStake: boolean,
    stakeWholeTokens: number,
  ): Promise<Hex> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const stakeMicro = useChipStake ? BigInt(Math.max(0, Math.round(stakeWholeTokens * 1e6))) : 0n;
    const enc = await sdk.encrypt({
      values: [{ type: 'euint64', value: stakeMicro }],
      contractAddress: addrs.arenaAddress as Address,
      userAddress: account,
    });

    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: addrs.arenaAddress as Address,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'joinMatch',
      args: [matchId, enc.encryptedValues[0], enc.inputProof],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    this.pushLog({
      kind: 'tx',
      title: `Joined Match #${matchId}`,
      detail: 'Encrypted Secret Mission assigned onchain.',
      txHash: hash,
    });
    return hash;
  }

  public async fetchMatchSnapshot(matchId: bigint, decryptSecrets = false): Promise<OnchainMatchSnapshot> {
    const { sdk, publicClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;

    const [summary, playersAddrs, duelState] = await Promise.all([
      publicClient.readContract({
        address: arenaAddr,
        abi: DOD_SNAKE_ARENA_ABI,
        functionName: 'getMatchSummary',
        args: [matchId],
      }) as Promise<readonly [Address, Address, number, number, number, number, number, number, number, Address, boolean, number]>,
      publicClient.readContract({
        address: arenaAddr,
        abi: DOD_SNAKE_ARENA_ABI,
        functionName: 'getMatchPlayers',
        args: [matchId],
      }) as Promise<readonly Address[]>,
      publicClient.readContract({
        address: arenaAddr,
        abi: DOD_SNAKE_ARENA_ABI,
        functionName: 'getBlindDuelState',
        args: [matchId],
      }) as Promise<readonly [boolean, Address, Address, boolean, boolean, Hex]>,
    ]);

    const players = await Promise.all(
      playersAddrs.map(async (addr) => {
        const pub = (await publicClient.readContract({
          address: arenaAddr,
          abi: DOD_SNAKE_ARENA_ABI,
          functionName: 'getPlayerPublicState',
          args: [matchId, addr],
        })) as readonly [number, number, number, number, number, number, boolean];
        return {
          address: addr,
          position: Number(pub[0]),
          stars: Number(pub[1]),
          laddersClimbed: Number(pub[2]),
          snakesDodged: Number(pub[3]),
          duelWins: Number(pub[4]),
          trapsPlanted: Number(pub[5]),
          missionClaimed: Boolean(pub[6]),
        };
      }),
    );

    const inMatch = playersAddrs.some((a) => a.toLowerCase() === account.toLowerCase());
    let mySecret: OnchainMatchSnapshot['mySecret'];
    const myPlantedTrapTiles: number[] = [];

    if (inMatch) {
      const encState = (await publicClient.readContract({
        address: arenaAddr,
        abi: DOD_SNAKE_ARENA_ABI,
        functionName: 'getPlayerEncryptedState',
        args: [matchId, account],
      })) as readonly [Hex, Hex, Hex, Hex];

      mySecret = {
        missionHandle: encState[0],
        shieldsHandle: encState[1],
        trapChargesHandle: encState[2],
        stakeHandle: encState[3],
      };

      if (decryptSecrets) {
        const toDecrypt = [encState[0], encState[1], encState[2], encState[3]]
          .filter((h) => h && h !== ZERO_HANDLE)
          .map((encryptedValue) => ({ encryptedValue, contractAddress: arenaAddr }));

        // Also include traps owned by caller so ONLY caller sees them on the 3D board!
        const trapHandles: Array<{ idx: number; tileHandle: Hex }> = [];
        const trapCount = Number(summary[11]);
        for (let i = 0; i < trapCount; i++) {
          const trap = (await publicClient.readContract({
            address: arenaAddr,
            abi: DOD_SNAKE_ARENA_ABI,
            functionName: 'getSecretTrap',
            args: [matchId, i],
          })) as readonly [Address, Hex, Hex];
          if (trap[0].toLowerCase() === account.toLowerCase() && trap[1] !== ZERO_HANDLE) {
            trapHandles.push({ idx: i, tileHandle: trap[1] });
            toDecrypt.push({ encryptedValue: trap[1], contractAddress: arenaAddr });
          }
        }

        if (toDecrypt.length > 0) {
          const dec = await sdk.decryption.decryptValues(toDecrypt);
          mySecret.missionId = Number(dec[encState[0]] ?? 0);
          mySecret.shields = Number(dec[encState[1]] ?? 0);
          mySecret.trapCharges = Number(dec[encState[2]] ?? 0);
          mySecret.stakeMicro = BigInt(dec[encState[3]] ?? 0);
          for (const th of trapHandles) {
            const t = Number(dec[th.tileHandle] ?? 0);
            if (t >= 2) myPlantedTrapTiles.push(t);
          }
          this.pushLog({
            kind: 'user_decrypt',
            title: 'Decrypted Private Tactical State',
            detail: `Mission #${mySecret.missionId} • Shields ${mySecret.shields} • Traps ${mySecret.trapCharges}`,
            handle: encState[0],
          });
        }
      }
    }

    return {
      matchId,
      host: summary[0],
      stakeToken: summary[1],
      boardSize: Number(summary[2]),
      maxPlayers: Number(summary[3]),
      playerCount: Number(summary[4]),
      turnIndex: Number(summary[5]),
      turnNumber: Number(summary[6]),
      status: Number(summary[7]),
      pendingAction: Number(summary[8]),
      winner: summary[9],
      payoutClaimed: Boolean(summary[10]),
      trapCount: Number(summary[11]),
      players,
      mySecret,
      myPlantedTrapTiles,
      duel: duelState[0]
        ? {
            active: Boolean(duelState[0]),
            challenger: duelState[1],
            opponent: duelState[2],
            challengerCommitted: Boolean(duelState[3]),
            opponentCommitted: Boolean(duelState[4]),
            pendingResultHandle: duelState[5],
          }
        : undefined,
    };
  }

  public async readMatchLobbyInfo(matchId: bigint): Promise<{
    stakeToken: Address;
    boardSize: number;
    maxPlayers: number;
    playerCount: number;
    status: number;
  }> {
    const { publicClient, addrs } = this.requireSdk();
    const summary = (await publicClient.readContract({
      address: addrs.arenaAddress as Address,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getMatchSummary',
      args: [matchId],
    })) as readonly [Address, Address, number, number, number, number, number, number, number, Address, boolean, number];
    return {
      stakeToken: summary[1],
      boardSize: Number(summary[2]),
      maxPlayers: Number(summary[3]),
      playerCount: Number(summary[4]),
      status: Number(summary[7]),
    };
  }

  public async startMatchEarly(matchId: bigint): Promise<Hex> {
    const { publicClient, walletClient, account, addrs } = this.requireSdk();
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: addrs.arenaAddress as Address,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'startMatch',
      args: [matchId],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    this.pushLog({
      kind: 'tx',
      title: `Started Match #${matchId} Early`,
      detail: 'Host activated lobby & spawned hidden Golden Warp shortcut.',
      txHash: hash,
    });
    return hash;
  }

  public async plantSecretTrap(matchId: bigint, tileId: number, kind: number): Promise<Hex> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;
    const enc = await sdk.encrypt({
      values: [
        { type: 'euint8', value: BigInt(tileId) },
        { type: 'euint8', value: BigInt(kind) },
      ],
      contractAddress: arenaAddr,
      userAddress: account,
    });
    this.pushLog({
      kind: 'encrypt',
      title: 'Encrypted Secret Trap (euint8 x2)',
      detail: `Hidden tile & trap type encrypted with ZKPoK`,
      handle: enc.encryptedValues[0],
    });

    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'plantSecretTrap',
      args: [matchId, enc.encryptedValues[0], enc.encryptedValues[1], enc.inputProof],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    this.pushLog({
      kind: 'tx',
      title: 'Secret Trap Planted Onchain',
      detail: 'Only you can decrypt its tile coordinate.',
      txHash: hash,
    });
    return hash;
  }

  public async buyEncryptedMysteryItem(matchId: bigint): Promise<Hex> {
    const { publicClient, walletClient, account, addrs } = this.requireSdk();
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: addrs.arenaAddress as Address,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'buyEncryptedMysteryItem',
      args: [matchId],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    this.pushLog({
      kind: 'tx',
      title: 'Mystery Item Rolled (Encrypted)',
      detail: 'Decrypt your bag to see if you won Shield or Trap Charge.',
      txHash: hash,
    });
    return hash;
  }

  public async castSecretBrake(matchId: bigint, targetSeat: number): Promise<Hex> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;
    const enc = await sdk.encrypt({
      values: [{ type: 'euint8', value: BigInt(targetSeat) }],
      contractAddress: arenaAddr,
      userAddress: account,
    });
    this.pushLog({
      kind: 'encrypt',
      title: 'Encrypted Rival Brake (euint8 seat)',
      detail: `Target seat encrypted; next rival dice roll capped to 1..3.`,
      handle: enc.encryptedValues[0],
    });

    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'castSecretBrake',
      args: [matchId, enc.encryptedValues[0], enc.inputProof],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    this.pushLog({
      kind: 'tx',
      title: 'Secret Rival Brake Cast Onchain',
      detail: 'Neither victim nor observers can tell who is cursed.',
      txHash: hash,
    });
    return hash;
  }

  private extractRollEventFields(
    logs: ReadonlyArray<{ data: Hex; topics: readonly Hex[] | [`0x${string}`, ...`0x${string}`[]] }>,
    acc: {
      fromPos: number;
      landedPos: number;
      finalPos: number;
      trapTriggered: number;
      shieldBlocked: boolean;
      ladderTo: number;
      snakeTo: number;
    },
  ): void {
    for (const log of logs) {
      if (log.topics.length === 0) continue;
      try {
        const decoded = decodeEventLog({
          abi: DOD_SNAKE_ARENA_ABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        if (decoded.eventName === 'DiceMoved') {
          const args = decoded.args as { fromPos?: number; toPos?: number };
          acc.fromPos = Number(args.fromPos ?? acc.fromPos);
          acc.landedPos = Number(args.toPos ?? acc.landedPos);
          acc.finalPos = acc.landedPos;
        } else if (decoded.eventName === 'TileResolved') {
          const args = decoded.args as {
            finalPos?: number;
            trapKindTriggered?: number;
            shieldBlockedSnake?: boolean;
            ladderTo?: number;
            snakeTo?: number;
          };
          acc.finalPos = Number(args.finalPos ?? acc.finalPos);
          acc.trapTriggered = Number(args.trapKindTriggered ?? acc.trapTriggered);
          acc.shieldBlocked = Boolean(args.shieldBlockedSnake ?? acc.shieldBlocked);
          acc.ladderTo = Number(args.ladderTo ?? acc.ladderTo);
          acc.snakeTo = Number(args.snakeTo ?? acc.snakeTo);
        }
      } catch {
        // non-matching event
      }
    }
  }

  private async _finalizeTrapCheckFromPending(
    matchId: bigint,
    acc: {
      fromPos: number;
      landedPos: number;
      finalPos: number;
      trapTriggered: number;
      shieldBlocked: boolean;
      ladderTo: number;
      snakeTo: number;
    },
    onStage?: (stage: 'requesting' | 'decrypting_dice' | 'verifying_dice' | 'decrypting_trap' | 'verifying_trap') => void,
  ): Promise<Hex> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;
    const pendingTrap = (await publicClient.readContract({
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getMatchPendingHandles',
      args: [matchId],
    })) as readonly [Hex, Hex, Hex, Hex, Hex, Address, number];
    const trapHandle = pendingTrap[1];
    const shieldHandle = pendingTrap[2];
    if (acc.landedPos === 1 && Number(pendingTrap[6]) >= 2) {
      acc.landedPos = Number(pendingTrap[6]);
      acc.fromPos = acc.landedPos;
      acc.finalPos = acc.landedPos;
    }

    onStage?.('decrypting_trap');
    const trapDec = await sdk.decryption.decryptPublicValues([trapHandle, shieldHandle]);
    acc.trapTriggered = Number(trapDec.clearValues[trapHandle] ?? 0);
    const clearShield = Number(trapDec.clearValues[shieldHandle] ?? 0);
    acc.shieldBlocked = clearShield === 1;

    onStage?.('verifying_trap');
    const latestTx = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'finalizeTileCheck',
      args: [matchId, acc.trapTriggered, clearShield, trapDec.decryptionProof],
    });
    const trapReceipt = await publicClient.waitForTransactionReceipt({ hash: latestTx });
    this.extractRollEventFields(trapReceipt.logs, acc);
    this.pushLog({
      kind: 'public_decrypt',
      title: acc.trapTriggered > 0 ? `Trap Triggered (#${acc.trapTriggered})!` : 'Tile Safe (Trap Locations Secret)',
      detail: acc.shieldBlocked ? 'Confidential Shield blocked Snake!' : 'FHE.checkSignatures verified.',
      handle: trapHandle,
      txHash: latestTx,
    });
    return latestTx;
  }

  private async _finalizeDiceFromPending(
    matchId: bigint,
    onStage?: (stage: 'requesting' | 'decrypting_dice' | 'verifying_dice' | 'decrypting_trap' | 'verifying_trap') => void,
  ): Promise<{
    dieValue: number;
    fromPos: number;
    landedPos: number;
    finalPos: number;
    trapTriggered: number;
    shieldBlocked: boolean;
    ladderTo: number;
    snakeTo: number;
    txHash: Hex;
  }> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;
    const pending = (await publicClient.readContract({
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getMatchPendingHandles',
      args: [matchId],
    })) as readonly [Hex, Hex, Hex, Hex, Hex, Address, number];
    const rollHandle = pending[0];

    onStage?.('decrypting_dice');
    const dec = await sdk.decryption.decryptPublicValues([rollHandle]);
    const clearDie = Number(dec.clearValues[rollHandle] ?? 1);
    this.pushLog({
      kind: 'public_decrypt',
      title: `KMS Public Decrypt: Dice = ${clearDie}`,
      detail: 'Obtained KMS decryptionProof for FHE.checkSignatures',
      handle: rollHandle,
    });

    onStage?.('verifying_dice');
    const finHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'finalizeDiceRoll',
      args: [matchId, clearDie, dec.decryptionProof],
    });
    const finReceipt = await publicClient.waitForTransactionReceipt({ hash: finHash });

    const acc = {
      fromPos: 1,
      landedPos: 1,
      finalPos: 1,
      trapTriggered: 0,
      shieldBlocked: false,
      ladderTo: 0,
      snakeTo: 0,
    };
    this.extractRollEventFields(finReceipt.logs, acc);

    let latestTx = finHash;
    const summaryAfter = (await publicClient.readContract({
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getMatchSummary',
      args: [matchId],
    })) as readonly unknown[];

    if (Number(summaryAfter[8]) === 2) {
      latestTx = await this._finalizeTrapCheckFromPending(matchId, acc, onStage);
    } else {
      this.pushLog({
        kind: 'tx',
        title: `Verified Dice Roll: ${clearDie}`,
        detail: 'FHE.checkSignatures verified onchain.',
        txHash: finHash,
      });
    }

    return {
      dieValue: clearDie,
      fromPos: acc.fromPos,
      landedPos: acc.landedPos,
      finalPos: acc.finalPos,
      trapTriggered: acc.trapTriggered,
      shieldBlocked: acc.shieldBlocked,
      ladderTo: acc.ladderTo,
      snakeTo: acc.snakeTo,
      txHash: latestTx,
    };
  }

  private async _finalizeDuelFromPending(matchId: bigint): Promise<{ outcome: number; txHash: Hex }> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;
    const pending = (await publicClient.readContract({
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getMatchPendingHandles',
      args: [matchId],
    })) as readonly [Hex, Hex, Hex, Hex, Hex, Address, number];
    const duelHandle = pending[3];
    const dec = await sdk.decryption.decryptPublicValues([duelHandle]);
    const outcome = Number(dec.clearValues[duelHandle] ?? 0);

    const finHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'finalizeBlindDuel',
      args: [matchId, outcome, dec.decryptionProof],
    });
    await publicClient.waitForTransactionReceipt({ hash: finHash });
    this.pushLog({
      kind: 'public_decrypt',
      title: outcome === 1 ? 'Blind Duel Won!' : outcome === 2 ? 'Blind Duel Lost' : 'Blind Duel Tie!',
      detail: 'Raw player choices remained confidential.',
      handle: duelHandle,
      txHash: finHash,
    });
    return { outcome, txHash: finHash };
  }

  private async _finalizeMissionFromPending(matchId: bigint): Promise<{ passed: boolean; txHash: Hex }> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;
    const pending = (await publicClient.readContract({
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getMatchPendingHandles',
      args: [matchId],
    })) as readonly [Hex, Hex, Hex, Hex, Hex, Address, number];
    const mHandle = pending[4];

    const dec = await sdk.decryption.decryptPublicValues([mHandle]);
    const passedNum = Number(dec.clearValues[mHandle] ?? 0);

    const finHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'finalizeMissionCheck',
      args: [matchId, passedNum, dec.decryptionProof],
    });
    await publicClient.waitForTransactionReceipt({ hash: finHash });
    this.pushLog({
      kind: 'public_decrypt',
      title: passedNum === 1 ? 'Secret Mission Verified (+3 ★ +1 Shield)!' : 'Secret Mission Not Yet Complete',
      detail: 'Evaluated homomorphically without revealing mission ID.',
      handle: mHandle,
      txHash: finHash,
    });
    return { passed: passedNum === 1, txHash: finHash };
  }

  public async rollVerifiableDice(
    matchId: bigint,
    onStage?: (stage: 'requesting' | 'decrypting_dice' | 'verifying_dice' | 'decrypting_trap' | 'verifying_trap') => void,
  ): Promise<{
    dieValue: number;
    fromPos: number;
    landedPos: number;
    finalPos: number;
    trapTriggered: number;
    shieldBlocked: boolean;
    ladderTo: number;
    snakeTo: number;
    txHash: Hex;
  }> {
    const { publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;

    onStage?.('requesting');
    const reqHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'requestDiceRoll',
      args: [matchId],
    });
    await publicClient.waitForTransactionReceipt({ hash: reqHash });
    return this._finalizeDiceFromPending(matchId, onStage);
  }

  public async playBlindDuel(
    matchId: bigint,
    opponent: Address,
    rpsChoice: 0 | 1 | 2,
  ): Promise<{ outcome: number | null; txHash: Hex }> {
    const { sdk, publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;

    const existingDuel = (await publicClient.readContract({
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getBlindDuelState',
      args: [matchId],
    })) as readonly [boolean, Address, Address, boolean, boolean, Hex];

    if (!existingDuel[0]) {
      const startHash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: arenaAddr,
        abi: DOD_SNAKE_ARENA_ABI,
        functionName: 'startBlindDuel',
        args: [matchId, opponent],
      });
      await publicClient.waitForTransactionReceipt({ hash: startHash });
    }

    const encMove = await sdk.encrypt({
      values: [{ type: 'euint8', value: BigInt(rpsChoice) }],
      contractAddress: arenaAddr,
      userAddress: account,
    });
    this.pushLog({
      kind: 'encrypt',
      title: 'Encrypted Blind Duel Move (euint8)',
      detail: 'Move hidden from opponent & mempool.',
      handle: encMove.encryptedValues[0],
    });

    const moveHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'submitBlindDuelMove',
      args: [matchId, encMove.encryptedValues[0], encMove.inputProof],
    });
    await publicClient.waitForTransactionReceipt({ hash: moveHash });

    const summary = (await publicClient.readContract({
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getMatchSummary',
      args: [matchId],
    })) as readonly unknown[];

    if (Number(summary[8]) === 3) {
      return this._finalizeDuelFromPending(matchId);
    }

    return { outcome: null, txHash: moveHash };
  }

  public async verifySecretMission(matchId: bigint): Promise<{ passed: boolean; txHash: Hex }> {
    const { publicClient, walletClient, account, addrs } = this.requireSdk();
    const arenaAddr = addrs.arenaAddress as Address;

    const reqHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: arenaAddr,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'requestMissionCheck',
      args: [matchId],
    });
    await publicClient.waitForTransactionReceipt({ hash: reqHash });
    return this._finalizeMissionFromPending(matchId);
  }

  public async resumePendingAction(
    matchId: bigint,
    onStage?: (stage: 'requesting' | 'decrypting_dice' | 'verifying_dice' | 'decrypting_trap' | 'verifying_trap') => void,
  ): Promise<{
    actionKind: number;
    roll?: Awaited<ReturnType<FheArenaClient['rollVerifiableDice']>>;
    duelOutcome?: number;
    missionPassed?: boolean;
    txHash: Hex;
  }> {
    const { publicClient, addrs } = this.requireSdk();
    const summary = (await publicClient.readContract({
      address: addrs.arenaAddress as Address,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'getMatchSummary',
      args: [matchId],
    })) as readonly unknown[];

    const pendingAction = Number(summary[8]);
    if (pendingAction === 1) {
      const roll = await this._finalizeDiceFromPending(matchId, onStage);
      return { actionKind: 1, roll, txHash: roll.txHash };
    }
    if (pendingAction === 2) {
      const acc = {
        fromPos: 1,
        landedPos: 1,
        finalPos: 1,
        trapTriggered: 0,
        shieldBlocked: false,
        ladderTo: 0,
        snakeTo: 0,
      };
      const txHash = await this._finalizeTrapCheckFromPending(matchId, acc, onStage);
      return {
        actionKind: 2,
        roll: { dieValue: 0, ...acc, txHash },
        txHash,
      };
    }
    if (pendingAction === 3) {
      const res = await this._finalizeDuelFromPending(matchId);
      return { actionKind: 3, duelOutcome: res.outcome, txHash: res.txHash };
    }
    if (pendingAction === 4) {
      const res = await this._finalizeMissionFromPending(matchId);
      return { actionKind: 4, missionPassed: res.passed, txHash: res.txHash };
    }
    throw new Error('No pending onchain KMS proof to resume.');
  }

  public async claimMatchPayout(matchId: bigint): Promise<Hex> {
    const { publicClient, walletClient, account, addrs } = this.requireSdk();
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: addrs.arenaAddress as Address,
      abi: DOD_SNAKE_ARENA_ABI,
      functionName: 'claimMatchPayout',
      args: [matchId],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    this.pushLog({
      kind: 'tx',
      title: 'ERC-7984 Pot Paid Out Confidentially!',
      detail: 'Encrypted pot transferred via confidentialTransfer.',
      txHash: hash,
    });
    return hash;
  }

  public getExplorerTxUrl(txHash: string): string {
    if (this.chainId === SEPOLIA_CHAIN_ID) {
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    }
    return `#tx-${txHash}`;
  }

  public static getRelayerUrl(): string {
    return PROTOCOL_SEPOLIA_ADDRESSES.relayerUrl;
  }
}
