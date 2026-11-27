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

export interface MonogramFontPreset {
  id: string;
  nameKh: string;
  nameEn: string;
  fontFamily: string;
  sample: string;
  styleGroup: 'traditional' | 'modern';
  badgeKh: string;
  badgeEn: string;
}

export const MONOGRAM_FONT_PRESETS_KH: MonogramFontPreset[] = [
  {
    id: 'auto',
    nameKh: 'លំនាំដើម (Auto)',
    nameEn: 'Default Traditional',
    fontFamily: '',
    sample: 'ម & វ',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'moulpali',
    nameKh: 'Moulpali (មូលបាលី)',
    nameEn: 'Royal Traditional Moulpali',
    fontFamily: "'Moulpali', 'Noto Serif Khmer', serif",
    sample: 'ម & វ',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'moul',
    nameKh: 'Moul (អក្សរមូលបុរាណ)',
    nameEn: 'Classic Khmer Moul',
    fontFamily: "'Moul', 'Noto Serif Khmer', serif",
    sample: 'ម & វ',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'angkor',
    nameKh: 'Angkor (ក្បាច់អង្គរ)',
    nameEn: 'Angkor Heritage',
    fontFamily: "'Angkor', 'Moul', serif",
    sample: 'ម & វ',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'bokor',
    nameKh: 'Bokor (បូកគោប្រពៃណី)',
    nameEn: 'Bokor Traditional',
    fontFamily: "'Bokor', 'Moul', serif",
    sample: 'ម & វ',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'taprom',
    nameKh: 'Taprom (តាព្រហ្មបុរាណ)',
    nameEn: 'Taprom Temple',
    fontFamily: "'Taprom', 'Moul', serif",
    sample: 'ម & វ',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'battambang',
    nameKh: 'Battambang (បាត់ដំបងសម័យ)',
    nameEn: 'Battambang Modern',
    fontFamily: "'Battambang', 'Noto Serif Khmer', serif",
    sample: 'ម & វ',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'freehand',
    nameKh: 'Freehand (អក្សរដៃសម័យ)',
    nameEn: 'Freehand Script',
    fontFamily: "'Freehand', 'Noto Serif Khmer', cursive",
    sample: 'ម & វ',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'fasthand',
    nameKh: 'Fasthand (ហត្ថលេខាសម័យ)',
    nameEn: 'Fasthand Reception',
    fontFamily: "'Fasthand', 'Freehand', cursive",
    sample: 'ម & វ',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'kantumruy',
    nameKh: 'Kantumruy Pro (កន្ទឹមរុយសម័យ)',
    nameEn: 'Kantumruy Modern',
    fontFamily: "'Kantumruy Pro', 'Noto Sans Khmer', sans-serif",
    sample: 'ម & វ',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'dangrek',
    nameKh: 'Dangrek (ដងរែកសម័យ)',
    nameEn: 'Dangrek Chic',
    fontFamily: "'Dangrek', 'Noto Serif Khmer', serif",
    sample: 'ម & វ',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'noto-serif-khmer',
    nameKh: 'Noto Serif (ឆើតឆាយសម័យ)',
    nameEn: 'Luxury Khmer Serif',
    fontFamily: "'Noto Serif Khmer', serif",
    sample: 'ម & វ',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
];

export const MONOGRAM_FONT_PRESETS_EN: MonogramFontPreset[] = [
  {
    id: 'auto',
    nameKh: 'Default (Auto)',
    nameEn: 'Classic Royal Serif',
    fontFamily: '',
    sample: 'M & V',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'playfair',
    nameKh: 'Playfair Display',
    nameEn: 'Traditional Heritage Serif',
    fontFamily: "'Playfair Display', Georgia, serif",
    sample: 'M & V',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'cinzel',
    nameKh: 'Cinzel (Royal)',
    nameEn: 'Royal Monogram Crest',
    fontFamily: "'Cinzel', serif",
    sample: 'M & V',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'great-vibes',
    nameKh: 'Great Vibes',
    nameEn: 'Royal Calligraphy',
    fontFamily: "'Great Vibes', cursive",
    sample: 'M & V',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'alex-brush',
    nameKh: 'Alex Brush',
    nameEn: 'Classic Brush Script',
    fontFamily: "'Alex Brush', cursive",
    sample: 'M & V',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'parisienne',
    nameKh: 'Parisienne',
    nameEn: 'Vintage Ballroom Script',
    fontFamily: "'Parisienne', cursive",
    sample: 'M & V',
    styleGroup: 'traditional',
    badgeKh: 'មង្គលការប្រពៃណី',
    badgeEn: 'Traditional Wedding',
  },
  {
    id: 'norican',
    nameKh: 'Norican (Modern)',
    nameEn: 'Modern Reception Script',
    fontFamily: "'Norican', cursive",
    sample: 'M & V',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'dancing-script',
    nameKh: 'Dancing Script',
    nameEn: 'Modern Romance Script',
    fontFamily: "'Dancing Script', cursive",
    sample: 'M & V',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'satisfy',
    nameKh: 'Satisfy (Reception)',
    nameEn: 'Modern Signature Cursive',
    fontFamily: "'Satisfy', cursive",
    sample: 'M & V',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'playfair-italic',
    nameKh: 'Playfair Italic',
    nameEn: 'Editorial Luxury Serif',
    fontFamily: "italic 'Playfair Display', Georgia, serif",
    sample: 'M & V',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'cinzel-modern',
    nameKh: 'Cinzel Luxury',
    nameEn: 'Modern Gala Monogram',
    fontFamily: "'Cinzel', 'Playfair Display', serif",
    sample: 'M & V',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
  {
    id: 'georgia-modern',
    nameKh: 'Georgia Minimal',
    nameEn: 'Clean Modern Serif',
    fontFamily: "Georgia, 'Playfair Display', serif",
    sample: 'M & V',
    styleGroup: 'modern',
    badgeKh: 'មង្គលការបែបសម័យ',
    badgeEn: 'Modern Reception',
  },
];

export const MONOGRAM_FONT_PRESETS = [
  ...MONOGRAM_FONT_PRESETS_KH,
  ...MONOGRAM_FONT_PRESETS_EN,
];

const KHMER_FONT_RE = /(Moulpali|Moul|Angkor|Bokor|Battambang|Taprom|Freehand|Khmer|AKbalthom|Kantumruy|Siemreap|Dangrek|Content|Fasthand|Konkhmer)/i;
const LATIN_ONLY_FONT_RE = /(Playfair Display|Cinzel|Great Vibes|Alex Brush|Norican|Dancing Script|Parisienne|Satisfy|Georgia)/i;

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

