import type { PlayerColorId, ZoneId } from '@doodle-dash/shared';

export const DOODLE_PALETTE = {
  paper: '#FFF7E8',
  paperWarm: '#F5E7CE',
  deskWood: '#DFC39B',
  deskWoodDeep: '#CAA97D',
  deskMat: '#C8E6DC',
  ink: '#2B2838',
  pink: '#FF7FA7',
  yellow: '#FFC94A',
  mint: '#58D6A3',
  blue: '#6AB8FA',
  orange: '#FF9248',
  purple: '#A688FA',
  coral: '#F26B6B',
  notebookMargin: '#F29EB3',
  notebookLine: '#C6DAEE',
} as const;

export const PLAYER_HEX_MAP: Record<PlayerColorId, string> = {
  pink: DOODLE_PALETTE.pink,
  kuning: DOODLE_PALETTE.yellow,
  mint: DOODLE_PALETTE.mint,
  biru: DOODLE_PALETTE.blue,
  oranye: DOODLE_PALETTE.orange,
  ungu: DOODLE_PALETTE.purple,
};

export const ZONE_THEME: Record<
  ZoneId,
  {
    name: string;
    slabBase: string;
    slabAlt: string;
    accent: string;
    propColor: string;
  }
> = {
  taman_permen: {
    name: 'Taman Permen',
    slabBase: '#FFE2EC',
    slabAlt: '#FFF2C6',
    accent: DOODLE_PALETTE.pink,
    propColor: DOODLE_PALETTE.yellow,
  },
  hutan_ngantuk: {
    name: 'Hutan Ngantuk',
    slabBase: '#DDF8E8',
    slabAlt: '#EFFAD6',
    accent: DOODLE_PALETTE.mint,
    propColor: DOODLE_PALETTE.yellow,
  },
  gunung_es: {
    name: 'Gunung Es Cemong',
    slabBase: '#DCEEFF',
    slabAlt: '#EDE4FF',
    accent: DOODLE_PALETTE.blue,
    propColor: DOODLE_PALETTE.purple,
  },
  kastil_awan: {
    name: 'Kastil Awan',
    slabBase: '#EFE6FF',
    slabAlt: '#FFE8D4',
    accent: DOODLE_PALETTE.purple,
    propColor: DOODLE_PALETTE.orange,
  },
};
