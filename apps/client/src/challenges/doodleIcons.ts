export function renderDoodleSvg(shape: string, silhouette = false): string {
  const fill = (hex: string) => (silhouette ? '#2B2A33' : hex);
  const stroke = '#2B2A33';

  switch (shape) {
    case 'cat':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <polygon points="16,32 22,10 36,24" fill="${fill('#FF8FB1')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        <polygon points="64,32 58,10 44,24" fill="${fill('#FF8FB1')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="40" cy="46" r="24" fill="${fill('#FF8FB1')}" stroke="${stroke}" stroke-width="3.5"/>
        ${silhouette ? '' : `<circle cx="32" cy="42" r="3.5" fill="#2B2A33"/><circle cx="48" cy="42" r="3.5" fill="#2B2A33"/><path d="M36 51 Q40 55 44 51" fill="none" stroke="#2B2A33" stroke-width="3" stroke-linecap="round"/>`}
      </svg>`;
    case 'duck':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <ellipse cx="42" cy="52" rx="24" ry="18" fill="${fill('#FFD166')}" stroke="${stroke}" stroke-width="3.5"/>
        <circle cx="32" cy="30" r="15" fill="${fill('#FFD166')}" stroke="${stroke}" stroke-width="3.5"/>
        <polygon points="18,28 6,33 18,37" fill="${fill('#FF9F5A')}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
        ${silhouette ? '' : `<circle cx="29" cy="27" r="3" fill="#2B2A33"/>`}
      </svg>`;
    case 'lollipop':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <rect x="37" y="42" width="6" height="32" rx="3" fill="${fill('#FFF6E5')}" stroke="${stroke}" stroke-width="3"/>
        <circle cx="40" cy="28" r="20" fill="${fill('#FF8FB1')}" stroke="${stroke}" stroke-width="3.5"/>
        ${silhouette ? '' : `<path d="M40 28 m-10 0 a10 10 0 1 0 20 0 a6 6 0 1 1 -12 0" fill="none" stroke="#FFF6E5" stroke-width="3.5" stroke-linecap="round"/>`}
      </svg>`;
    case 'cloud':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <path d="M20 56 H60 A12 12 0 0 0 60 32 A16 16 0 0 0 30 26 A13 13 0 0 0 20 56 Z" fill="${fill('#7CC6FE')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
      </svg>`;
    case 'mushroom':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <rect x="30" y="42" width="20" height="26" rx="7" fill="${fill('#FFF6E5')}" stroke="${stroke}" stroke-width="3.5"/>
        <path d="M12 44 C12 18 68 18 68 44 Z" fill="${fill('#FF9F5A')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        ${silhouette ? '' : `<circle cx="28" cy="31" r="5" fill="#FFF6E5"/><circle cx="49" cy="28" r="4" fill="#FFF6E5"/>`}
      </svg>`;
    case 'crown':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <polygon points="12,58 10,24 28,40 40,18 52,40 70,24 68,58" fill="${fill('#FFD166')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
      </svg>`;
    case 'star':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <polygon points="40,10 49,30 70,32 54,46 59,68 40,57 21,68 26,46 10,32 31,30" fill="${fill('#FFD166')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
      </svg>`;
    case 'icecream':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <polygon points="24,42 56,42 40,72" fill="${fill('#FF9F5A')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="31" cy="34" r="12" fill="${fill('#FF8FB1')}" stroke="${stroke}" stroke-width="3.5"/>
        <circle cx="49" cy="34" r="12" fill="${fill('#6EE7B7')}" stroke="${stroke}" stroke-width="3.5"/>
        <circle cx="40" cy="23" r="12" fill="${fill('#7CC6FE')}" stroke="${stroke}" stroke-width="3.5"/>
      </svg>`;
    case 'tree':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <rect x="34" y="48" width="12" height="22" rx="3" fill="${fill('#D4A373')}" stroke="${stroke}" stroke-width="3.5"/>
        <circle cx="40" cy="32" r="20" fill="${fill('#6EE7B7')}" stroke="${stroke}" stroke-width="3.5"/>
      </svg>`;
    case 'rocket':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <polygon points="24,54 14,64 26,64" fill="${fill('#FF9F5A')}" stroke="${stroke}" stroke-width="3"/>
        <polygon points="56,54 66,64 54,64" fill="${fill('#FF9F5A')}" stroke="${stroke}" stroke-width="3"/>
        <path d="M40 10 C55 24 56 48 50 60 H30 C24 48 25 24 40 10 Z" fill="${fill('#B69CFF')}" stroke="${stroke}" stroke-width="3.5"/>
        ${silhouette ? '' : `<circle cx="40" cy="34" r="7" fill="#FFF6E5" stroke="#2B2A33" stroke-width="3"/>`}
      </svg>`;
    case 'fish':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <polygon points="54,40 70,26 70,54" fill="${fill('#7CC6FE')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        <ellipse cx="35" cy="40" rx="23" ry="16" fill="${fill('#7CC6FE')}" stroke="${stroke}" stroke-width="3.5"/>
        ${silhouette ? '' : `<circle cx="24" cy="36" r="3" fill="#2B2A33"/>`}
      </svg>`;
    case 'candy':
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <polygon points="10,28 24,40 10,52" fill="${fill('#FF8FB1')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        <polygon points="70,28 56,40 70,52" fill="${fill('#FF8FB1')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        <ellipse cx="40" cy="40" rx="18" ry="14" fill="${fill('#FFD166')}" stroke="${stroke}" stroke-width="3.5"/>
      </svg>`;
    case 'banana':
    default:
      return `<svg viewBox="0 0 80 80" width="64" height="64">
        <path d="M18 54 C30 68 62 56 64 20 C58 18 54 22 52 28 C48 44 30 50 18 46 Z" fill="${fill('#FFD166')}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
      </svg>`;
  }
}

export function renderPatternBadge(pattern: string): string {
  switch (pattern) {
    case 'circle':
      return '●';
    case 'triangle':
      return '▲';
    case 'square':
      return '■';
    case 'star':
      return '★';
    case 'diamond':
      return '◆';
    default:
      return '•';
  }
}

const INK = '#24222D';

function renderPawnAccessoryOverlay(pawnId: string, accessory: string): string {
  if (!accessory || accessory === 'none') return '';
  const eyeY = pawnId === 'jamur' ? 42 : pawnId === 'kodok' ? 22 : pawnId === 'bebek' ? 28 : 34;
  const eyeLeft = pawnId === 'kodok' ? 19 : pawnId === 'dino' ? 37 : pawnId === 'jamur' ? 28 : 24;
  const eyeRight = pawnId === 'kodok' ? 45 : pawnId === 'dino' ? 46 : pawnId === 'jamur' ? 36 : 40;
  const topY = pawnId === 'dino' ? 6 : pawnId === 'jamur' ? 11 : pawnId === 'kodok' ? 10 : 12;

  switch (accessory) {
    case 'crown':
      return `<g>
        <polygon points="23,${topY + 8} 26,${topY} 32,${topY + 5} 38,${topY} 41,${topY + 8}" fill="#FFD15C" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="32" cy="${topY + 5}" r="1.8" fill="#FF6B7B"/>
      </g>`;
    case 'glasses':
      return pawnId === 'dino'
        ? `<g>
             <circle cx="${eyeLeft}" cy="${eyeY - 5}" r="5.5" fill="none" stroke="${INK}" stroke-width="2.2"/>
             <line x1="${eyeLeft - 6}" y1="${eyeY - 5}" x2="26" y2="${eyeY - 6}" stroke="${INK}" stroke-width="2"/>
           </g>`
        : `<g>
             <circle cx="${eyeLeft}" cy="${eyeY}" r="6.2" fill="none" stroke="${INK}" stroke-width="2.2"/>
             <circle cx="${eyeRight}" cy="${eyeY}" r="6.2" fill="none" stroke="${INK}" stroke-width="2.2"/>
             <line x1="${eyeLeft + 6}" y1="${eyeY}" x2="${eyeRight - 6}" y2="${eyeY}" stroke="${INK}" stroke-width="2"/>
           </g>`;
    case 'scarf':
      return `<g>
        <path d="M18 50 Q32 56 46 50" fill="none" stroke="#FF6B7B" stroke-width="6.5" stroke-linecap="round"/>
        <path d="M18 50 Q32 56 46 50" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <rect x="36" y="49" width="6" height="10" rx="2.5" fill="#FF6B7B" stroke="${INK}" stroke-width="1.8"/>
      </g>`;
    case 'headset':
      return `<g>
        <path d="M11 35 C11 10 53 10 53 35" fill="none" stroke="#72C0FF" stroke-width="3.8" stroke-linecap="round"/>
        <rect x="7" y="29" width="7" height="14" rx="3.5" fill="#FF86AD" stroke="${INK}" stroke-width="2.2"/>
        <rect x="50" y="29" width="7" height="14" rx="3.5" fill="#FF86AD" stroke="${INK}" stroke-width="2.2"/>
      </g>`;
    case 'flower':
      return `<g transform="translate(17, ${topY + 5})">
        <circle cx="0" cy="-4.5" r="3" fill="#FF86AD" stroke="${INK}" stroke-width="1.4"/>
        <circle cx="4.3" cy="-1.2" r="3" fill="#FFFDF7" stroke="${INK}" stroke-width="1.4"/>
        <circle cx="2.7" cy="3.8" r="3" fill="#FF86AD" stroke="${INK}" stroke-width="1.4"/>
        <circle cx="-2.7" cy="3.8" r="3" fill="#FFFDF7" stroke="${INK}" stroke-width="1.4"/>
        <circle cx="-4.3" cy="-1.2" r="3" fill="#FF86AD" stroke="${INK}" stroke-width="1.4"/>
        <circle cx="0" cy="0" r="2.6" fill="#FFD15C" stroke="${INK}" stroke-width="1.4"/>
      </g>`;
    case 'backpack':
      return `<g>
        <circle cx="51" cy="49" r="6" fill="#72C0FF" stroke="${INK}" stroke-width="2.2"/>
        <polygon points="51,45 52.3,47.8 55.3,48 53,50 53.6,53 51,51.4 48.4,53 49,50 46.7,48 49.7,47.8" fill="#FFD15C"/>
      </g>`;
    default:
      return '';
  }
}

export function renderAccessorySvg(accessoryId: string, tintHex = '#FF86AD', size = 32): string {
  const s = size;
  switch (accessoryId) {
    case 'crown':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="8,34 11,14 19,24 24,10 29,24 37,14 40,34" fill="#FFD15C" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="24" cy="27" r="3.2" fill="#FF6B7B" stroke="${INK}" stroke-width="1.6"/>
      </svg>`;
    case 'glasses':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="15" cy="25" r="8" fill="#DCEBFF" fill-opacity="0.7" stroke="${INK}" stroke-width="3"/>
        <circle cx="33" cy="25" r="8" fill="#DCEBFF" fill-opacity="0.7" stroke="${INK}" stroke-width="3"/>
        <path d="M23 24 H25" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
      </svg>`;
    case 'scarf':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <path d="M8 18 Q24 26 40 18 Q42 26 36 28 Q24 34 12 28 Q6 26 8 18 Z" fill="#FF6B7B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <rect x="27" y="25" width="9" height="15" rx="4" fill="#FF6B7B" stroke="${INK}" stroke-width="2.8"/>
        <line x1="28" y1="34" x2="35" y2="34" stroke="#FFF6E5" stroke-width="3"/>
      </svg>`;
    case 'headset':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <path d="M10 28 C10 10 38 10 38 28" fill="none" stroke="#72C0FF" stroke-width="5" stroke-linecap="round"/>
        <rect x="6" y="22" width="9" height="16" rx="4.5" fill="${tintHex}" stroke="${INK}" stroke-width="2.8"/>
        <rect x="33" y="22" width="9" height="16" rx="4.5" fill="${tintHex}" stroke="${INK}" stroke-width="2.8"/>
      </svg>`;
    case 'flower':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="24" cy="13" r="6.5" fill="#FF86AD" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="34" cy="21" r="6.5" fill="#FFFDF7" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="30" cy="33" r="6.5" fill="#FF86AD" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="18" cy="33" r="6.5" fill="#FFFDF7" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="14" cy="21" r="6.5" fill="#FF86AD" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="24" cy="24" r="6" fill="#FFD15C" stroke="${INK}" stroke-width="2.6"/>
      </svg>`;
    case 'backpack':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <path d="M18 14 C18 8 30 8 30 14" fill="none" stroke="${INK}" stroke-width="3"/>
        <rect x="11" y="13" width="26" height="27" rx="9" fill="#72C0FF" stroke="${INK}" stroke-width="3"/>
        <rect x="15" y="26" width="18" height="10" rx="4" fill="#5EE2AD" stroke="${INK}" stroke-width="2.4"/>
        <polygon points="24,15 25.8,19.2 30.3,19.6 26.8,22.5 27.9,27 24,24.6 20.1,27 21.2,22.5 17.7,19.6 22.2,19.2" fill="#FFD15C" stroke="${INK}" stroke-width="1.6"/>
      </svg>`;
    default:
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="24" cy="24" r="14" fill="#FFF6E5" stroke="${INK}" stroke-width="3" stroke-dasharray="5 4"/>
        <polygon points="24,13 26.5,20 34,20 28,24.5 30,32 24,27.5 18,32 20,24.5 14,20 21.5,20" fill="${tintHex}" stroke="${INK}" stroke-width="2"/>
      </svg>`;
  }
}

export function renderPawnAvatarSvg(
  pawnId: string,
  tintHex = '#FF86AD',
  size = 34,
  accessory = 'none',
): string {
  const s = size;
  const overlay = renderPawnAccessoryOverlay(pawnId, accessory);
  const wrap = (inner: string) =>
    `<svg viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true">${inner}${overlay}</svg>`;
  switch (pawnId) {
    case 'kucing':
      return wrap(`
        <polygon points="12,30 17,7 30,21" fill="${tintHex}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
        <polygon points="16,26 19,14 26,22" fill="#FF9BB8"/>
        <polygon points="52,30 47,7 34,21" fill="${tintHex}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
        <polygon points="48,26 45,14 38,22" fill="#FF9BB8"/>
        <circle cx="32" cy="36" r="19" fill="${tintHex}" stroke="${INK}" stroke-width="3.4"/>
        <circle cx="25" cy="21" r="4" fill="#FF5D8F" stroke="${INK}" stroke-width="2"/>
        <circle cx="39" cy="21" r="4" fill="#FF5D8F" stroke="${INK}" stroke-width="2"/>
        <circle cx="32" cy="21" r="2.8" fill="#FFD15C" stroke="${INK}" stroke-width="1.8"/>
        <ellipse cx="20" cy="40" rx="3.8" ry="2.2" fill="#FF9BB8"/>
        <ellipse cx="44" cy="40" rx="3.8" ry="2.2" fill="#FF9BB8"/>
        <circle cx="24" cy="34" r="3" fill="${INK}"/><circle cx="25" cy="33" r="1" fill="#FFFDF7"/>
        <circle cx="40" cy="34" r="3" fill="${INK}"/><circle cx="41" cy="33" r="1" fill="#FFFDF7"/>
        <polygon points="30,38 34,38 32,41" fill="#FF6B8B"/>
        <path d="M27 43 Q32 46 37 43" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
      `);
    case 'kodok':
      return wrap(`
        <ellipse cx="32" cy="18" rx="16" ry="4.5" fill="#5EE2AD" stroke="${INK}" stroke-width="2.8"/>
        <circle cx="37" cy="14" r="3.4" fill="#FFD15C" stroke="${INK}" stroke-width="1.8"/>
        <circle cx="19" cy="22" r="8" fill="${tintHex}" stroke="${INK}" stroke-width="3.2"/>
        <circle cx="45" cy="22" r="8" fill="${tintHex}" stroke="${INK}" stroke-width="3.2"/>
        <ellipse cx="32" cy="40" rx="22" ry="16" fill="${tintHex}" stroke="${INK}" stroke-width="3.4"/>
        <ellipse cx="32" cy="45" rx="13" ry="8" fill="#FFF6E5"/>
        <ellipse cx="18" cy="41" rx="3.8" ry="2.2" fill="#FF9BB8"/>
        <ellipse cx="46" cy="41" rx="3.8" ry="2.2" fill="#FF9BB8"/>
        <circle cx="19" cy="22" r="3.4" fill="${INK}"/><circle cx="20" cy="21" r="1.1" fill="#FFFDF7"/>
        <circle cx="45" cy="22" r="3.4" fill="${INK}"/><circle cx="46" cy="21" r="1.1" fill="#FFFDF7"/>
        <path d="M23 39 Q32 45 41 39" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
      `);
    case 'bebek':
      return wrap(`
        <path d="M29 14 Q26 6 33 12 Q37 6 38 14" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="32" cy="34" r="19" fill="${tintHex}" stroke="${INK}" stroke-width="3.4"/>
        <path d="M16 47 Q32 54 48 47" fill="none" stroke="#FF6B8B" stroke-width="6" stroke-linecap="round"/>
        <path d="M16 47 Q32 54 48 47" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <ellipse cx="20" cy="36" rx="3.6" ry="2.1" fill="#FF9BB8"/>
        <ellipse cx="44" cy="36" rx="3.6" ry="2.1" fill="#FF9BB8"/>
        <ellipse cx="32" cy="39" rx="10" ry="6" fill="#FF9852" stroke="${INK}" stroke-width="2.8"/>
        <circle cx="24" cy="28" r="3" fill="${INK}"/><circle cx="25" cy="27" r="1" fill="#FFFDF7"/>
        <circle cx="40" cy="28" r="3" fill="${INK}"/><circle cx="41" cy="27" r="1" fill="#FFFDF7"/>
      `);
    case 'panda':
      return wrap(`
        <line x1="48" y1="16" x2="54" y2="7" stroke="#5EE2AD" stroke-width="3.2" stroke-linecap="round"/>
        <ellipse cx="55" cy="9" rx="4.5" ry="2.2" transform="rotate(-20 55 9)" fill="#5EE2AD" stroke="${INK}" stroke-width="1.6"/>
        <circle cx="15" cy="18" r="8" fill="${INK}"/><circle cx="49" cy="18" r="8" fill="${INK}"/>
        <circle cx="32" cy="36" r="19" fill="#FFFDF7" stroke="${INK}" stroke-width="3.4"/>
        <ellipse cx="23" cy="34" rx="6" ry="5" transform="rotate(-14 23 34)" fill="${INK}"/>
        <ellipse cx="41" cy="34" rx="6" ry="5" transform="rotate(14 41 34)" fill="${INK}"/>
        <circle cx="23" cy="34" r="6.8" fill="none" stroke="${tintHex}" stroke-width="2.2"/>
        <circle cx="41" cy="34" r="6.8" fill="none" stroke="${tintHex}" stroke-width="2.2"/>
        <line x1="29.5" y1="34" x2="34.5" y2="34" stroke="${tintHex}" stroke-width="2.2"/>
        <circle cx="23" cy="33" r="1.9" fill="#FFFDF7"/><circle cx="41" cy="33" r="1.9" fill="#FFFDF7"/>
        <ellipse cx="18" cy="41" rx="3.4" ry="2" fill="#FF9BB8"/><ellipse cx="46" cy="41" rx="3.4" ry="2" fill="#FF9BB8"/>
        <path d="M28 43 Q32 46 36 43" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
      `);
    case 'dino':
      return wrap(`
        <polygon points="22,19 25,8 31,14 36,6 42,14 46,9 46,20" fill="#FFD15C" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M13 48 C13 22 48 16 50 38 C50 48 44 54 18 54 Z" fill="${tintHex}" stroke="${INK}" stroke-width="3.4"/>
        <polygon points="10,33 16,28 16,38" fill="#FF9852" stroke="${INK}" stroke-width="2"/>
        <polygon points="9,44 15,39 15,49" fill="#FFD15C" stroke="${INK}" stroke-width="2"/>
        <ellipse cx="32" cy="41" rx="4" ry="2.2" fill="#FF9BB8"/>
        <circle cx="37" cy="29" r="3.2" fill="${INK}"/><circle cx="38" cy="28" r="1.1" fill="#FFFDF7"/>
        <path d="M40 38 Q45 40 48 37" fill="none" stroke="${INK}" stroke-width="2.3" stroke-linecap="round"/>
      `);
    case 'jamur':
    default:
      return wrap(`
        <rect x="21" y="34" width="22" height="20" rx="9" fill="#FFF6E5" stroke="${INK}" stroke-width="3.2"/>
        <path d="M9 36 C9 11 55 11 55 36 Z" fill="${tintHex}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
        <circle cx="20" cy="25" r="4.2" fill="#FFFDF7"/><circle cx="44" cy="24" r="3.8" fill="#FFFDF7"/>
        <polygon points="32,16 34,21 39,21 35,24 36,29 32,26 28,29 29,24 25,21 30,21" fill="#FFD15C" stroke="${INK}" stroke-width="1.6"/>
        <ellipse cx="24" cy="46" rx="2.8" ry="1.7" fill="#FF9BB8"/><ellipse cx="40" cy="46" rx="2.8" ry="1.7" fill="#FF9BB8"/>
        <circle cx="28" cy="42" r="2.4" fill="${INK}"/><circle cx="36" cy="42" r="2.4" fill="${INK}"/>
      `);
  }
}

export function renderItemSvg(itemId: string, size = 24): string {
  const s = size;
  switch (itemId) {
    case 'swap_turbo':
    case 'turbo':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <path d="M26 4 L12 26 H23 L18 44 L36 20 H25 Z" fill="#FFD15C" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      </svg>`;
    case 'magnet_star':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <path d="M12 10 V24 A12 12 0 0 0 36 24 V10 H29 V24 A5 5 0 0 1 19 24 V10 Z" fill="#FF6B7B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <rect x="12" y="10" width="7" height="6" fill="#E9ECEF" stroke="${INK}" stroke-width="2.5"/>
        <rect x="29" y="10" width="7" height="6" fill="#E9ECEF" stroke="${INK}" stroke-width="2.5"/>
        <polygon points="24,10 26,15 31,15 27,18 28,23 24,20 20,23 21,18 17,15 22,15" fill="#FFD15C" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      </svg>`;
    case 'surprise':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <rect x="9" y="18" width="30" height="22" rx="5" fill="#FF86AD" stroke="${INK}" stroke-width="3"/>
        <rect x="7" y="12" width="34" height="8" rx="3" fill="#FFD15C" stroke="${INK}" stroke-width="2.8"/>
        <line x1="24" y1="12" x2="24" y2="40" stroke="#FFFDF7" stroke-width="4"/>
      </svg>`;
    case 'shield':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <path d="M24 5 L40 11 V23 C40 34 31 41 24 44 C17 41 8 34 8 23 V11 Z" fill="#72C0FF" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M24 12 V36" stroke="#FFFDF7" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
    case 'brake':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="16,8 32,8 40,16 40,32 32,40 16,40 8,32 8,16" fill="#FF6B7B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <rect x="16" y="21" width="16" height="6" rx="2" fill="#FFFDF7"/>
      </svg>`;
    case 'swap':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <path d="M10 17 H34 L27 10 M38 31 H14 L21 38" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case 'golden_dice':
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <rect x="8" y="8" width="32" height="32" rx="8" fill="#FFD15C" stroke="${INK}" stroke-width="3"/>
        <circle cx="17" cy="17" r="3" fill="${INK}"/><circle cx="31" cy="17" r="3" fill="${INK}"/>
        <circle cx="24" cy="24" r="3" fill="#FF6B7B"/>
        <circle cx="17" cy="31" r="3" fill="${INK}"/><circle cx="31" cy="31" r="3" fill="${INK}"/>
      </svg>`;
    case 'sabotage':
    default:
      return `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="23" cy="28" r="13" fill="#3E3A4F" stroke="${INK}" stroke-width="3"/>
        <path d="M30 16 C33 10 38 9 41 12" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="42" cy="12" r="4" fill="#FF9852" stroke="${INK}" stroke-width="2"/>
      </svg>`;
  }
}

export type UiIconKind =
  | 'dice'
  | 'star'
  | 'shop'
  | 'camera'
  | 'sound'
  | 'muted'
  | 'help'
  | 'settings'
  | 'flame'
  | 'trophy'
  | 'ladder'
  | 'snake'
  | 'fast'
  | 'skip'
  | 'timer'
  | 'globe'
  | 'users'
  | 'bot'
  | 'back'
  | 'play'
  | 'link'
  | 'check'
  | 'music'
  | 'eye'
  | 'text'
  | 'spark'
  | 'book'
  | 'brain'
  | 'reset'
  | 'home'
  | 'leave'
  | 'sticker'
  | 'bolt';

export function renderUiIconSvg(kind: UiIconKind, size = 20): string {
  const s = size;
  switch (kind) {
    case 'dice':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <rect x="5" y="5" width="26" height="26" rx="6" fill="#FFFDF7" stroke="${INK}" stroke-width="3"/>
        <circle cx="12" cy="12" r="2.3" fill="${INK}"/><circle cx="24" cy="12" r="2.3" fill="${INK}"/>
        <circle cx="18" cy="18" r="2.6" fill="#FF6B7B"/>
        <circle cx="12" cy="24" r="2.3" fill="${INK}"/><circle cx="24" cy="24" r="2.3" fill="${INK}"/>
      </svg>`;
    case 'star':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="18,4 22,13 32,14 25,21 27,31 18,26 9,31 11,21 4,14 14,13" fill="#FFD15C" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
      </svg>`;
    case 'shop':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M5 13 L8 6 H28 L31 13 Z" fill="#FF86AD" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <rect x="7" y="13" width="22" height="17" rx="3" fill="#FFF6E5" stroke="${INK}" stroke-width="2.6"/>
        <rect x="14" y="19" width="8" height="11" fill="#72C0FF" stroke="${INK}" stroke-width="2"/>
      </svg>`;
    case 'flame':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M18 4 C24 11 28 16 28 22 A10 10 0 0 1 8 22 C8 16 12 13 14 9 C15 13 18 11 18 4 Z" fill="#FF9852" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M18 17 C21 20 22 24 18 28 C14 24 15 20 18 17 Z" fill="#FFD15C"/>
      </svg>`;
    case 'trophy':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M10 7 H26 V16 A8 8 0 0 1 10 16 Z" fill="#FFD15C" stroke="${INK}" stroke-width="2.6"/>
        <path d="M18 24 V29 M12 29 H24" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
    case 'ladder':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M12 5 V31 M24 5 V31 M12 11 H24 M12 18 H24 M12 25 H24" stroke="#34A87F" stroke-width="3.2" stroke-linecap="round"/>
      </svg>`;
    case 'snake':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M9 28 C9 19 25 22 25 13 C25 8 20 6 16 8" fill="none" stroke="#E05780" stroke-width="4" stroke-linecap="round"/>
        <circle cx="15" cy="9" r="4" fill="#FF86AD" stroke="${INK}" stroke-width="2"/>
      </svg>`;
    case 'camera':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <rect x="5" y="10" width="26" height="18" rx="4" fill="#72C0FF" stroke="${INK}" stroke-width="2.6"/>
        <circle cx="18" cy="19" r="5" fill="#FFFDF7" stroke="${INK}" stroke-width="2.4"/>
      </svg>`;
    case 'sound':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="7,14 14,14 21,8 21,28 14,22 7,22" fill="#5EE2AD" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M25 13 Q29 18 25 23" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
      </svg>`;
    case 'muted':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="7,14 14,14 21,8 21,28 14,22 7,22" fill="#E9ECEF" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M24 14 L30 22 M30 14 L24 22" stroke="#FF6B7B" stroke-width="2.8" stroke-linecap="round"/>
      </svg>`;
    case 'help':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="13" fill="#FFD15C" stroke="${INK}" stroke-width="2.5"/>
        <path d="M14.5 14.5 A3.5 3.5 0 1 1 19 18 V20" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="18" cy="25" r="1.7" fill="${INK}"/>
      </svg>`;
    case 'settings':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="10" fill="#B295FF" stroke="${INK}" stroke-width="2.6"/>
        <circle cx="18" cy="18" r="4.5" fill="#FFFDF7" stroke="${INK}" stroke-width="2.4"/>
      </svg>`;
    case 'fast':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="7,9 18,18 7,27" fill="#FFD15C" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
        <polygon points="18,9 29,18 18,27" fill="#FF9852" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>`;
    case 'skip':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="7,9 21,18 7,27" fill="#5EE2AD" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="24" y="9" width="5" height="18" rx="2" fill="#FFFDF7" stroke="${INK}" stroke-width="2.5"/>
      </svg>`;
    case 'timer':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <line x1="14" y1="5" x2="22" y2="5" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
        <circle cx="18" cy="20" r="11" fill="#FFFDF7" stroke="${INK}" stroke-width="2.6"/>
        <path d="M18 13 V20 L23 23" fill="none" stroke="#FF6B7B" stroke-width="2.8" stroke-linecap="round"/>
      </svg>`;
    case 'globe':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="12" fill="#72C0FF" stroke="${INK}" stroke-width="2.6"/>
        <ellipse cx="18" cy="18" rx="6" ry="12" fill="none" stroke="${INK}" stroke-width="2"/>
        <line x1="6" y1="18" x2="30" y2="18" stroke="${INK}" stroke-width="2"/>
      </svg>`;
    case 'users':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="13" cy="13" r="4.5" fill="#5EE2AD" stroke="${INK}" stroke-width="2.4"/>
        <path d="M5 29 C5 22 21 22 21 29 Z" fill="#5EE2AD" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="24" cy="14" r="4" fill="#FFD15C" stroke="${INK}" stroke-width="2.4"/>
        <path d="M19 29 C19 23 31 23 31 29 Z" fill="#FFD15C" stroke="${INK}" stroke-width="2.4"/>
      </svg>`;
    case 'bot':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <line x1="18" y1="5" x2="18" y2="10" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="18" cy="5" r="2.2" fill="#FF86AD" stroke="${INK}" stroke-width="1.8"/>
        <rect x="7" y="10" width="22" height="18" rx="6" fill="#72C0FF" stroke="${INK}" stroke-width="2.6"/>
        <circle cx="13" cy="18" r="2.2" fill="#FFFDF7"/><circle cx="23" cy="18" r="2.2" fill="#FFFDF7"/>
        <line x1="13" y1="24" x2="23" y2="24" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;
    case 'back':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M26 18 H10 M16 11 L9 18 L16 25" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case 'play':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="10,7 29,18 10,29" fill="#5EE2AD" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
      </svg>`;
    case 'link':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <rect x="6" y="13" width="14" height="10" rx="5" fill="none" stroke="${INK}" stroke-width="2.8"/>
        <rect x="16" y="13" width="14" height="10" rx="5" fill="none" stroke="#34A87F" stroke-width="2.8"/>
      </svg>`;
    case 'check':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="12" fill="#5EE2AD" stroke="${INK}" stroke-width="2.6"/>
        <path d="M12 18 L16.5 22.5 L25 13.5" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case 'music':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M14 25 V9 L28 6 V22" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="11" cy="26" r="4" fill="#FFD15C" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="25" cy="23" r="4" fill="#FF86AD" stroke="${INK}" stroke-width="2.4"/>
      </svg>`;
    case 'eye':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M4 18 C9 10 27 10 32 18 C27 26 9 26 4 18 Z" fill="#FFFDF7" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <circle cx="18" cy="18" r="4.8" fill="#72C0FF" stroke="${INK}" stroke-width="2.4"/>
      </svg>`;
    case 'text':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M6 27 L13 9 L20 27 M8.5 21 H17.5" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M22 21 H30 M26 15 V27" fill="none" stroke="#FF6B7B" stroke-width="2.8" stroke-linecap="round"/>
      </svg>`;
    case 'spark':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M18 4 L21 15 L32 18 L21 21 L18 32 L15 21 L4 18 L15 15 Z" fill="#FFD15C" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      </svg>`;
    case 'book':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M6 8 H17 V28 H6 Z M19 8 H30 V28 H19 Z" fill="#FFFDF7" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <line x1="9" y1="14" x2="14" y2="14" stroke="#FF86AD" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="22" y1="14" x2="27" y2="14" stroke="#72C0FF" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
    case 'brain':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M18 8 C11 8 7 13 8 19 C7 24 11 28 18 28 C25 28 29 24 28 19 C29 13 25 8 18 8 Z" fill="#FF86AD" stroke="${INK}" stroke-width="2.6"/>
        <line x1="18" y1="9" x2="18" y2="27" stroke="${INK}" stroke-width="2"/>
      </svg>`;
    case 'reset':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M27 14 A10 10 0 1 0 26 24" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
        <polygon points="29,8 29,16 21,15" fill="#5EE2AD" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      </svg>`;
    case 'home':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="5,18 18,6 31,18" fill="#FF9852" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <rect x="9" y="17" width="18" height="13" rx="2" fill="#FFFDF7" stroke="${INK}" stroke-width="2.6"/>
        <rect x="15" y="21" width="6" height="9" fill="#72C0FF" stroke="${INK}" stroke-width="2"/>
      </svg>`;
    case 'leave':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <path d="M18 7 H9 V29 H18" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 18 H28 M23 13 L29 18 L23 23" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case 'sticker':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="12" fill="#FFD15C" stroke="${INK}" stroke-width="2.6"/>
        <circle cx="14" cy="15" r="1.9" fill="${INK}"/><circle cx="22" cy="15" r="1.9" fill="${INK}"/>
        <path d="M13 21 Q18 25 23 21" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;
    case 'bolt':
    default:
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <polygon points="20,4 8,20 17,20 14,32 28,16 19,16" fill="#FFD15C" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>`;
  }
}

export function renderEmoteSvg(emoteId: string, size = 24): string {
  const s = size;
  switch (emoteId) {
    case 'jempol':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="13" fill="#5EE2AD" stroke="${INK}" stroke-width="2.5"/>
        <path d="M14 17 V25 H24 L26 16 H20 L21 10 C21 9 19 9 18 11 Z" fill="#FFFDF7" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
      </svg>`;
    case 'ketawa':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="13" fill="#FFD15C" stroke="${INK}" stroke-width="2.5"/>
        <path d="M11 15 L15 13 M25 15 L21 13" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M12 20 H24 C24 25 12 25 12 20 Z" fill="#FF6B7B" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
      </svg>`;
    case 'kaget':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="13" fill="#B295FF" stroke="${INK}" stroke-width="2.5"/>
        <circle cx="13" cy="15" r="2.2" fill="#FFFDF7" stroke="${INK}" stroke-width="1.5"/>
        <circle cx="23" cy="15" r="2.2" fill="#FFFDF7" stroke="${INK}" stroke-width="1.5"/>
        <ellipse cx="18" cy="23" rx="3.2" ry="4" fill="#FFFDF7" stroke="${INK}" stroke-width="2.2"/>
      </svg>`;
    case 'nangis':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="13" fill="#72C0FF" stroke="${INK}" stroke-width="2.5"/>
        <line x1="11" y1="15" x2="15" y2="15" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="21" y1="15" x2="25" y2="15" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
        <rect x="12" y="16" width="2.5" height="6" rx="1" fill="#FFFDF7"/>
        <rect x="21.5" y="16" width="2.5" height="6" rx="1" fill="#FFFDF7"/>
        <path d="M13 25 Q18 21 23 25" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;
    case 'api':
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="13" fill="#FF9852" stroke="${INK}" stroke-width="2.5"/>
        <path d="M18 8 C22 13 24 16 24 20 A6 6 0 0 1 12 20 C12 16 14 14 15 11 C16 14 18 12 18 8 Z" fill="#FFD15C" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      </svg>`;
    case 'mahkota':
    default:
      return `<svg viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">
        <circle cx="18" cy="18" r="13" fill="#FF86AD" stroke="${INK}" stroke-width="2.5"/>
        <polygon points="10,23 11,13 15,17 18,11 21,17 25,13 26,23" fill="#FFD15C" stroke="${INK}" stroke-width="2.1" stroke-linejoin="round"/>
      </svg>`;
  }
}

export function renderBossDoodleSvg(hpRatio: number): string {
  const isKo = hpRatio <= 0;
  const isHurt = hpRatio > 0 && hpRatio <= 0.45;
  const bodyColor = isKo ? '#D8D4CE' : isHurt ? '#FF86AD' : '#B295FF';
  const eyes = isKo
    ? `<path d="M28 42 L38 50 M38 42 L28 50 M62 42 L72 50 M72 42 L62 50" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`
    : `<circle cx="34" cy="46" r="7" fill="#FFFDF7" stroke="${INK}" stroke-width="3"/><circle cx="66" cy="46" r="7" fill="#FFFDF7" stroke="${INK}" stroke-width="3"/>
       <circle cx="34" cy="46" r="3" fill="${INK}"/><circle cx="66" cy="46" r="3" fill="${INK}"/>
       <path d="M24 35 L42 40 M76 35 L58 40" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 100 92" width="84" height="78" aria-hidden="true">
    <polygon points="22,22 14,6 34,14" fill="#FFD15C" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
    <polygon points="78,22 86,6 66,14" fill="#FFD15C" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M16 48 C16 18 84 18 84 48 C86 72 72 82 50 82 C28 82 14 72 16 48 Z" fill="${bodyColor}" stroke="${INK}" stroke-width="3.8"/>
    ${eyes}
    <path d="${isHurt || isKo ? 'M36 66 Q50 58 64 66' : 'M34 62 Q50 74 66 62'}" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`;
}

export function renderGiftBoxSvg(isTrap: boolean, opened: boolean): string {
  const boxCol = !opened ? '#FF86AD' : isTrap ? '#FF6B7B' : '#5EE2AD';
  return `<svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">
    <rect x="10" y="24" width="44" height="32" rx="6" fill="${boxCol}" stroke="${INK}" stroke-width="3.2"/>
    <rect x="8" y="${opened ? 10 : 18}" width="48" height="10" rx="4" fill="#FFD15C" stroke="${INK}" stroke-width="3"/>
    <line x1="32" y1="24" x2="32" y2="56" stroke="#FFFDF7" stroke-width="5"/>
    <circle cx="26" cy="${opened ? 8 : 15}" r="4.5" fill="#FF86AD" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="38" cy="${opened ? 8 : 15}" r="4.5" fill="#FF86AD" stroke="${INK}" stroke-width="2.5"/>
  </svg>`;
}

export function renderDodgeRockSvg(variant = 0): string {
  const fill = variant % 2 === 0 ? '#FF6B7B' : '#3E3A4F';
  return `<svg viewBox="0 0 40 40" width="28" height="28" aria-hidden="true">
    <polygon points="20,4 33,12 36,27 24,36 9,33 5,18" fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="16" cy="18" r="2.3" fill="#FFFDF7"/><circle cx="25" cy="19" r="2.3" fill="#FFFDF7"/>
  </svg>`;
}
