import { useState } from 'react';
import { Sparkles, RefreshCw, Check, Save, Languages } from 'lucide-react';
import { Language, TemplateConfig } from '../types';
import { ThemeMode } from './ThemeToggle';
import {
  getFirstNameInitial,
  MONOGRAM_COLOR_PRESETS,
  MONOGRAM_FONT_PRESETS_EN,
  MONOGRAM_FONT_PRESETS_KH,
  MonogramFontPreset,
  resolveMonogramFontFamily,
} from '../utils/monogramHelpers';

interface CoverMonogramSettingsCardProps {
  config: TemplateConfig;
  onUpdateConfig: <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) => void;
  groom?: string;
  bride?: string;
  groomEn?: string;
  brideEn?: string;
  singlePerson?: boolean;
  language?: Language;
  theme?: ThemeMode;
  onSave?: () => Promise<void> | void;
  isSaving?: boolean;
  justSaved?: boolean;
  compact?: boolean;
}

export default function CoverMonogramSettingsCard({
  config,
  onUpdateConfig,
  groom = '',
  bride = '',
  groomEn = '',
  brideEn = '',
  singlePerson = false,
  language = 'kh',
  theme = 'dark',
  onSave,
  isSaving = false,
  justSaved = false,
  compact = false,
}: CoverMonogramSettingsCardProps) {
  const monogramLang: Language = config.cover_monogram_lang || language || 'kh';
  const isKhmer = monogramLang === 'kh';
  const autoGroomEn = getFirstNameInitial(groomEn, groom, 'M');
  const autoBrideEn = getFirstNameInitial(brideEn, bride, 'V');
  const autoGroomKh = getFirstNameInitial(groom, groomEn, 'ម');
  const autoBrideKh = getFirstNameInitial(bride, brideEn, 'វ');

  const effectiveGroomInit = isKhmer ? autoGroomKh : autoGroomEn;
  const effectiveBrideInit = isKhmer ? autoBrideKh : autoBrideEn;
  const monogramColor = config.cover_monogram_color || '#9c732d';
  const monogramSize = parseInt(config.cover_monogram_font_size || '34', 10) || 34;
  const isLatinPreview =
    /^[A-Za-z0-9.\s]+$/.test(effectiveGroomInit) &&
    (singlePerson || /^[A-Za-z0-9.\s]+$/.test(effectiveBrideInit));
  const effectiveFontFamily = resolveMonogramFontFamily(
    monogramLang,
    config.cover_monogram_font_family,
    config.cover_monogram_font_family_en,
    isLatinPreview
  );

  const [styleCategoryFilter, setStyleCategoryFilter] = useState<'all' | 'traditional' | 'modern'>('all');

  const selectedKhFont =
    config.cover_monogram_font_family &&
    MONOGRAM_FONT_PRESETS_KH.some((p) => p.fontFamily === config.cover_monogram_font_family)
      ? config.cover_monogram_font_family
      : '';
  const selectedEnFont =
    config.cover_monogram_font_family_en ??
    (config.cover_monogram_font_family &&
    MONOGRAM_FONT_PRESETS_EN.some((p) => p.fontFamily === config.cover_monogram_font_family)
      ? config.cover_monogram_font_family
      : '');

  const khSampleText = singlePerson ? autoGroomKh : `${autoGroomKh} & ${autoBrideKh}`;
  const enSampleText = singlePerson ? autoGroomEn : `${autoGroomEn} & ${autoBrideEn}`;

  const handleSelectKhStyle = (font: MonogramFontPreset) => {
    onUpdateConfig('cover_monogram_lang', 'kh');
    onUpdateConfig('cover_monogram_font_family', font.fontFamily);
  };

  const handleSelectEnStyle = (font: MonogramFontPreset) => {
    onUpdateConfig('cover_monogram_lang', 'en');
    onUpdateConfig('cover_monogram_font_family_en', font.fontFamily);
  };

  const renderPresetButton = (font: MonogramFontPreset, langType: 'kh' | 'en') => {
    const isKhStyle = langType === 'kh';
    const isSelectedFont = isKhStyle
      ? selectedKhFont === font.fontFamily
      : selectedEnFont === font.fontFamily;
    const isActiveLangAndFont = (isKhStyle ? isKhmer : !isKhmer) && isSelectedFont;

    return (
      <button
        key={`mono-font-${langType}-${font.styleGroup}-${font.id}`}
        type="button"
        onClick={() => (isKhStyle ? handleSelectKhStyle(font) : handleSelectEnStyle(font))}
        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 active:scale-95 cursor-pointer relative ${
          isActiveLangAndFont
            ? 'border-amber-400 ring-2 ring-amber-400/50 font-bold bg-amber-400/20 ' +
              (theme === 'light' ? 'text-amber-950 shadow-sm' : 'text-amber-200 shadow-sm')
            : isSelectedFont
            ? 'border-amber-400/60 bg-amber-400/10 ' +
              (theme === 'light' ? 'text-amber-950' : 'text-amber-200')
            : theme === 'light'
            ? 'bg-white border-amber-200 text-neutral-800 hover:border-amber-400 hover:bg-amber-50/50'
            : 'bg-black/40 border-white/10 text-amber-100 hover:border-amber-400/40'
        }`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <span className="text-[10px] font-khmer opacity-80 truncate">{font.nameKh}</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
              isKhStyle
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                : 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
            }`}
          >
            {isKhStyle ? 'KH' : 'EN'}
          </span>
        </div>

        <span
          className="text-base sm:text-lg truncate leading-tight py-0.5"
          style={{
            fontFamily:
              font.fontFamily ||
              (isKhStyle
                ? "'Moulpali', 'Moul', 'Noto Serif Khmer', serif"
                : "'Playfair Display', 'Cinzel', Georgia, serif"),
            color: monogramColor,
          }}
        >
          {isKhStyle ? khSampleText : enSampleText}
        </span>

        <div className="flex items-center justify-between gap-1 w-full pt-0.5 border-t border-amber-500/10">
          <span className="text-[9px] font-khmer opacity-65 truncate">
            {font.styleGroup === 'traditional'
              ? 'មង្គលការប្រពៃណី • Traditional'
              : 'មង្គលការបែបសម័យ • Modern'}
          </span>
          {isActiveLangAndFont && (
            <Check className="w-3 h-3 text-amber-500 shrink-0 stroke-[3]" />
          )}
        </div>
      </button>
    );
  };

  const traditionalKhPresets = MONOGRAM_FONT_PRESETS_KH.filter((p) => p.styleGroup === 'traditional');
  const modernKhPresets = MONOGRAM_FONT_PRESETS_KH.filter((p) => p.styleGroup === 'modern');
  const traditionalEnPresets = MONOGRAM_FONT_PRESETS_EN.filter((p) => p.styleGroup === 'traditional');
  const modernEnPresets = MONOGRAM_FONT_PRESETS_EN.filter((p) => p.styleGroup === 'modern');

  return (
    <div
      id="cover-monogram-short-text-settings"
      className={`p-4 rounded-2xl border space-y-3.5 ${
        theme === 'light'
          ? 'bg-amber-50/60 border-amber-200/90 shadow-sm'
          : 'bg-gradient-to-br from-amber-950/30 via-black/60 to-black/80 border-amber-500/30'
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-2 pb-2 border-b ${
          theme === 'light' ? 'border-amber-200' : 'border-amber-500/20'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg ${
              theme === 'light' ? 'bg-amber-200 text-amber-950' : 'bg-amber-400/20 text-amber-300'
            } flex items-center justify-center shrink-0`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h4
              className={`text-xs sm:text-sm font-bold font-moul ${
                theme === 'light' ? 'text-amber-950' : 'text-amber-200'
              }`}
            >
              អក្សរកាត់លើស៊ុមមាស Cover (Cover Short Text / Monogram)
            </h4>
            <p
              className={`text-[11px] ${
                theme === 'light' ? 'text-neutral-600' : 'text-amber-300/70'
              } font-khmer`}
            >
              បង្ហាញអក្សរដំបូង ឬអក្សរកាត់ឈ្មោះកូនប្រុស-ស្រី ក្នុងស៊ុមមាសលើទំព័រមុខ (Cover)
            </p>
          </div>
        </div>

        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className={`px-2.5 py-1 rounded-lg text-xs font-khmer font-bold flex items-center gap-1.5 border transition-all active:scale-95 shadow-xs cursor-pointer ${
              justSaved
                ? 'bg-emerald-500 text-white border-emerald-400'
                : theme === 'light'
                ? 'bg-amber-200/80 hover:bg-amber-300 text-amber-950 border-amber-400'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
            }`}
            title="រក្សាទុកអក្សរកាត់ និងម៉ូតអក្សរទៅក្នុង Database"
          >
            {isSaving ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : justSaved ? (
              <Check className="w-3 h-3" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            <span>{justSaved ? 'បានរក្សាទុក' : 'រក្សាទុក (Save)'}</span>
          </button>
        )}
      </div>

      {/* Live Preview + Automatic Wedding Template Couple Initials Display */}
      <div className="grid grid-cols-1 md:grid-cols-[136px_1fr] gap-4 items-center">
        <div className="mx-auto relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-[#fcfaf5] border border-amber-300/70 shadow-inner flex items-center justify-center p-2">
          <img
            src="/assets/template15/monogram-frame.webp"
            alt="Cover monogram preview"
            draggable={false}
            className="w-full h-full object-contain select-none pointer-events-none"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none px-4">
            <div className="flex items-baseline justify-center gap-1 leading-none max-w-full truncate">
              <span
                className="font-bold leading-none"
                style={{
                  fontFamily: effectiveFontFamily,
                  fontSize: `${Math.round(monogramSize * 0.74)}px`,
                  color: monogramColor,
                  textShadow: '0 1px 1px rgba(255,255,255,0.9), 0 2px 5px rgba(140,104,38,0.2)',
                }}
              >
                {effectiveGroomInit}
              </span>
              {!singlePerson && (
                <>
                  <span
                    className="font-semibold leading-none opacity-85"
                    style={{
                      fontFamily: effectiveFontFamily,
                      fontSize: `${Math.max(12, Math.round(monogramSize * 0.42))}px`,
                      color: monogramColor,
                    }}
                  >
                    &amp;
                  </span>
                  <span
                    className="font-bold leading-none"
                    style={{
                      fontFamily: effectiveFontFamily,
                      fontSize: `${Math.round(monogramSize * 0.74)}px`,
                      color: monogramColor,
                      textShadow: '0 1px 1px rgba(255,255,255,0.9), 0 2px 5px rgba(140,104,38,0.2)',
                    }}
                  >
                    {effectiveBrideInit}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`text-[11px] font-khmer font-semibold ${
                theme === 'light' ? 'text-amber-950/80' : 'text-amber-200/80'
              }`}
            >
              {singlePerson
                ? isKhmer
                  ? 'ឈ្មោះម្ចាស់កម្មវិធី (ភាសាខ្មែរ):'
                  : 'Host Name (English):'
                : isKhmer
                ? 'ឈ្មោះកូនប្រុស-ស្រី (ភាសាខ្មែរ):'
                : 'Groom & Bride Names (English):'}
            </span>
            <button
              type="button"
              onClick={() => onUpdateConfig('cover_monogram_lang', isKhmer ? 'en' : 'kh')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-khmer font-bold inline-flex items-center gap-1.5 border transition-all active:scale-95 cursor-pointer ${
                theme === 'light'
                  ? 'bg-white hover:bg-amber-100 text-amber-950 border-amber-300 shadow-2xs'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/40'
              }`}
              title={
                isKhmer
                  ? 'ប្តូរឈ្មោះកូនប្រុស និងកូនស្រី ពីភាសាខ្មែរ ទៅជាភាសាអង់គ្លេស (Change Groom & Bride names to English)'
                  : 'ប្តូរឈ្មោះកូនប្រុស និងកូនស្រី ពីភាសាអង់គ្លេស ទៅជាភាសាខ្មែរ (Change Groom & Bride names to Khmer)'
              }
            >
              <Languages className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span
                className={
                  isKhmer
                    ? 'text-amber-500 font-extrabold underline decoration-amber-500/60 underline-offset-2'
                    : 'opacity-70'
                }
              >
                ខ្មែរ (KH)
              </span>
              <span className="opacity-40">⇄</span>
              <span
                className={
                  !isKhmer
                    ? 'text-amber-500 font-extrabold underline decoration-amber-500/60 underline-offset-2'
                    : 'opacity-70'
                }
              >
                English (EN)
              </span>
            </button>
          </div>

          <div className={`grid grid-cols-1 ${singlePerson ? '' : 'sm:grid-cols-2'} gap-3`}>
            <div
              className={`px-3 py-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                theme === 'light'
                  ? 'bg-white border-amber-300 text-neutral-900 shadow-xs'
                  : 'bg-black/60 border-amber-500/40 text-amber-100'
              }`}
            >
              <div className="min-w-0">
                <span className="block text-[10px] font-khmer opacity-75">
                  {singlePerson
                    ? isKhmer
                      ? 'ម្ចាស់កម្មវិធី (ពីគំរូធៀប):'
                      : 'Host (from template):'
                    : isKhmer
                    ? 'កូនប្រុស (ពីគំរូធៀបអាពាហ៍ពិពាហ៍):'
                    : 'Groom (from wedding template):'}
                </span>
                <span className="block text-xs font-khmer font-bold truncate">
                  {isKhmer ? groom || 'រ៉ូ ម៉ាឡេ' : groomEn || groom || 'Ro Malay'}
                </span>
              </div>
              <span
                className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/50 text-base font-bold shrink-0"
                style={{ fontFamily: effectiveFontFamily, color: monogramColor }}
              >
                {effectiveGroomInit}
              </span>
            </div>

            {!singlePerson && (
              <div
                className={`px-3 py-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                  theme === 'light'
                    ? 'bg-white border-amber-300 text-neutral-900 shadow-xs'
                    : 'bg-black/60 border-amber-500/40 text-amber-100'
                }`}
              >
                <div className="min-w-0">
                  <span className="block text-[10px] font-khmer opacity-75">
                    {isKhmer
                      ? 'កូនស្រី (ពីគំរូធៀបអាពាហ៍ពិពាហ៍):'
                      : 'Bride (from wedding template):'}
                  </span>
                  <span className="block text-xs font-khmer font-bold truncate">
                    {isKhmer ? bride || 'អួម វល្ខ័ក' : brideEn || bride || 'Uom Volak'}
                  </span>
                </div>
                <span
                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/50 text-base font-bold shrink-0"
                  style={{ fontFamily: effectiveFontFamily, color: monogramColor }}
                >
                  {effectiveBrideInit}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Color & Font Size */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-amber-500/20">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              className={`text-[11px] font-semibold font-khmer ${
                theme === 'light' ? 'text-amber-950' : 'text-amber-200'
              }`}
            >
              ពណ៌អក្សរកាត់ (Monogram Color):
            </label>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full border-2 border-white/80 shadow shrink-0"
                style={{ backgroundColor: monogramColor }}
              />
              <input
                type="color"
                value={monogramColor}
                onChange={(e) => onUpdateConfig('cover_monogram_color', e.target.value)}
                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0 p-0"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MONOGRAM_COLOR_PRESETS.slice(0, compact ? 4 : MONOGRAM_COLOR_PRESETS.length).map((preset) => {
              const isSelected = monogramColor.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={`mono-col-${preset.hex}`}
                  type="button"
                  onClick={() => onUpdateConfig('cover_monogram_color', preset.hex)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-khmer border flex items-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-amber-400 ring-1 ring-amber-400 bg-amber-400/20 font-bold ' +
                        (theme === 'light' ? 'text-amber-950' : 'text-amber-200')
                      : theme === 'light'
                      ? 'bg-white border-amber-200 text-neutral-700 hover:border-amber-400'
                      : 'bg-black/40 border-white/10 text-neutral-300 hover:border-amber-400/40'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span>{preset.nameKh.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              className={`text-[11px] font-semibold font-khmer ${
                theme === 'light' ? 'text-amber-950' : 'text-amber-200'
              }`}
            >
              ទំហំអក្សរកាត់ (Monogram Size):
            </label>
            <span
              className={`text-[11px] font-mono font-bold ${
                theme === 'light' ? 'text-amber-950' : 'text-amber-300'
              }`}
            >
              {monogramSize}px
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] opacity-70">20px</span>
            <input
              type="range"
              min="20"
              max="48"
              value={monogramSize}
              onChange={(e) => onUpdateConfig('cover_monogram_font_size', e.target.value)}
              className="flex-1 accent-amber-500 h-1.5 bg-neutral-200 dark:bg-neutral-850 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] opacity-70">48px</span>
          </div>
          <div className="flex items-center gap-1.5 pt-0.5">
            {['26', '32', '36', '42'].map((sz) => (
              <button
                key={`mono-sz-${sz}`}
                type="button"
                onClick={() => onUpdateConfig('cover_monogram_font_size', sz)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono border cursor-pointer transition-all ${
                  String(monogramSize) === sz
                    ? 'border-amber-400 bg-amber-400/20 font-bold text-amber-500'
                    : theme === 'light'
                    ? 'bg-white border-amber-200 text-neutral-700'
                    : 'bg-black/40 border-white/10 text-neutral-300'
                }`}
              >
                {sz}px
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Font Family Selection: All KH & EN Styles for Khmer Traditional Wedding & Modern Wedding Reception */}
      <div className="space-y-3 pt-2.5 border-t border-amber-500/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <label
              className={`block text-[11px] sm:text-xs font-bold font-khmer ${
                theme === 'light' ? 'text-amber-950' : 'text-amber-200'
              }`}
            >
              ម៉ូតអក្សរកាត់ទាំងអស់ KH &amp; EN (Khmer Traditional Wedding &amp; Modern Wedding Reception):
            </label>
            <p className="text-[10px] font-khmer opacity-75">
              ចុចជ្រើសរើសម៉ូតអក្សរខ្មែរ (KH) ឬ អង់គ្លេស (EN) សម្រាប់មង្គលការបែបប្រពៃណី និងអាពាហ៍ពិពាហ៍បែបសម័យ
            </p>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {[
              { id: 'all' as const, labelKh: 'ទាំងអស់ (All KH & EN)' },
              { id: 'traditional' as const, labelKh: 'មង្គលការប្រពៃណី (Traditional)' },
              { id: 'modern' as const, labelKh: 'មង្គលការបែបសម័យ (Modern)' },
            ].map((tab) => {
              const active = styleCategoryFilter === tab.id;
              return (
                <button
                  key={`mono-style-tab-${tab.id}`}
                  type="button"
                  onClick={() => setStyleCategoryFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-khmer font-bold border transition-all cursor-pointer ${
                    active
                      ? 'bg-amber-400 text-amber-950 border-amber-300 shadow-xs'
                      : theme === 'light'
                      ? 'bg-white text-amber-950 border-amber-200 hover:bg-amber-100/70'
                      : 'bg-black/40 text-amber-200 border-amber-500/30 hover:bg-amber-500/15'
                  }`}
                >
                  {tab.labelKh}
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Khmer Traditional Wedding (មង្គលការបែបប្រពៃណី) - KH & EN Styles */}
        {(styleCategoryFilter === 'all' || styleCategoryFilter === 'traditional') && (
          <div
            className={`p-3 rounded-xl border space-y-2.5 ${
              theme === 'light'
                ? 'bg-amber-100/40 border-amber-300/80'
                : 'bg-amber-950/20 border-amber-500/25'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-amber-500/20">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span
                  className={`text-[11px] font-khmer font-bold ${
                    theme === 'light' ? 'text-amber-950' : 'text-amber-200'
                  }`}
                >
                  ១. មង្គលការបែបប្រពៃណី (Khmer Traditional Wedding — KH &amp; EN Styles)
                </span>
              </div>
              <span className="text-[10px] font-khmer opacity-75">
                ម៉ូតអក្សរខ្មែរ ({traditionalKhPresets.length}) &amp; អង់គ្លេស ({traditionalEnPresets.length})
              </span>
            </div>

            <div className="space-y-1.5">
              <span
                className={`block text-[10px] font-khmer font-semibold ${
                  theme === 'light' ? 'text-amber-900' : 'text-amber-300/90'
                }`}
              >
                • ម៉ូតអក្សរខ្មែរប្រពៃណី (Khmer Traditional Styles - {khSampleText}):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {traditionalKhPresets.map((font) => renderPresetButton(font, 'kh'))}
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <span
                className={`block text-[10px] font-khmer font-semibold ${
                  theme === 'light' ? 'text-amber-900' : 'text-amber-300/90'
                }`}
              >
                • ម៉ូតអក្សរអង់គ្លេសប្រពៃណី (English Traditional Styles - {enSampleText}):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {traditionalEnPresets.map((font) => renderPresetButton(font, 'en'))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Modern Wedding Reception (អាពាហ៍ពិពាហ៍បែបសម័យ) - KH & EN Styles */}
        {(styleCategoryFilter === 'all' || styleCategoryFilter === 'modern') && (
          <div
            className={`p-3 rounded-xl border space-y-2.5 ${
              theme === 'light'
                ? 'bg-rose-50/60 border-rose-200/90'
                : 'bg-rose-950/15 border-rose-500/25'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-rose-500/20">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span
                  className={`text-[11px] font-khmer font-bold ${
                    theme === 'light' ? 'text-rose-950' : 'text-rose-200'
                  }`}
                >
                  ២. អាពាហ៍ពិពាហ៍បែបសម័យ (Modern Wedding Reception — KH &amp; EN Styles)
                </span>
              </div>
              <span className="text-[10px] font-khmer opacity-75">
                ម៉ូតអក្សរខ្មែរ ({modernKhPresets.length}) &amp; អង់គ្លេស ({modernEnPresets.length})
              </span>
            </div>

            <div className="space-y-1.5">
              <span
                className={`block text-[10px] font-khmer font-semibold ${
                  theme === 'light' ? 'text-rose-900' : 'text-rose-300/90'
                }`}
              >
                • ម៉ូតអក្សរខ្មែរបែបសម័យ (Khmer Modern Reception Styles - {khSampleText}):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {modernKhPresets.map((font) => renderPresetButton(font, 'kh'))}
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <span
                className={`block text-[10px] font-khmer font-semibold ${
                  theme === 'light' ? 'text-rose-900' : 'text-rose-300/90'
                }`}
              >
                • ម៉ូតអក្សរអង់គ្លេសបែបសម័យ (English Modern Reception Styles - {enSampleText}):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {modernEnPresets.map((font) => renderPresetButton(font, 'en'))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
