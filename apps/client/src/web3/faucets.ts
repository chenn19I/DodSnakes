export const PROTOCOL_DISCLAIMER =
  'This project is not audited, endorsed or operated by Zama. Use at your own risk.';

export const SEPOLIA_CHAIN_ID = 11155111;
export const HARDHAT_CHAIN_ID = 31337;

export const PROTOCOL_SEPOLIA_ADDRESSES = {
  chainId: 11155111,
  gatewayChainId: 10901,
  relayerUrl: 'https://relayer.testnet.zama.org',
  aclContract: '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D',
  fhevmExecutor: '0x92C920834Ec8941d2C77D188936E1f7A6f49c127',
  kmsVerifier: '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A',
  cUsdtWrapper: '0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50',
  cUsdcWrapper: '0xe978F22157048E5DB8E5d07971376e86671672B2',
  wrappersRegistry: '0x2f0750Bbb0A246059d80e94c454586a7F27a128e',
} as const;

export interface SepoliaFaucetInfo {
  id: string;
  name: string;
  token: string;
  url: string;
  requirement: string;
  noteId: string;
  noteEn: string;
}

export const SEPOLIA_FAUCETS: readonly SepoliaFaucetInfo[] = [
  {
    id: 'dodchip',
    name: 'In-App DodChip (cDOD) ERC-7984 Faucet',
    token: '100 cDOD (Encrypted)',
    url: '#in-app-faucet',
    requirement: 'Sepolia Gas ETH only',
    noteId: 'Mint langsung 100 cDOD terenkripsi dari kontrak DodChipERC7984 setiap 1 jam.',
    noteEn: 'Mints 100 encrypted cDOD directly from DodChipERC7984 once per hour.',
  },
  {
    id: 'google-cloud',
    name: 'Google Cloud Web3 Sepolia Faucet',
    token: '0.05 Sepolia ETH',
    url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
    requirement: 'Google Account (No Mainnet ETH needed)',
    noteId: 'Cocok untuk wallet baru karena tidak butuh saldo mainnet.',
    noteEn: 'Great for fresh wallets — no Ethereum mainnet balance required.',
  },
  {
    id: 'pk910-pow',
    name: 'pk910 Sepolia PoW Faucet',
    token: 'Up to ~1 Sepolia ETH',
    url: 'https://sepolia-faucet.pk910.de/',
    requirement: 'Browser Proof-of-Work mining',
    noteId: 'Tanpa login & tanpa saldo mainnet; cukup mining ringan di browser.',
    noteEn: 'No login or mainnet balance needed; mine lightweight hashes in browser.',
  },
  {
    id: 'alchemy',
    name: 'Alchemy Sepolia Faucet',
    token: '0.1 Sepolia ETH / 24h',
    url: 'https://www.alchemy.com/faucets/ethereum-sepolia',
    requirement: 'Free Alchemy login + 0.001 Mainnet ETH',
    noteId: 'Stabil dan cepat bila akun/wallet memenuhi syarat anti-bot Alchemy.',
    noteEn: 'Fast and reliable drip with a free Alchemy developer account.',
  },
  {
    id: 'chainlink',
    name: 'Chainlink Sepolia Faucet',
    token: 'Sepolia ETH + Test LINK',
    url: 'https://faucets.chain.link/sepolia',
    requirement: 'Connect wallet',
    noteId: 'Memberikan Sepolia ETH sekaligus test LINK.',
    noteEn: 'Provides Sepolia ETH alongside testnet LINK.',
  },
  {
    id: 'quicknode',
    name: 'QuickNode Sepolia Faucet',
    token: '~0.05 Sepolia ETH',
    url: 'https://faucet.quicknode.com/ethereum/sepolia',
    requirement: 'Wallet / QuickNode account',
    noteId: 'Dukungan multi-chain dengan opsi bonus tweet.',
    noteEn: 'Multi-chain developer faucet with optional social boost.',
  },
  {
    id: 'infura',
    name: 'Infura / MetaMask Sepolia Faucet',
    token: 'Sepolia ETH',
    url: 'https://www.infura.io/faucet/sepolia',
    requirement: 'Free Infura account',
    noteId: 'Faucet resmi ekosistem Consensys / Infura.',
    noteEn: 'Official Consensys / Infura developer faucet.',
  },
  {
    id: 'coinbase-cdp',
    name: 'Coinbase Developer Platform (CDP) Faucet',
    token: 'Sepolia ETH',
    url: 'https://portal.cdp.coinbase.com/products/faucet',
    requirement: 'Coinbase Developer login',
    noteId: 'Drip testnet andal dari Coinbase Developer Platform.',
    noteEn: 'Reliable testnet drip from Coinbase Developer Platform.',
  },
  {
    id: 'moralis',
    name: 'Moralis Sepolia Faucet',
    token: 'Sepolia ETH',
    url: 'https://moralis.com/faucets/',
    requirement: 'Moralis account',
    noteId: 'Terintegrasi dengan portal developer Moralis.',
    noteEn: 'Developer faucet inside the Moralis Web3 portal.',
  },
  {
    id: 'thirdweb',
    name: 'Thirdweb Sepolia Faucet',
    token: 'Sepolia ETH',
    url: 'https://thirdweb.com/sepolia',
    requirement: 'Wallet connect',
    noteId: 'Klaim langsung dari dashboard Thirdweb Sepolia.',
    noteEn: 'Claim directly from the Thirdweb Sepolia dashboard.',
  },
  {
    id: 'bitbond',
    name: 'Bitbond Token Tool Sepolia Faucet',
    token: 'Sepolia ETH',
    url: 'https://tokentool.bitbond.com/faucet/ethereum-sepolia',
    requirement: 'Wallet connect',
    noteId: 'Alternatif faucet untuk pengujian deploy kontrak & token.',
    noteEn: 'Alternative faucet geared toward token & contract testing.',
  },
  {
    id: 'learnweb3',
    name: 'LearnWeb3 Sepolia Faucet',
    token: 'Sepolia ETH',
    url: 'https://learnweb3.io/faucets/sepolia',
    requirement: 'GitHub / LearnWeb3 sign-in',
    noteId: 'Faucet komunitas developer Web3 dengan login GitHub.',
    noteEn: 'Web3 builder faucet accessible via GitHub / LearnWeb3 login.',
  },
] as const;

export const TESTNET_DIRECTORY = {
  deployerAddress: '0xb2e53D52d38bc87Aaf7E3C81d121dfBD845E9B7D',
  testAccounts: [
    '0x3C22F1EefEf2ba6F5adb0e398188eE348390C503',
    '0x6D6479fc7537ABd903700a94A1Afed7b04e78253',
    '0xAd976fb078e1D175328567dBBd0a1cf1F4c38576',
    '0x5527A70282A0139657457891263A39F4C847fB23',
    '0xc5e96C6c75b3E8Fa59B0b215620a6912986882Fa',
    '0x678397B0C3C6aA47646595D074871733e3EF6237',
    '0x8050fA9F30c0Fe3664346D7d0266Fd15F99969fC',
    '0x5c6f94510dd265208860ae3d7FB72Edec4A94bd2',
    '0x6ac284E018DEa3876301be8C48588670fb12012e',
    '0x49832Da05c17E4636A57DF068D88285ce7f96124',
  ],
} as const;

export const SECRET_MISSION_DESCRIPTIONS = [
  {
    id: 0,
    titleId: 'Pemanjat Tangga',
    titleEn: 'Ladder Climber',
    descId: 'Naik minimal 1 tangga di papan sebelum klaim.',
    descEn: 'Climb at least 1 ladder before claiming.',
  },
  {
    id: 1,
    titleId: 'Penjelajah Aman',
    titleEn: 'Safe Explorer',
    descId: 'Hindari 1 ular atau capai separuh papan.',
    descEn: 'Dodge at least 1 snake or reach halfway across the board.',
  },
  {
    id: 2,
    titleId: 'Jagoan Duel Buta',
    titleEn: 'Blind Duel Champion',
    descId: 'Menangkan minimal 1 Duel Buta Terenkripsi.',
    descEn: 'Win at least 1 Encrypted Blind Duel.',
  },
  {
    id: 3,
    titleId: 'Ahli Jebakan Rahasia',
    titleEn: 'Trap Tactician',
    descId: 'Tanam minimal 1 Jebakan Rahasia & miliki >= 4 ★.',
    descEn: 'Plant >= 1 Secret Trap and hold >= 4 ★.',
  },
] as const;

export const TRAP_KIND_META = [
  {
    kind: 1,
    nameId: 'Jebakan Lumpur (-2 Langkah)',
    nameEn: 'Mud Slide (-2 Steps)',
    shortId: 'Lumpur (-2)',
    shortEn: 'Mud (-2)',
  },
  {
    kind: 2,
    nameId: 'Jerat Tinta (-1 Bintang)',
    nameEn: 'Ink Snare (-1 Star)',
    shortId: 'Jerat Tinta (-1★)',
    shortEn: 'Ink Snare (-1★)',
  },
  {
    kind: 3,
    nameId: 'Sergapan Ular (-4 Langkah)',
    nameEn: 'Snake Ambush (-4 Steps)',
    shortId: 'Sergapan (-4)',
    shortEn: 'Ambush (-4)',
  },
] as const;

export const GOLDEN_WARP_KIND = 4;
