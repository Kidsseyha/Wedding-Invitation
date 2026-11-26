export function getFirstNameInitial(
  primary?: string,
  fallbackName?: string,
  fallbackChar = 'R'
): string {
  const raw = (primary && primary.trim()) || (fallbackName && fallbackName.trim()) || '';
  if (!raw) return fallbackChar;

  const cleaned = raw
    .replace(/[\u200B-\u200D\uFEFF]+/g, ' ')
    .trim()
    .replace(
      /^(លោកស្រី|លោកជំទាវ|ឯកឧត្តម|អ្នកនាង|អ្នកស្រី|កញ្ញា|លោក|កូនកំលោះ|កូនក្រមុំ|Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?)\s+/i,
      ''
    )
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const lastWord = words.length > 1 ? words[words.length - 1] : (words[0] || '');
  const firstChar = lastWord.charAt(0);
  if (!firstChar) return fallbackChar;
  return /[a-z]/i.test(firstChar) ? firstChar.toUpperCase() : firstChar;
}

export const MONOGRAM_COLOR_PRESETS = [
  { nameKh: 'មាសបុរាណ (Antique Gold)', hex: '#9c732d' },
  { nameKh: 'មាសសំរឹទ្ធ (Royal Bronze)', hex: '#8f6c2e' },
  { nameKh: 'មាសភ្លឺ (Champagne Gold)', hex: '#c59b27' },
  { nameKh: 'មាសត្នោត (Warm Amber)', hex: '#b08639' },
  { nameKh: 'ក្រហមរាជវង្ស (Royal Burgundy)', hex: '#6c2925' },
  { nameKh: 'បៃតងមរកត (Emerald)', hex: '#1c5238' },
  { nameKh: 'ខៀវរាជវង្ស (Royal Navy)', hex: '#1e3a5f' },
  { nameKh: 'ត្នោតចាស់ (Classic Espresso)', hex: '#451a03' },
];

export const MONOGRAM_FONT_PRESETS_KH = [
  { id: 'auto', nameKh: 'លំនាំដើម (Auto)', fontFamily: '', sample: 'ម & វ' },
  { id: 'moulpali', nameKh: 'Moulpali (មូលបាលី)', fontFamily: "'Moulpali', 'Noto Serif Khmer', serif", sample: 'ម & វ' },
  { id: 'moul', nameKh: 'Moul (អក្សរមូល)', fontFamily: "'Moul', 'Noto Serif Khmer', serif", sample: 'ម & វ' },
  { id: 'angkor', nameKh: 'Angkor (អង្គរ)', fontFamily: "'Angkor', 'Moul', serif", sample: 'ម & វ' },
  { id: 'bokor', nameKh: 'Bokor (បូកគោ)', fontFamily: "'Bokor', 'Moul', serif", sample: 'ម & វ' },
  { id: 'battambang', nameKh: 'Battambang (បាត់ដំបង)', fontFamily: "'Battambang', 'Noto Serif Khmer', serif", sample: 'ម & វ' },
  { id: 'taprom', nameKh: 'Taprom (តាព្រហ្ម)', fontFamily: "'Taprom', 'Moul', serif", sample: 'ម & វ' },
  { id: 'freehand', nameKh: 'Freehand (អក្សរដៃ)', fontFamily: "'Freehand', 'Noto Serif Khmer', cursive", sample: 'ម & វ' },
];

export const MONOGRAM_FONT_PRESETS_EN = [
  { id: 'auto', nameKh: 'Default (Auto)', fontFamily: '', sample: 'M & V' },
  { id: 'playfair', nameKh: 'Playfair Display', fontFamily: "'Playfair Display', Georgia, serif", sample: 'M & V' },
  { id: 'cinzel', nameKh: 'Cinzel (Royal)', fontFamily: "'Cinzel', serif", sample: 'M & V' },
  { id: 'great-vibes', nameKh: 'Great Vibes', fontFamily: "'Great Vibes', cursive", sample: 'M & V' },
  { id: 'alex-brush', nameKh: 'Alex Brush', fontFamily: "'Alex Brush', cursive", sample: 'M & V' },
  { id: 'norican', nameKh: 'Norican', fontFamily: "'Norican', cursive", sample: 'M & V' },
  { id: 'dancing-script', nameKh: 'Dancing Script', fontFamily: "'Dancing Script', cursive", sample: 'M & V' },
  { id: 'parisienne', nameKh: 'Parisienne', fontFamily: "'Parisienne', cursive", sample: 'M & V' },
];

export const MONOGRAM_FONT_PRESETS = [
  ...MONOGRAM_FONT_PRESETS_EN.slice(0, 6),
  ...MONOGRAM_FONT_PRESETS_KH.slice(1, 3),
];

const KHMER_FONT_RE = /(Moulpali|Moul|Angkor|Bokor|Battambang|Taprom|Freehand|Khmer|AKbalthom|Kantumruy|Siemreap|Dangrek|Content|Fasthand)/i;
const LATIN_ONLY_FONT_RE = /(Playfair Display|Cinzel|Great Vibes|Alex Brush|Norican|Dancing Script|Parisienne|Satisfy)/i;

export function resolveMonogramFontFamily(
  language: string | undefined,
  khFont?: string,
  enFont?: string,
  isLatinInitials?: boolean
): string {
  const isKhmer = (language || 'kh') === 'kh';
  const defaultEn = "'Playfair Display', 'Cinzel', Georgia, serif";
  const defaultKh = "'Moulpali', 'Moul', 'Noto Serif Khmer', serif";

  if (!isKhmer) {
    if (enFont && enFont.trim()) return enFont;
    if (khFont && khFont.trim() && !KHMER_FONT_RE.test(khFont)) return khFont;
    return defaultEn;
  }

  if (isLatinInitials) {
    if (khFont && khFont.trim() && !KHMER_FONT_RE.test(khFont)) return khFont;
    if (enFont && enFont.trim()) return enFont;
    return defaultEn;
  }

  if (khFont && khFont.trim() && !LATIN_ONLY_FONT_RE.test(khFont)) {
    return khFont;
  }
  return defaultKh;
}

