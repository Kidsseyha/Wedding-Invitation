import { Sparkles, RefreshCw, Check, Save } from 'lucide-react';
import { Language, TemplateConfig } from '../types';
import { ThemeMode } from './ThemeToggle';
import {
  getFirstNameInitial,
  MONOGRAM_COLOR_PRESETS,
  MONOGRAM_FONT_PRESETS_EN,
  MONOGRAM_FONT_PRESETS_KH,
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
  const isKhmer = language === 'kh';
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
    language,
    config.cover_monogram_font_family,
    config.cover_monogram_font_family_en,
    isLatinPreview
  );
  const activePresets = isKhmer ? MONOGRAM_FONT_PRESETS_KH : MONOGRAM_FONT_PRESETS_EN;
  const activeFontKey: 'cover_monogram_font_family' | 'cover_monogram_font_family_en' = isKhmer
    ? 'cover_monogram_font_family'
    : 'cover_monogram_font_family_en';
  const activeSelectedFont = isKhmer
    ? (config.cover_monogram_font_family &&
      MONOGRAM_FONT_PRESETS_KH.some((p) => p.fontFamily === config.cover_monogram_font_family)
        ? config.cover_monogram_font_family
        : '')
    : (config.cover_monogram_font_family_en ??
      (config.cover_monogram_font_family &&
      MONOGRAM_FONT_PRESETS_EN.some((p) => p.fontFamily === config.cover_monogram_font_family)
        ? config.cover_monogram_font_family
        : ''));

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
                  {singlePerson ? 'ម្ចាស់កម្មវិធី (ពីគំរូធៀប):' : 'កូនប្រុស (ពីគំរូធៀបអាពាហ៍ពិពាហ៍):'}
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
                    កូនស្រី (ពីគំរូធៀបអាពាហ៍ពិពាហ៍):
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

      {/* Font Family Selection */}
      <div className="space-y-2 pt-2 border-t border-amber-500/20">
        <div className="flex items-center justify-between">
          <label
            className={`text-[11px] font-semibold font-khmer ${
              theme === 'light' ? 'text-amber-950' : 'text-amber-200'
            }`}
          >
            {isKhmer
              ? 'ម៉ូតអក្សរកាត់ (Monogram Font Style - ខ្មែរ):'
              : 'Monogram Font Style (EN):'}
          </label>
          <span className="text-[10px] font-khmer opacity-75">
            {isKhmer ? 'ចុចដើម្បីប្តូរម៉ូតអក្សរ' : 'Click to switch EN style'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {activePresets.map((font) => {
            const isSelected = activeSelectedFont === font.fontFamily;
            return (
              <button
                key={`mono-font-${language}-${font.id}`}
                type="button"
                onClick={() => onUpdateConfig(activeFontKey, font.fontFamily)}
                className={`p-2 rounded-xl border text-left transition-all flex flex-col gap-0.5 active:scale-95 cursor-pointer ${
                  isSelected
                    ? 'border-amber-400 ring-2 ring-amber-400/40 font-bold bg-amber-400/20 ' +
                      (theme === 'light' ? 'text-amber-950' : 'text-amber-300')
                    : theme === 'light'
                    ? 'bg-white border-amber-200 text-neutral-800 hover:border-amber-400 hover:bg-amber-50/50'
                    : 'bg-black/40 border-white/10 text-amber-100 hover:border-amber-400/40'
                }`}
              >
                <span className="text-[10px] font-khmer opacity-75 truncate">{font.nameKh}</span>
                <span
                  className="text-base truncate leading-tight"
                  style={{
                    fontFamily:
                      font.fontFamily ||
                      (isKhmer
                        ? "'Moulpali', 'Moul', 'Noto Serif Khmer', serif"
                        : "'Playfair Display', 'Cinzel', Georgia, serif"),
                    color: monogramColor,
                  }}
                >
                  {singlePerson ? effectiveGroomInit : `${effectiveGroomInit} & ${effectiveBrideInit}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
