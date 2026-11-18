export function getFirstNameInitial(
  primary?: string,
  fallbackName?: string,
  fallbackChar = 'R'
): string {
  const raw = (primary && primary.trim()) || (fallbackName && fallbackName.trim()) || '';
  if (!raw) return fallbackChar;

  const cleaned = raw
    .trim()
    .replace(
      /^(លោកស្រី|លោកជំទាវ|ឯកឧត្តម|អ្នកនាង|កញ្ញា|លោក|កូនកំលោះ|កូនក្រមុំ|Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?)\s+/i,
      ''
    )
    .trim();

  const firstChar = cleaned.charAt(0);
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

export const MONOGRAM_FONT_PRESETS = [
  { id: 'auto', nameKh: 'លំនាំដើម (Auto)', fontFamily: '', sample: 'R & U' },
  { id: 'playfair', nameKh: 'Playfair (បុរាណប្រណិត)', fontFamily: "'Playfair Display', Georgia, serif", sample: 'R & U' },
  { id: 'cinzel', nameKh: 'Cinzel (រាជវាំង)', fontFamily: "'Cinzel', serif", sample: 'R & U' },
  { id: 'great-vibes', nameKh: 'Great Vibes (រ៉ូមែនទិក)', fontFamily: "'Great Vibes', cursive", sample: 'R & U' },
  { id: 'alex-brush', nameKh: 'Alex Brush (ទន់ភ្លន់)', fontFamily: "'Alex Brush', cursive", sample: 'R & U' },
  { id: 'norican', nameKh: 'Norican (អក្សរដៃ)', fontFamily: "'Norican', cursive", sample: 'R & U' },
  { id: 'moulpali', nameKh: 'Moulpali (ខ្មែរ មូលបាលី)', fontFamily: "'Moulpali', 'Noto Serif Khmer', serif", sample: 'រ & អ' },
  { id: 'moul', nameKh: 'Moul (ខ្មែរ មូល)', fontFamily: "'Moul', 'Noto Serif Khmer', serif", sample: 'រ & អ' },
];
