import { AnniversaryStoryChapter, Language } from '../types.js';

export interface FormattedAnniversarySchedule {
  dateLabelKh: string;
  dateLabelEn: string;
  timeLabelKh: string;
  timeLabelEn: string;
  targetYearEn: string;
}

const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];

const KHMER_WEEKDAYS = [
  'ថ្ងៃអាទិត្យ',
  'ថ្ងៃចន្ទ',
  'ថ្ងៃអង្គារ',
  'ថ្ងៃពុធ',
  'ថ្ងៃព្រហស្បតិ៍',
  'ថ្ងៃសុក្រ',
  'ថ្ងៃសៅរ៍',
];

const KHMER_MONTHS = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
];

export function toKhmerDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (d) => KHMER_DIGITS[Number(d)]);
}

export function fromKhmerDigits(input: string): string {
  return input.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)));
}

export function containsKhmerScript(text?: string): boolean {
  if (!text) return false;
  return /[\u1780-\u17FF]/.test(text);
}

export function parseMilestoneYears(milestoneKh?: string, milestoneEn?: string): number | null {
  const candidates = [milestoneEn || '', milestoneKh || ''];
  for (const raw of candidates) {
    const normalized = fromKhmerDigits(raw);
    const match = normalized.match(/\d+/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed < 200) {
        return parsed;
      }
    }
  }
  return null;
}

export function formatOrdinalEn(num: number): string {
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1:
      return `${num}st`;
    case 2:
      return `${num}nd`;
    case 3:
      return `${num}rd`;
    default:
      return `${num}th`;
  }
}

export function formatAnniversaryMilestone(
  milestoneKh?: string,
  milestoneEn?: string,
  language: Language = 'kh'
): {
  kickerLabel: string;
  yearsBadge: string;
  yearsNumber: number | null;
} {
  const years = parseMilestoneYears(milestoneKh, milestoneEn);
  const cleanKh = (milestoneKh || '').trim();
  const cleanEn = (milestoneEn || '').trim();

  if (language === 'kh') {
    if (years !== null) {
      const khYears = toKhmerDigits(years);
      return {
        kickerLabel: `ជំពូកស្នេហា · គម្រប់ខួប ${khYears} ឆ្នាំ`,
        yearsBadge: `${khYears} ឆ្នាំ`,
        yearsNumber: years,
      };
    }
    if (cleanKh) {
      return {
        kickerLabel: cleanKh.includes('ខួប') ? cleanKh : `ជំពូកស្នេហា · ${cleanKh}`,
        yearsBadge: cleanKh,
        yearsNumber: null,
      };
    }
    return {
      kickerLabel: 'ជំពូកស្នេហា · ខួបអាពាហ៍ពិពាហ៍',
      yearsBadge: 'សិរីមង្គល',
      yearsNumber: null,
    };
  }

  if (years !== null) {
    const ord = formatOrdinalEn(years);
    return {
      kickerLabel: `LOVE STORY CHAPTER · ${ord.toUpperCase()} ANNIVERSARY`,
      yearsBadge: `${years} Years`,
      yearsNumber: years,
    };
  }
  if (cleanEn) {
    return {
      kickerLabel: `LOVE STORY CHAPTER · ${cleanEn.toUpperCase()}`,
      yearsBadge: cleanEn,
      yearsNumber: null,
    };
  }
  return {
    kickerLabel: 'LOVE STORY CHAPTER · WEDDING ANNIVERSARY',
    yearsBadge: 'Together',
    yearsNumber: null,
  };
}

export function formatKhmerTimeLabel(timeInput?: string): {
  timeLabelKh: string;
  timeLabelEn: string;
} {
  const trimmed = (timeInput || '').trim();
  if (!trimmed) {
    return { timeLabelKh: 'ម៉ោង ០៦:០០ ល្ងាច', timeLabelEn: '6:00 PM' };
  }

  let hours24: number | null = null;
  let minutes = 0;

  if (trimmed.includes('T')) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      hours24 = d.getHours();
      minutes = d.getMinutes();
    }
  } else {
    const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (match12) {
      let h = parseInt(match12[1], 10);
      minutes = parseInt(match12[2], 10);
      const ampm = match12[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      hours24 = h;
    } else if (match24) {
      hours24 = parseInt(match24[1], 10);
      minutes = parseInt(match24[2], 10);
    }
  }

  if (hours24 === null || Number.isNaN(hours24) || Number.isNaN(minutes)) {
    return { timeLabelKh: trimmed, timeLabelEn: trimmed };
  }

  const isPM = hours24 >= 12;
  const h12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minPadded = String(minutes).padStart(2, '0');
  const h12Padded = String(h12).padStart(2, '0');

  let khPeriod = 'ព្រឹក';
  if (hours24 >= 12 && hours24 < 17) khPeriod = 'រសៀល';
  else if (hours24 >= 17 && hours24 < 20) khPeriod = 'ល្ងាច';
  else if (hours24 >= 20) khPeriod = 'យប់';

  return {
    timeLabelKh: `ម៉ោង ${toKhmerDigits(h12Padded)}:${toKhmerDigits(minPadded)} ${khPeriod}`,
    timeLabelEn: `${h12}:${minPadded} ${isPM ? 'PM' : 'AM'}`,
  };
}

export function formatAnniversarySchedule(
  dateInput?: string,
  timeInput?: string
): FormattedAnniversarySchedule {
  const { timeLabelKh, timeLabelEn } = formatKhmerTimeLabel(timeInput);
  const rawDate = (dateInput || '').trim();

  if (!rawDate) {
    return {
      dateLabelKh: 'ថ្ងៃសៅរ៍ ទី២៦ ខែធ្នូ ឆ្នាំ២០២៦',
      dateLabelEn: 'Saturday, December 26, 2026',
      timeLabelKh,
      timeLabelEn,
      targetYearEn: '2026',
    };
  }

  const parsed = new Date(rawDate);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(rawDate)) {
    const weekdayKh = KHMER_WEEKDAYS[parsed.getDay()];
    const dayNum = parsed.getDate();
    const dayKh = toKhmerDigits(String(dayNum).padStart(2, '0'));
    const monthKh = KHMER_MONTHS[parsed.getMonth()];
    const yearNum = parsed.getFullYear();
    const yearKh = toKhmerDigits(yearNum);

    return {
      dateLabelKh: `${weekdayKh} ទី${dayKh} ខែ${monthKh} ឆ្នាំ${yearKh}`,
      dateLabelEn: parsed.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      timeLabelKh,
      timeLabelEn,
      targetYearEn: String(yearNum),
    };
  }

  if (containsKhmerScript(rawDate)) {
    return {
      dateLabelKh: rawDate,
      dateLabelEn: rawDate,
      timeLabelKh,
      timeLabelEn,
      targetYearEn: '2026',
    };
  }

  return {
    dateLabelKh: rawDate,
    dateLabelEn: rawDate,
    timeLabelKh,
    timeLabelEn,
    targetYearEn: '2026',
  };
}

export function buildAnniversaryHostsDisplay(
  groom?: string,
  bride?: string,
  singlePerson?: boolean
): string {
  const g = (groom || '').trim();
  const b = (bride || '').trim();

  if (singlePerson) {
    return g || b || 'ហេង ពិសិដ្ឋ';
  }
  if (g && b) return `${g} & ${b}`;
  return g || b || 'ហេង ពិសិដ្ឋ & ផែ រក្សា';
}

export function buildAnniversaryStoryQuote(options: {
  milestoneKh?: string;
  milestoneEn?: string;
  customMessageKh?: string;
  customMessageEn?: string;
  language: Language;
}): string {
  const { milestoneKh, milestoneEn, customMessageKh, customMessageEn, language } = options;
  const years = parseMilestoneYears(milestoneKh, milestoneEn);

  if (language === 'kh') {
    const custom = (customMessageKh || '').trim();
    if (custom && custom.length >= 4) {
      return custom;
    }
    if (years !== null) {
      return `រយៈពេល ${toKhmerDigits(years)} ឆ្នាំកន្លងមកនេះ ក្តីស្រឡាញ់ ភាពស្មោះត្រង់ និងការរួមដំណើរជាមួយគ្នា បានចារឹកជារឿងរ៉ាវស្នេហាដ៏កក់ក្តៅក្នុងជីវិតគ្រួសារយើងខ្ញុំ។`;
    }
    return 'គ្រប់វិនាទីនៃដំណើរជីវិតគូរួមគ្នា គឺជាជំពូកស្នេហាដ៏មានន័យ ពោរពេញដោយការគោរព ក្តីស្រឡាញ់ និងអនុស្សាវរីយ៍មិនអាចបំភ្លេចបាន។';
  }

  const customEn = (customMessageEn || '').trim();
  if (customEn && customEn.length >= 4) {
    return customEn;
  }
  if (years !== null) {
    return `${years} cherished years of devotion, laughter, and shared memories woven together into our family’s enduring love story.`;
  }
  return 'Every year walked hand in hand is another cherished chapter of devotion, gratitude, and enduring love.';
}

export function formatAnniversaryLocation(location?: string, language: Language = 'kh'): string {
  const clean = (location || '').trim();
  if (!clean) {
    return language === 'kh'
      ? 'សណ្ឋាគារ រ៉ូសវូដ ភ្នំពេញ (Rosewood Phnom Penh)'
      : 'Rosewood Phnom Penh, Vattanac Capital Tower';
  }
  return clean;
}

export function buildGoogleMapsSearchUrl(location: string, customMapUrl?: string): string {
  const trimmedUrl = (customMapUrl || '').trim();
  if (
    trimmedUrl &&
    /^https?:\/\//i.test(trimmedUrl) &&
    trimmedUrl !== 'https://maps.google.com' &&
    trimmedUrl !== 'https://maps.google.com/'
  ) {
    return trimmedUrl;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}

export function resolveStoryStartYear(
  customStartYear?: string,
  targetYearEn: string = '2026',
  yearsNumber: number | null = null
): { startYearKh: string; startYearEn: string } | null {
  const normalizedCustom = fromKhmerDigits((customStartYear || '').trim()).replace(/[^\d]/g, '');
  if (normalizedCustom.length === 4) {
    return {
      startYearKh: toKhmerDigits(normalizedCustom),
      startYearEn: normalizedCustom,
    };
  }
  const targetNum = parseInt(targetYearEn, 10) || 2026;
  if (yearsNumber !== null) {
    const computed = targetNum - yearsNumber;
    if (computed > 1900 && computed <= targetNum) {
      return {
        startYearKh: toKhmerDigits(computed),
        startYearEn: String(computed),
      };
    }
  }
  return null;
}

export const KHMER_ANNIVERSARY_STORY_IMAGES = {
  chapter1: '/assets/images/khmer_story_ch1_fate_1794798420808.jpg',
  chapter2: '/assets/images/khmer_story_ch2_sompeah_1794798420881.jpg',
  chapter3: '/assets/images/khmer_story_ch3_hearth_1794798422688.jpg',
  chapter4: '/assets/images/khmer_story_ch4_golden_1794798422094.jpg',
};

export const DEFAULT_KHMER_ANNIVERSARY_PROVERB = {
  kh: '«ស្រឡាញ់គ្នាស្មោះស្ម័គ្រ គោរពគ្នាជាធំ រួមដំណើរលុះគ្រាចាស់កោងខ្នង»',
  en: '“Devoted in heart, respectful in spirit, walking hand in hand until golden years.”',
};

export interface KhmerCulturalSymbolItem {
  id: string;
  symbolKey: 'jasmine' | 'redThread' | 'popil' | 'music';
  titleKh: string;
  titleEn: string;
  meaningKh: string;
  meaningEn: string;
}

export const KHMER_CULTURAL_SYMBOLS: KhmerCulturalSymbolItem[] = [
  {
    id: 'jasmine',
    symbolKey: 'jasmine',
    titleKh: 'កម្រងផ្កាម្លិះសុទ្ធ',
    titleEn: 'Phka Mlis Jasmine Garlands',
    meaningKh: 'និមិត្តរូបនៃចិត្តបរិសុទ្ធ ក្លិនក្រអូបប្រហើរនៃមេត្តា និងក្តីស្រឡាញ់គ្មានថ្ងៃរោយរា។',
    meaningEn: 'Symbolizes purity of devotion and gentle fragrance enduring through every season.',
  },
  {
    id: 'redThread',
    symbolKey: 'redThread',
    titleKh: 'អំបោះក្រហមចងដៃ',
    titleEn: 'Sacred Red Silk Wrist Thread',
    meaningKh: 'ចំណងមេត្រីភាពពីមាតាបិតា និងញាតិសន្តាន ប្រសិទ្ធពរឱ្យគូស្វាមីភរិយានៅជិតគ្នាជានិច្ច។',
    meaningEn: 'Tied by parents and elders to bind two lives in lifelong protection and unity.',
  },
  {
    id: 'popil',
    symbolKey: 'popil',
    titleKh: 'ពិធីបង្វិលពពិល ៧ ជុំ',
    titleEn: 'Sevenfold Popil Candle Circle',
    meaningKh: 'ពន្លឺទៀនពពិលបង្វិលប្រទក្សិណ ៧ ជុំ បញ្ជាក់ពីសុភមង្គល ភាពរុងរឿង និងពន្លឺជីវិតគ្រួសារ។',
    meaningEn: 'Seven clockwise blessings passed among elders inviting radiance and harmony.',
  },
  {
    id: 'music',
    symbolKey: 'music',
    titleKh: 'ភ្លេងការប្រពៃណីខ្មែរ',
    titleEn: 'Classical Phleng Kar Ensemble',
    meaningKh: 'សំនៀងទ្រខ្មែរ និងខ្លុយប្រពៃណី ដឹកនាំព្រលឹងដូនតាឱ្យចូលមកប្រទានពរជ័យសិរីមង្គល។',
    meaningEn: 'Timeless Khmer strings and flutes honoring ancestors on auspicious family milestones.',
  },
];

export function buildDefaultKhmerAnniversaryChapters(params: {
  groom?: string;
  bride?: string;
  groomEn?: string;
  brideEn?: string;
  storyStartYear?: string;
  targetYearEn?: string;
  milestoneYears?: number | null;
} = {}): AnniversaryStoryChapter[] {
  const gKh = (params.groom || '').trim() || 'ហេង ពិសិដ្ឋ';
  const bKh = (params.bride || '').trim() || 'ផែ រក្សា';
  const gEn = (params.groomEn || params.groom || '').trim() || 'Heng Piseth';
  const bEn = (params.brideEn || params.bride || '').trim() || 'Phea Raksa';

  const targetNum = parseInt(fromKhmerDigits(params.targetYearEn || '2026'), 10) || 2026;
  const years =
    typeof params.milestoneYears === 'number' && params.milestoneYears > 0
      ? params.milestoneYears
      : 50;

  const resolvedStart = resolveStoryStartYear(params.storyStartYear, String(targetNum), years);
  const startNum = resolvedStart ? parseInt(resolvedStart.startYearEn, 10) : targetNum - years;
  const meetNum = startNum > 1901 ? startNum - 1 : startNum;
  const midNum = Math.round((startNum + targetNum) / 2);

  const yearsKh = toKhmerDigits(years);
  const meetYearKh = toKhmerDigits(meetNum);
  const startYearKh = toKhmerDigits(startNum);
  const midYearKh = toKhmerDigits(midNum);
  const targetYearKh = toKhmerDigits(targetNum);

  return [
    {
      id: 'ch1',
      chapterNumberKh: 'ជំពូកទី ១',
      chapterNumberEn: 'Chapter I',
      yearLabelKh: `ឆ្នាំ ${meetYearKh}`,
      yearLabelEn: `${meetNum}`,
      titleKh: 'និស្ស័យស្នេហ៍គ្រាដំបូង',
      titleEn: 'First Destined Meeting (Nissay)',
      traditionLabelKh: 'និស្ស័យបុព្វេសន្និវាស · ក្លិនផ្កាម្លិះ',
      traditionLabelEn: 'Sacred Destiny · Jasmine Blossom',
      storyKh: `ក្នុងគ្រារដូវរសៀលដ៏ស្ងប់ស្ងាត់នៃឆ្នាំ ${meetYearKh} និស្ស័យបុព្វេសន្និវាសបាននាំឱ្យ ${gKh} និង ${bKh} បានជួបស្គាល់គ្នាដោយក្តីគោរព និងភាពទន់ភ្លន់។ ក្រោមការយល់ព្រម និងពរជ័យពីមាតាបិតាទាំងសងខាង ចំណងមេត្រីភាពដ៏បរិសុទ្ធក៏ចាប់ផ្តើមរីកដុះដាលដូចកម្រងផ្កាម្លិះខ្មែរ។`,
      storyEn: `Under warm Cambodian golden twilight in ${meetNum}, destiny (Nissay) gently brought ${gEn} and ${bEn} together. Blessed by the wisdom and approval of both families, a quiet promise blossomed like fresh Phka Mlis jasmine.`,
      proverbKh: 'បុព្វេសន្និវាសនាំឱ្យជួបជុំ កសាងទំនុកចិត្ត និងក្តីមេត្តាចំពោះគ្នា។',
      proverbEn: 'Past merit guides two gentle hearts onto a shared path of respect.',
      image: KHMER_ANNIVERSARY_STORY_IMAGES.chapter1,
    },
    {
      id: 'ch2',
      chapterNumberKh: 'ជំពូកទី ២',
      chapterNumberEn: 'Chapter II',
      yearLabelKh: `ឆ្នាំ ${startYearKh}`,
      yearLabelEn: `${startNum}`,
      titleKh: 'ពិធីមង្គលសំពះផ្ទឹម និងបង្វិលពពិល',
      titleEn: 'Sompeah Ptem & Sacred Popil Blessing',
      traditionLabelKh: 'ហែជំនូន · សំពះផ្ទឹម · ចងអំបោះក្រហម',
      traditionLabelEn: 'Dowry Parade · Popil 7 Circles · Red Silk Thread',
      storyKh: `នាព្រឹកព្រលឹមដ៏មង្គលសួស្តីក្នុងឆ្នាំ ${startYearKh} អមដោយសំនៀងភ្លេងការប្រពៃណីខ្មែរ គូស្វាមីភរិយាបានប្រារព្ធពិធីហែជំនូនផ្កាស្លា សំពះផ្ទឹម និងទទួលពន្លឺទៀនបង្វិលពពិលប្រាំពីរជុំពីចាស់ទុំព្រឹទ្ធាចារ្យ ព្រមទាំងចងអំបោះក្រហមប្រសិទ្ធពរជ័យឱ្យរួមរស់ជាគូជីវិតអស់កល្បជានិច្ច។`,
      storyEn: `To the timeless strings of Phleng Kar in ${startNum}, elders swirled sacred Popil candleholders seven clockwise turns around ${gEn} and ${bEn}, tying crimson silk wrist threads during Sompeah Ptem to bless their lifelong union.`,
      proverbKh: 'ពន្លឺពពិល ៧ ជុំ និងអំបោះក្រហម ចងភ្ជាប់ព្រលឹងទាំងពីរជាធ្លុងមួយ។',
      proverbEn: 'Seven turns of sacred candlelight and red silk seal an unbreakable covenant.',
      image: KHMER_ANNIVERSARY_STORY_IMAGES.chapter2,
    },
    {
      id: 'ch3',
      chapterNumberKh: 'ជំពូកទី ៣',
      chapterNumberEn: 'Chapter III',
      yearLabelKh: `ឆ្នាំ ${startYearKh} – ${midYearKh}`,
      yearLabelEn: `${startNum} – ${midNum}`,
      titleKh: 'សាងគ្រួសារ និងជីវិតរួមដំណើរ',
      titleEn: 'Hearth, Heritage & Years Side by Side',
      traditionLabelKh: 'ផ្ទះឈើដ៏កក់ក្តៅ · ទំនៀមទម្លាប់ដូនតា',
      traditionLabelEn: 'Khmer Family Hearth · Ancestral Seasons',
      storyKh: `ឆ្លងកាត់ភ្លៀងធ្លាក់ និងរដូវប្រាំងជាច្រើនទសវត្សរ៍ អ្នកទាំងពីរបានចាប់ដៃគ្នាកសាងគេហដ្ឋានដ៏កក់ក្តៅ អប់រំបុត្រធីតានិងចៅៗឱ្យចេះគោរពដូនតា រក្សាប្រពៃណីចូលឆ្នាំខ្មែរ និងភ្ជុំបិណ្ឌជារៀងរាល់ឆ្នាំដោយក្តីសុខដុមរមនា។`,
      storyEn: `Across changing monsoons and harvest seasons, they nurtured a warm Cambodian household grounded in gratitude, passing ancestral values, Khmer New Year blessings, and gentle kindness to children and grandchildren.`,
      proverbKh: 'ផ្ទះមានសិរីសួស្តី កើតចេញពីពាក្យផ្អែមល្ហែម និងការអត់ឱនរវាងស្វាមីភរិយា។',
      proverbEn: 'A blessed home flourishes through patience, gratitude, and quiet care.',
      image: KHMER_ANNIVERSARY_STORY_IMAGES.chapter3,
    },
    {
      id: 'ch4',
      chapterNumberKh: 'ជំពូកទី ៤',
      chapterNumberEn: 'Chapter IV',
      yearLabelKh: `ឆ្នាំ ${targetYearKh}`,
      yearLabelEn: `${targetNum}`,
      titleKh: `សូត្រមន្តចម្រើនព្រះបរិត្ត និងគម្រប់ខួប ${yearsKh} ឆ្នាំ`,
      titleEn: `Sacred Monk Blessing & ${years} Years Milestone`,
      traditionLabelKh: 'ចម្រើនព្រះបរិត្ត · ជួបជុំកូនចៅ និងមិត្តភក្តិ',
      traditionLabelEn: 'Monk Chanting · Golden Celebration',
      storyKh: `មកដល់ឆ្នាំ ${targetYearKh} នេះ ដំណើរជីវិតគូគម្រប់ ${yearsKh} ឆ្នាំរបស់ ${gKh} និង ${bKh} បានប្រែជាគំរូនៃក្តីស្រឡាញ់ដ៏រឹងមាំសម្រាប់កូនចៅគ្រប់ជំនាន់។ ពិធីសូត្រមន្តចម្រើនព្រះបរិត្ត និងការជួបជុំញាតិមិត្តនារាត្រីនេះ គឺជាការថ្លែងអំណរគុណដល់គ្រប់ដួងចិត្តដែលបានរួមដំណើរជាមួយគ្នា។`,
      storyEn: `Today in ${targetNum}, celebrating ${years} radiant years together, ${gEn} and ${bEn} gather beloved family and lifelong friends for sacred monk blessings, jasmine offerings, and an unforgettable evening of gratitude.`,
      proverbKh: 'គម្រប់ខួបសិរីមង្គល សូមអាយុវែង វណ្ណៈ សុខៈ ពលៈ កើតមានជាអចិន្ត្រៃយ៍។',
      proverbEn: 'May longevity, grace, peace, and health shine upon this enduring love.',
      image: KHMER_ANNIVERSARY_STORY_IMAGES.chapter4,
    },
  ];
}

export function resolveAnniversaryStoryChapters(
  customChapters?: AnniversaryStoryChapter[],
  params: {
    groom?: string;
    bride?: string;
    groomEn?: string;
    brideEn?: string;
    storyStartYear?: string;
    targetYearEn?: string;
    milestoneYears?: number | null;
  } = {}
): AnniversaryStoryChapter[] {
  const defaults = buildDefaultKhmerAnniversaryChapters(params);
  if (!Array.isArray(customChapters) || customChapters.length === 0) {
    return defaults;
  }

  return defaults.map((fallback, index) => {
    const custom = customChapters[index];
    if (!custom) return fallback;
    return {
      ...fallback,
      ...custom,
      id: custom.id || fallback.id,
      chapterNumberKh: custom.chapterNumberKh?.trim() || fallback.chapterNumberKh,
      chapterNumberEn: custom.chapterNumberEn?.trim() || fallback.chapterNumberEn,
      yearLabelKh: custom.yearLabelKh?.trim() || fallback.yearLabelKh,
      yearLabelEn: custom.yearLabelEn?.trim() || fallback.yearLabelEn,
      titleKh: custom.titleKh?.trim() || fallback.titleKh,
      titleEn: custom.titleEn?.trim() || fallback.titleEn,
      traditionLabelKh: custom.traditionLabelKh?.trim() || fallback.traditionLabelKh,
      traditionLabelEn: custom.traditionLabelEn?.trim() || fallback.traditionLabelEn,
      storyKh: custom.storyKh?.trim() || fallback.storyKh,
      storyEn: custom.storyEn?.trim() || fallback.storyEn,
      proverbKh: custom.proverbKh !== undefined ? custom.proverbKh : fallback.proverbKh,
      proverbEn: custom.proverbEn !== undefined ? custom.proverbEn : fallback.proverbEn,
      image:
        custom.image && !custom.image.includes('unsplash.com')
          ? custom.image
          : fallback.image,
    };
  });
}

export interface AnniversaryCoverDraft {
  coverTitleKh: string;
  coverTitleEn: string;
  milestoneKh: string;
  milestoneEn: string;
  storyStartYear: string;
  groomKh: string;
  brideKh: string;
  groomEn: string;
  brideEn: string;
  singlePerson: boolean;
  storyMessageKh: string;
  storyMessageEn: string;
  proverbKh: string;
  proverbEn: string;
  storyChapters: AnniversaryStoryChapter[];
  eventDate: string;
  eventTime: string;
  locationKh: string;
  locationEn: string;
  mapUrl: string;
  ribbonLabelKh: string;
  ribbonLabelEn: string;
  medallionImage: string;
}

export function extractIsoDatePart(dateOrStartTime?: string): string {
  const raw = (dateOrStartTime || '').trim();
  const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '2026-12-26';
}

export function buildAnniversaryCoverDraft(event: {
  groom?: string;
  bride?: string;
  groomEn?: string;
  brideEn?: string;
  singlePerson?: boolean;
  anniversary_milestone?: string;
  anniversary_milestone_en?: string;
  date?: string;
  startTime?: string;
  eating_time?: string;
  location?: string;
  locationEn?: string;
  config?: {
    cover_subtitle_kh?: string;
    cover_subtitle_en?: string;
    anniversary_milestone?: string;
    anniversary_milestone_en?: string;
    story_start_year?: string;
    anniversary_proverb_kh?: string;
    anniversary_proverb_en?: string;
    anniversary_story_chapters?: AnniversaryStoryChapter[];
    guest_label_text?: string;
    guest_label_text_en?: string;
    envelope_header_image?: string;
    map_url?: string;
    invitation_kh?: {
      main_title?: string;
      subtitle?: string;
      invitation_message?: string;
    };
    invitation_en?: {
      main_title?: string;
      subtitle?: string;
      invitation_message?: string;
    };
  };
}): AnniversaryCoverDraft {
  const cfg = event.config || {};
  const mKh = cfg.anniversary_milestone || event.anniversary_milestone || '៥០';
  const mEn = cfg.anniversary_milestone_en || event.anniversary_milestone_en || '50th';
  const isoDate = extractIsoDatePart(event.date || event.startTime);
  const milestoneYears = parseMilestoneYears(mKh, mEn);
  const resolvedStart = resolveStoryStartYear(
    cfg.story_start_year,
    isoDate.slice(0, 4),
    milestoneYears
  );

  const rawTitleKh = cfg.cover_subtitle_kh || cfg.invitation_kh?.main_title || '';
  const coverTitleKh =
    !rawTitleKh || rawTitleKh === 'សូមអញ្ជើញចូលរួមអបអរសាទរ'
      ? 'ពិធីខួបអាពាហ៍ពិពាហ៍'
      : rawTitleKh;

  const rawTitleEn = cfg.cover_subtitle_en || cfg.invitation_en?.main_title || '';
  const coverTitleEn =
    !rawTitleEn || rawTitleEn === 'PLEASE JOIN US TO CELEBRATE THE'
      ? 'Wedding Anniversary Story'
      : rawTitleEn;

  const rawRibbonEn = cfg.guest_label_text_en || cfg.invitation_en?.subtitle || '';
  const ribbonLabelEn =
    !rawRibbonEn || rawRibbonEn.length > 60
      ? 'Cordially Invited to Celebrate With Us'
      : rawRibbonEn;

  const resolvedChapters = resolveAnniversaryStoryChapters(cfg.anniversary_story_chapters, {
    groom: event.groom,
    bride: event.bride,
    groomEn: event.groomEn,
    brideEn: event.brideEn,
    storyStartYear: resolvedStart?.startYearEn || cfg.story_start_year,
    targetYearEn: isoDate.slice(0, 4),
    milestoneYears,
  });

  return {
    coverTitleKh,
    coverTitleEn,
    milestoneKh: mKh,
    milestoneEn: mEn,
    storyStartYear: resolvedStart?.startYearEn || '',
    groomKh: event.groom || '',
    brideKh: event.bride || '',
    groomEn: event.groomEn || '',
    brideEn: event.brideEn || '',
    singlePerson: Boolean(event.singlePerson),
    storyMessageKh: cfg.invitation_kh?.invitation_message || '',
    storyMessageEn: cfg.invitation_en?.invitation_message || '',
    proverbKh: cfg.anniversary_proverb_kh || DEFAULT_KHMER_ANNIVERSARY_PROVERB.kh,
    proverbEn: cfg.anniversary_proverb_en || DEFAULT_KHMER_ANNIVERSARY_PROVERB.en,
    storyChapters: resolvedChapters,
    eventDate: isoDate,
    eventTime: event.eating_time || '06:00 PM',
    locationKh: event.location || '',
    locationEn: event.locationEn || '',
    mapUrl: cfg.map_url || 'https://maps.google.com',
    ribbonLabelKh:
      cfg.guest_label_text || cfg.invitation_kh?.subtitle || 'សូមគោរពអញ្ជើញចូលរួមអបអរសាទរ',
    ribbonLabelEn,
    medallionImage: cfg.envelope_header_image && cfg.envelope_header_image !== 'none'
      ? cfg.envelope_header_image
      : '',
  };
}

export interface AnniversaryEditableEvent {
  name: string;
  slug?: string;
  groom: string;
  bride: string;
  groomEn?: string;
  brideEn?: string;
  singlePerson?: boolean;
  anniversary_milestone?: string;
  anniversary_milestone_en?: string;
  date?: string;
  startTime: string;
  eating_time: string;
  location: string;
  locationEn?: string;
  updatedAt?: string;
  config: {
    map_url: string;
    cover_subtitle_kh?: string;
    cover_subtitle_en?: string;
    anniversary_milestone?: string;
    anniversary_milestone_en?: string;
    story_start_year?: string;
    anniversary_proverb_kh?: string;
    anniversary_proverb_en?: string;
    anniversary_story_chapters?: AnniversaryStoryChapter[];
    groom_name_kh?: string;
    groom_name_en?: string;
    bride_name_kh?: string;
    bride_name_en?: string;
    guest_label_text?: string;
    guest_label_text_en?: string;
    envelope_header_image?: string;
    invitation_kh: {
      location: string;
      subtitle: string;
      date_time: string;
      main_title: string;
      invitation_message: string;
      groom?: string;
      bride?: string;
    };
    invitation_en: {
      location: string;
      subtitle: string;
      date_time: string;
      main_title: string;
      invitation_message: string;
      groom?: string;
      bride?: string;
    };
  };
}

export function applyAnniversaryCoverDraft<T extends AnniversaryEditableEvent>(
  currentEvent: T,
  draft: AnniversaryCoverDraft
): T {
  const schedule = formatAnniversarySchedule(draft.eventDate, draft.eventTime);
  const hostsKh = buildAnniversaryHostsDisplay(draft.groomKh, draft.brideKh, draft.singlePerson);
  const cleanTitleKh = draft.coverTitleKh.trim() || 'ពិធីខួបអាពាហ៍ពិពាហ៍';
  const cleanTitleEn = draft.coverTitleEn.trim() || 'Wedding Anniversary Story';
  const cleanDate = extractIsoDatePart(draft.eventDate);
  const nextStartTime = `${cleanDate}T18:00:00+07:00`;

  return {
    ...currentEvent,
    name: `${cleanTitleKh} ${hostsKh}`.trim(),
    groom: draft.groomKh.trim(),
    bride: draft.brideKh.trim(),
    groomEn: draft.groomEn.trim(),
    brideEn: draft.brideEn.trim(),
    singlePerson: draft.singlePerson,
    anniversary_milestone: draft.milestoneKh.trim(),
    anniversary_milestone_en: draft.milestoneEn.trim(),
    date: cleanDate,
    startTime: nextStartTime,
    eating_time: draft.eventTime.trim() || '06:00 PM',
    location: draft.locationKh.trim(),
    locationEn: draft.locationEn.trim(),
    updatedAt: new Date().toISOString(),
    config: {
      ...currentEvent.config,
      map_url: draft.mapUrl.trim() || 'https://maps.google.com',
      cover_subtitle_kh: cleanTitleKh,
      cover_subtitle_en: cleanTitleEn,
      anniversary_milestone: draft.milestoneKh.trim(),
      anniversary_milestone_en: draft.milestoneEn.trim(),
      story_start_year: fromKhmerDigits(draft.storyStartYear.trim()),
      anniversary_proverb_kh: draft.proverbKh.trim() || DEFAULT_KHMER_ANNIVERSARY_PROVERB.kh,
      anniversary_proverb_en: draft.proverbEn.trim() || DEFAULT_KHMER_ANNIVERSARY_PROVERB.en,
      anniversary_story_chapters: draft.storyChapters,
      groom_name_kh: draft.groomKh.trim(),
      groom_name_en: draft.groomEn.trim(),
      bride_name_kh: draft.brideKh.trim(),
      bride_name_en: draft.brideEn.trim(),
      guest_label_text: draft.ribbonLabelKh.trim(),
      guest_label_text_en: draft.ribbonLabelEn.trim(),
      envelope_header_image: draft.medallionImage.trim() || 'none',
      invitation_kh: {
        ...currentEvent.config.invitation_kh,
        main_title: cleanTitleKh,
        subtitle: draft.ribbonLabelKh.trim() || currentEvent.config.invitation_kh.subtitle,
        invitation_message: draft.storyMessageKh.trim(),
        date_time: schedule.dateLabelKh,
        location: draft.locationKh.trim() || currentEvent.config.invitation_kh.location,
        groom: draft.groomKh.trim(),
        bride: draft.brideKh.trim(),
      },
      invitation_en: {
        ...currentEvent.config.invitation_en,
        main_title: cleanTitleEn,
        subtitle: draft.ribbonLabelEn.trim() || currentEvent.config.invitation_en.subtitle,
        invitation_message: draft.storyMessageEn.trim(),
        date_time: schedule.dateLabelEn,
        location: draft.locationEn.trim() || currentEvent.config.invitation_en.location,
        groom: draft.groomEn.trim(),
        bride: draft.brideEn.trim(),
      },
    },
  };
}
