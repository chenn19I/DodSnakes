export type UsernameRejectionReason =
  | 'empty'
  | 'too_long'
  | 'no_alnum'
  | 'inappropriate';

export interface UsernameValidationResult {
  ok: boolean;
  sanitized: string;
  reason?: UsernameRejectionReason;
  error?: string;
}

export const USERNAME_MAX_LENGTH = 18;
export const USERNAME_POLICY_ERROR =
  'Nama tidak boleh mengandung kata kasar, porno, SARA, atau penghinaan.';

const SAFE_WORDS = new Set([
  'babies',
  'babylon',
  'analysis',
  'analyst',
  'peninsula',
  'peacock',
  'cocktail',
  'grape',
  'grapes',
  'drape',
  'scrape',
  'cassie',
  'hassan',
  'hasan',
  'hello',
  'michelle',
  'sasuke',
  'nasution',
  'coklat',
  'kocok',
  'titik',
  'titisan',
  'kualitas',
  'cuma',
  'cuman',
  'kumis',
  'lucina',
]);

// Words that are checked as whole tokens (and collapsed single-char separator runs)
// to avoid false positives on harmless substrings inside normal names.
const EXACT_TOKEN_BLOCKLIST = new Set([
  // Profanity
  'asu',
  'cok',
  'coeg',
  'tai',
  'taik',
  'taek',
  'njir',
  'njay',
  'njing',
  'bgst',
  'kntl',
  'mmk',
  'jmbt',
  'fuck',
  'fck',
  'fuk',
  'fvck',
  'shit',
  'shyt',
  'crap',
  'ass',
  'wtf',
  'stfu',
  // NSFW / Porn
  'sex',
  'seks',
  'xxx',
  'nsfw',
  'jav',
  'anal',
  'cum',
  'tit',
  'tits',
  'titty',
  'boob',
  'boobs',
  'cock',
  'dick',
  'nude',
  'nudes',
  'naked',
  'psk',
  'hoe',
  'rape',
  'milf',
  'bdsm',
  'ewe',
  'coli',
  // SARA / Slurs
  'cina',
  'cino',
  'tapir',
  'sesat',
  'bidah',
  'onta',
  'pki',
  'isis',
  'kkk',
  // Insults
  'oon',
  'gila',
  'sarap',
  'edan',
  'bego',
  'cupu',
  'culun',
  'burik',
  'gembel',
  'kacung',
  'babu',
  'jongos',
  'bejat',
  'cacat',
  'autis',
  'banci',
  'bencong',
  'waria',
  'maho',
  'homo',
  'idiot',
  'moron',
  'stupid',
  'loser',
  'scum',
  'freak',
  'dumb',
]);

// Unambiguous slurs, profanity, NSFW terms, and insults blocked even when concatenated
// or embedded via punctuation/leetspeak.
const SUBSTRING_BLOCKLIST: readonly string[] = [
  // Profanity (ID & EN)
  'anjing',
  'anjir',
  'anjay',
  'anjrit',
  'anjrot',
  'bangsat',
  'bngst',
  'bajingan',
  'brengsek',
  'kampret',
  'keparat',
  'sialan',
  'bedebah',
  'biadab',
  'jahanam',
  'bangke',
  'setan',
  'iblis',
  'jancok',
  'jancuk',
  'dancok',
  'ancok',
  'kimak',
  'pukimak',
  'pantek',
  'kirek',
  'celeng',
  'jingan',
  'babi',
  'motherfucker',
  'asshole',
  'dickhead',
  'bullshit',
  'bitch',
  'bastard',
  'sonofabitch',
  // NSFW / Porn (ID & EN)
  'porno',
  'porn',
  'bokep',
  'cabul',
  'mesum',
  'sange',
  'ngentot',
  'entot',
  'ngewe',
  'kontol',
  'memek',
  'pepek',
  'puki',
  'jembut',
  'colmek',
  'onani',
  'masturbasi',
  'toket',
  'tetek',
  'pentil',
  'peler',
  'pelir',
  'peju',
  'sperma',
  'bugil',
  'telanjang',
  'lonte',
  'perek',
  'jablay',
  'pecun',
  'sundal',
  'pelacur',
  'bispak',
  'birahi',
  'orgasm',
  'orgasme',
  'vagina',
  'penis',
  'klitoris',
  'clitoris',
  'pussy',
  'cunt',
  'twat',
  'dildo',
  'vibrator',
  'cumshot',
  'blowjob',
  'handjob',
  'gangbang',
  'threesome',
  'hentai',
  'onlyfans',
  'xnxx',
  'xvideos',
  'pornhub',
  'whore',
  'slut',
  'skank',
  'horny',
  'rapist',
  'incest',
  'fetish',
  // SARA (Ethnic, religious, racial, inter-group slurs & hate)
  'kafir',
  'murtad',
  'aseng',
  'nigger',
  'nigga',
  'negro',
  'chink',
  'chingchong',
  'wetback',
  'keling',
  'inlander',
  'kadrun',
  'cebong',
  'pribumi',
  'yahudi',
  'zionis',
  'nazi',
  'hitler',
  'swastika',
  'teroris',
  'terrorist',
  'komunis',
  'anticina',
  'antiislam',
  'antikristen',
  // Insults
  'goblok',
  'goblog',
  'tolol',
  'begok',
  'dungu',
  'bloon',
  'bodoh',
  'pekok',
  'sinting',
  'pecundang',
  'pengecut',
  'penjilat',
  'pengkhianat',
  'laknat',
  'monyet',
  'kunyuk',
  'dumbass',
  'jackass',
  'dipshit',
  'douchebag',
  'retard',
  'retarded',
  'imbecile',
  'pathetic',
];

function decodeLeet(input: string): string {
  return input
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7+]/g, 't')
    .replace(/8/g, 'b');
}

function collapseToOne(input: string): string {
  return input.replace(/(.)\1+/g, '$1');
}

function collapseToTwo(input: string): string {
  return input.replace(/(.)\1{2,}/g, '$1$1');
}

function normalizeBase(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function sanitizeUsernameRaw(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsBlockedWord(sanitized: string): boolean {
  const base = normalizeBase(sanitized);

  // Split into rough tokens across punctuation/spaces
  const rawTokens = base.split(/[^a-z0-9@$!+|]+/).filter(Boolean);

  // Also collapse runs of single-character tokens (e.g., "a s u", "k.o.n.t.o.l")
  const expandedTokens: string[] = [...rawTokens];
  let singleRun = '';
  for (const tok of rawTokens) {
    if (tok.length === 1) {
      singleRun += tok;
    } else {
      if (singleRun.length >= 2) expandedTokens.push(singleRun);
      singleRun = '';
    }
  }
  if (singleRun.length >= 2) expandedTokens.push(singleRun);

  for (const tok of expandedTokens) {
    if (SAFE_WORDS.has(tok)) continue;
    const strippedEdges = tok.replace(/^[0-9]+|[0-9]+$/g, '');
    const candidatesRaw = [tok, strippedEdges].filter(Boolean);
    for (const cand of candidatesRaw) {
      if (SAFE_WORDS.has(cand)) continue;
      const leet = decodeLeet(cand).replace(/[^a-z]/g, '');
      const plainAlpha = cand.replace(/[^a-z]/g, '');
      const d1 = collapseToOne(leet);
      const d2 = collapseToTwo(leet);
      if (
        EXACT_TOKEN_BLOCKLIST.has(cand) ||
        (plainAlpha && EXACT_TOKEN_BLOCKLIST.has(plainAlpha)) ||
        (leet && EXACT_TOKEN_BLOCKLIST.has(leet)) ||
        (d1 && EXACT_TOKEN_BLOCKLIST.has(d1)) ||
        (d2 && EXACT_TOKEN_BLOCKLIST.has(d2))
      ) {
        return true;
      }
    }
  }

  // Strip known benign words before compact substring scan so e.g. "Cassie" or "Babies" pass
  const strippedTokens = rawTokens
    .filter((tok) => !SAFE_WORDS.has(tok))
    .join(' ');

  const compactRaw = strippedTokens.replace(/[^a-z]/g, '');
  const compactLeet = decodeLeet(strippedTokens).replace(/[^a-z]/g, '');
  const maskBenign = (s: string) =>
    s.replace(/(babies|babylon|perekam|perekonomian|scunthorpe|thorny)/g, '');
  const views = new Set<string>([
    maskBenign(compactRaw),
    maskBenign(collapseToOne(compactRaw)),
    maskBenign(compactLeet),
    maskBenign(collapseToOne(compactLeet)),
    maskBenign(collapseToTwo(compactLeet)),
  ]);

  for (const view of views) {
    if (!view) continue;
    for (const bad of SUBSTRING_BLOCKLIST) {
      if (view.includes(bad)) {
        return true;
      }
    }
  }

  return false;
}

export function validateUsername(raw: string): UsernameValidationResult {
  const sanitized = sanitizeUsernameRaw(raw);
  if (sanitized.length === 0) {
    return {
      ok: false,
      sanitized,
      reason: 'empty',
      error: 'Nama pemain tidak boleh kosong.',
    };
  }
  if (sanitized.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      sanitized,
      reason: 'too_long',
      error: `Nama pemain maksimal ${USERNAME_MAX_LENGTH} karakter.`,
    };
  }
  if (!/[a-zA-Z0-9]/.test(sanitized)) {
    return {
      ok: false,
      sanitized,
      reason: 'no_alnum',
      error: 'Nama pemain harus mengandung huruf atau angka.',
    };
  }
  if (containsBlockedWord(sanitized)) {
    return {
      ok: false,
      sanitized,
      reason: 'inappropriate',
      error: USERNAME_POLICY_ERROR,
    };
  }
  return { ok: true, sanitized };
}

export function isUsernameAllowed(raw: string): boolean {
  return validateUsername(raw).ok;
}

export function sanitizeUsernameOrFallback(raw: string, fallback = 'Pemain'): string {
  const res = validateUsername(raw);
  return res.ok ? res.sanitized : fallback;
}
