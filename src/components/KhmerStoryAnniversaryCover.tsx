import React, { useState, type FormEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Heart,
  MapPin,
  ChevronDown,
  Globe,
  Volume2,
  VolumeX,
  SkipForward,
  User,
  Check,
  X,
  BookOpen,
  ExternalLink,
  Palette,
  Edit3,
} from 'lucide-react';
import { Language, WeddingEvent } from '../types';
import { ThemeMode } from './ThemeToggle';
import { GuestPreset } from '../data/guests';
import { KhmerCornerKbach, KhmerDividerKbach } from './KhmerRoyalOrnament';
import AnniversaryQuickEditor from './AnniversaryQuickEditor';
import {
  formatAnniversaryMilestone,
  formatAnniversarySchedule,
  buildAnniversaryHostsDisplay,
  buildAnniversaryStoryQuote,
  formatAnniversaryLocation,
  buildGoogleMapsSearchUrl,
  resolveStoryStartYear,
  containsKhmerScript,
  toKhmerDigits,
} from '../utils/anniversaryHelpers';
import khmerAnnivSilkBg from '../assets/images/khmer_anniversary_silk_bg_1794794578031.jpg';
import khmerAnnivStoryEmblem from '../assets/images/khmer_anniversary_story_emblem_1794794574209.jpg';

export { khmerAnnivSilkBg, khmerAnnivStoryEmblem };

interface KhmerStoryAnniversaryCoverProps {
  eventData?: WeddingEvent;
  groom?: string;
  bride?: string;
  groomEn?: string;
  brideEn?: string;
  singlePerson?: boolean;
  subtitleKh?: string;
  subtitleEn?: string;
  anniversaryMilestone?: string;
  anniversaryMilestoneEn?: string;
  storyStartYear?: string;
  storyMessageKh?: string;
  storyMessageEn?: string;
  ribbonLabel?: string;
  guestName?: string;
  language: Language;
  theme: ThemeMode;
  isOpening?: boolean;
  isAdmin?: boolean;
  savedGuestsList?: GuestPreset[];
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  eventLocationEn?: string;
  mapUrl?: string;
  coverBackground?: string;
  envelopeHeaderImage?: string;
  coverEnNameColor?: string;
  coverEnFontFamily?: string;
  guestNameFontFamily?: string;
  guestNameFontSize?: string;
  activeEnvelopeColor?: string;
  isPlayingMusic: boolean;
  onToggleMusic: () => void;
  onRestartMusic: () => void;
  onToggleLanguage?: () => void;
  onOpenDesignTab?: () => void;
  onSaveAnniversaryInfo?: (updatedEvent: WeddingEvent) => Promise<void> | void;
  allowQuickEdit?: boolean;
  onRequireAdminAuth?: (onSuccess: () => void) => void;
  onSelectFromDropbox: (name: string) => void;
  onOpenAddGuestModal?: () => void;
  onUpdateGuestName?: (name: string) => void;
  onOpenInvitation: () => void;
}

const JASMINE_EMBERS = [
  { id: 'ae1', left: '9%', top: '20%', size: 5, delay: 0.2, dur: 5.2 },
  { id: 'ae2', left: '89%', top: '18%', size: 6, delay: 1.1, dur: 6.0 },
  { id: 'ae3', left: '7%', top: '56%', size: 6, delay: 2.0, dur: 5.6 },
  { id: 'ae4', left: '91%', top: '54%', size: 5, delay: 0.8, dur: 6.4 },
  { id: 'ae5', left: '14%', top: '83%', size: 5, delay: 1.5, dur: 5.4 },
  { id: 'ae6', left: '85%', top: '82%', size: 6, delay: 2.4, dur: 5.9 },
];

export default function KhmerStoryAnniversaryCover({
  eventData,
  groom,
  bride,
  groomEn,
  brideEn,
  singlePerson = false,
  subtitleKh,
  subtitleEn,
  anniversaryMilestone,
  anniversaryMilestoneEn,
  storyStartYear,
  storyMessageKh,
  storyMessageEn,
  ribbonLabel,
  guestName,
  language,
  theme,
  isOpening = false,
  isAdmin = false,
  savedGuestsList = [],
  eventDate,
  eventTime,
  eventLocation,
  eventLocationEn,
  mapUrl,
  coverBackground,
  envelopeHeaderImage,
  coverEnNameColor,
  coverEnFontFamily,
  guestNameFontFamily,
  guestNameFontSize,
  activeEnvelopeColor,
  isPlayingMusic,
  onToggleMusic,
  onRestartMusic,
  onToggleLanguage,
  onOpenDesignTab,
  onSaveAnniversaryInfo,
  allowQuickEdit = false,
  onRequireAdminAuth,
  onSelectFromDropbox,
  onOpenAddGuestModal,
  onUpdateGuestName,
  onOpenInvitation,
}: KhmerStoryAnniversaryCoverProps) {
  const prefersReducedMotion = useReducedMotion();
  const isLight = theme === 'light';

  const [isEditingGuest, setIsEditingGuest] = useState(false);
  const [tempGuestName, setTempGuestName] = useState(guestName || '');
  const [isLocationExpanded, setIsLocationExpanded] = useState(false);
  const [isQuickEditorOpen, setIsQuickEditorOpen] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);
  const [emblemFailed, setEmblemFailed] = useState(false);

  const milestone = formatAnniversaryMilestone(
    anniversaryMilestone,
    anniversaryMilestoneEn,
    language
  );
  const schedule = formatAnniversarySchedule(eventDate, eventTime);
  const hostsKh = buildAnniversaryHostsDisplay(groom, bride, singlePerson);
  const hostsEn = buildAnniversaryHostsDisplay(
    groomEn || groom,
    brideEn || bride,
    singlePerson
  );
  const storyQuote = buildAnniversaryStoryQuote({
    milestoneKh: anniversaryMilestone,
    milestoneEn: anniversaryMilestoneEn,
    customMessageKh: storyMessageKh,
    customMessageEn: storyMessageEn,
    language,
  });
  const cleanLocation = formatAnniversaryLocation(
    language === 'en' && eventLocationEn?.trim() ? eventLocationEn : eventLocation,
    language
  );

  const displayGuest =
    guestName && guestName !== 'Your Name'
      ? guestName
      : language === 'kh'
      ? 'ភ្ញៀវកិត្តិយស'
      : 'Honored Guest';

  const targetYearNum = parseInt(schedule.targetYearEn, 10) || 2026;
  const resolvedStart = resolveStoryStartYear(
    storyStartYear,
    schedule.targetYearEn,
    milestone.yearsNumber
  );

  const hasCustomCover =
    Boolean(coverBackground) &&
    !coverBackground!.includes('unsplash.com') &&
    !coverBackground!.includes('free-background') &&
    !coverBackground!.includes('default') &&
    !coverBackground!.includes('white_arch_columns');
  const backdropImage = !bgFailed ? (hasCustomCover ? coverBackground! : khmerAnnivSilkBg) : '';

  const customMedallionUrl =
    envelopeHeaderImage && envelopeHeaderImage !== 'none' ? envelopeHeaderImage : '';
  const medallionSrc = !emblemFailed && customMedallionUrl ? customMedallionUrl : khmerAnnivStoryEmblem;

  const handleSaveInlineGuest = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = tempGuestName.trim();
    if (trimmed && onUpdateGuestName) {
      onUpdateGuestName(trimmed);
    }
    setIsEditingGuest(false);
  };

  // Curated Khmer Royal Silk & Crimson Palette (light ivory parchment vs dark lacquer)
  const goldInk = isLight ? '#946212' : '#f4cb5c';
  const crimsonInk = isLight ? '#731325' : '#fde8c8';
  const bodyInk = isLight ? '#3d241c' : '#ebd8c3';
  const mutedHairline = isLight ? 'rgba(148, 98, 18, 0.28)' : 'rgba(244, 203, 92, 0.32)';

  const headingKh =
    subtitleKh &&
    subtitleKh !== 'សូមអញ្ជើញចូលរួមអបអរសាទរ' &&
    subtitleKh !== 'សិរីមង្គលអាពាហ៍ពិពាហ៍'
      ? subtitleKh
      : 'ពិធីខួបអាពាហ៍ពិពាហ៍';

  const headingEn =
    subtitleEn && subtitleEn !== 'PLEASE JOIN US TO CELEBRATE THE'
      ? subtitleEn
      : 'Wedding Anniversary Story';

  const canQuickEdit = Boolean((isAdmin || allowQuickEdit) && eventData && onSaveAnniversaryInfo);

  const handleOpenQuickEditor = () => {
    if (!isAdmin && onRequireAdminAuth) {
      onRequireAdminAuth(() => setIsQuickEditorOpen(true));
      return;
    }
    setIsQuickEditorOpen(true);
  };

  return (
    <div
      data-testid="khmer-story-anniversary-cover"
      data-anniversary-theme={theme}
      className={`relative isolate w-full h-full min-h-[600px] sm:min-h-[680px] md:min-h-[740px] flex flex-col justify-between items-center text-center overflow-hidden rounded-[28px] select-none px-4 sm:px-7 py-5 sm:py-6 ${
        isLight ? 'bg-[#fcf7eb] text-[#3d241c]' : 'bg-[#1a070d] text-[#fdf4e3]'
      }`}
    >
      {/* 1. Woven Khmer Royal Silk & Gold Kbach Backdrop */}
      {backdropImage ? (
        <img
          src={backdropImage}
          alt={
            language === 'kh'
              ? 'ផ្ទៃសូត្រមាសប្រពៃណីខ្មែរសម្រាប់ពិធីខួបអាពាហ៍ពិពាហ៍'
              : 'Traditional Cambodian crimson and gold silk tapestry'
          }
          referrerPolicy="no-referrer"
          onError={() => setBgFailed(true)}
          className="pointer-events-none absolute inset-0 -z-20 w-full h-full object-cover scale-[1.08]"
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-b from-[#330b16] via-[#4a1021] to-[#21060d]"
        />
      )}

      {/* 2. Measured Archival Radial Scrim for High Legibility While Keeping Gold Kbach Border */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 transition-colors duration-500"
        style={{
          background: isLight
            ? 'radial-gradient(ellipse 78% 76% at 50% 49%, rgba(253, 249, 240, 0.97) 0%, rgba(250, 242, 224, 0.91) 58%, rgba(120, 24, 42, 0.25) 100%)'
            : 'radial-gradient(ellipse 76% 76% at 50% 50%, rgba(26, 7, 13, 0.94) 0%, rgba(39, 10, 19, 0.86) 58%, rgba(16, 4, 8, 0.38) 100%)',
        }}
      />

      {/* 3. Subtle Inner Double Khmer Gold Hairline Frame & Kbach Corners */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-2.5 sm:inset-3 rounded-[22px] border z-10"
        style={{ borderColor: isLight ? 'rgba(148, 98, 18, 0.4)' : 'rgba(244, 203, 92, 0.42)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-3.5 sm:inset-4 rounded-[18px] border z-10"
        style={{ borderColor: isLight ? 'rgba(115, 19, 37, 0.16)' : 'rgba(253, 232, 200, 0.14)' }}
      />

      <div className="pointer-events-none absolute top-2 left-2 z-10 opacity-90">
        <KhmerCornerKbach position="top-left" className="w-11 h-11 sm:w-12 sm:h-12" color={goldInk} />
      </div>
      <div className="pointer-events-none absolute top-2 right-2 z-10 opacity-90">
        <KhmerCornerKbach position="top-right" className="w-11 h-11 sm:w-12 sm:h-12" color={goldInk} />
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 opacity-90">
        <KhmerCornerKbach position="bottom-left" className="w-11 h-11 sm:w-12 sm:h-12" color={goldInk} />
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 z-10 opacity-90">
        <KhmerCornerKbach position="bottom-right" className="w-11 h-11 sm:w-12 sm:h-12" color={goldInk} />
      </div>

      {/* 4. Soft Golden Candlelight & Jasmine Embers (Perimeter Only, Compositor-Only) */}
      {!prefersReducedMotion && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {JASMINE_EMBERS.map((ember) => (
            <motion.span
              key={ember.id}
              style={{
                left: ember.left,
                top: ember.top,
                width: ember.size,
                height: ember.size,
              }}
              animate={{
                y: [0, -10, 0],
                opacity: [0.22, 0.68, 0.22],
              }}
              transition={{
                duration: ember.dur,
                delay: ember.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className={`absolute rounded-full ${
                isLight ? 'bg-amber-600/45' : 'bg-amber-300/60'
              }`}
            />
          ))}
        </div>
      )}

      {/* 5. Top Utility Controls Row */}
      <div className="relative z-30 w-full flex items-center justify-between gap-2 pt-0.5 px-1">
        <div className="flex items-center gap-1.5">
          {onToggleLanguage && (
            <button
              type="button"
              onClick={onToggleLanguage}
              aria-label={language === 'kh' ? 'Switch to English' : 'ប្តូរទៅភាសាខ្មែរ'}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-khmer font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white/90 hover:bg-white text-[#731325] border-[#946212]/30 shadow-xs'
                  : 'bg-[#2a0c15]/85 hover:bg-[#3c111e] text-amber-200 border-amber-400/35 shadow-xs'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>{language === 'kh' ? 'ខ្មែរ | EN' : 'EN | ខ្មែរ'}</span>
            </button>
          )}
          {canQuickEdit && (
            <button
              id="edit-anniversary-story-btn"
              type="button"
              onClick={handleOpenQuickEditor}
              aria-label={language === 'kh' ? 'កែព័ត៌មានធៀបខួបអាពាហ៍ពិពាហ៍' : 'Edit Story Info'}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-khmer font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isLight
                  ? 'bg-[#731325] hover:bg-[#8c182e] text-amber-100 border-[#946212]/40 shadow-xs'
                  : 'bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border-amber-400/50 shadow-xs'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span>{language === 'kh' ? 'កែព័ត៌មាន' : 'Edit Info'}</span>
            </button>
          )}
          {isAdmin && onOpenDesignTab && (
            <button
              type="button"
              onClick={onOpenDesignTab}
              aria-label={language === 'kh' ? 'កែការរចនា' : 'Edit Design'}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-khmer font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white/90 hover:bg-white text-[#946212] border-[#946212]/30 shadow-xs'
                  : 'bg-[#2a0c15]/85 hover:bg-[#3c111e] text-amber-200 border-amber-400/35 shadow-xs'
              }`}
            >
              <Palette
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: activeEnvelopeColor || goldInk }}
              />
              <span>{language === 'kh' ? 'កែរចនា' : 'Design'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRestartMusic}
            aria-label={language === 'kh' ? 'ចាក់ភ្លេងឡើងវិញ' : 'Restart music'}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
              isLight
                ? 'bg-white/90 hover:bg-white text-[#731325] border-[#946212]/30 shadow-xs'
                : 'bg-[#2a0c15]/85 hover:bg-[#3c111e] text-amber-200 border-amber-400/35 shadow-xs'
            }`}
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleMusic}
            aria-label={isPlayingMusic ? 'Mute background music' : 'Play background music'}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
              isLight
                ? 'bg-white/90 hover:bg-white text-[#731325] border-[#946212]/30 shadow-xs'
                : 'bg-[#2a0c15]/85 hover:bg-[#3c111e] text-amber-200 border-amber-400/35 shadow-xs'
            }`}
          >
            {isPlayingMusic ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 6. Khmer Ceremonial Header & Story Chapter Kicker */}
      <motion.header
        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-20 flex flex-col items-center w-full max-w-md mt-1"
      >
        {/* Khmer Crowned Sacred Lotus & Intertwined Gold Rings Crest */}
        <svg
          viewBox="0 0 140 38"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="w-28 h-8 mb-1"
        >
          <path
            d="M12 24 Q 40 24 54 17 M128 24 Q 100 24 86 17"
            stroke={goldInk}
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.72"
          />
          {/* Intertwined Wedding Rings */}
          <circle cx="64" cy="23" r="6.5" stroke={goldInk} strokeWidth="1.4" />
          <circle cx="76" cy="23" r="6.5" stroke={goldInk} strokeWidth="1.4" />
          {/* Lotus Bud Crown */}
          <path
            d="M70 4 C 66 9, 66 14, 70 17 C 74 14, 74 9, 70 4 Z"
            fill={goldInk}
            opacity="0.92"
          />
          <path
            d="M70 16 C 64 14, 60 10, 62 6 C 65 7, 68 11, 70 16 Z"
            fill={goldInk}
            opacity="0.65"
          />
          <path
            d="M70 16 C 76 14, 80 10, 78 6 C 75 7, 72 11, 70 16 Z"
            fill={goldInk}
            opacity="0.65"
          />
        </svg>

        {/* Quiet Editorial Chapter Kicker (Zero-Pill Typography) */}
        <p
          className={`text-[11px] sm:text-xs font-semibold ${
            language === 'kh' ? 'tracking-normal' : 'tracking-[0.14em] uppercase'
          }`}
          style={{ color: goldInk, fontFamily: language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif" }}
        >
          {milestone.kickerLabel}
        </p>

        <h1
          className={`mt-1 text-xl sm:text-2xl md:text-[26px] font-bold leading-[1.55] px-2 text-balance ${
            language === 'kh' ? 'tracking-normal' : 'tracking-wide'
          }`}
          style={{
            fontFamily: language === 'kh' ? "'Moul', serif" : "'Playfair Display', serif",
            color: crimsonInk,
            textShadow: isLight ? '0 1px 0 rgba(255,255,255,0.85)' : '0 2px 10px rgba(0,0,0,0.6)',
          }}
        >
          {language === 'kh' ? headingKh : headingEn}
        </h1>

        <p
          className={`mt-0.5 font-medium ${
            language === 'kh'
              ? 'text-xs sm:text-[13px] tracking-wider italic'
              : 'text-xs sm:text-[13px] font-khmer'
          }`}
          style={{
            color: goldInk,
            fontFamily: language === 'kh' ? "'Playfair Display', serif" : "'Noto Serif Khmer', serif",
          }}
        >
          {language === 'kh' ? headingEn : headingKh}
        </p>

        <KhmerDividerKbach className="w-44 sm:w-56 h-4 mt-1.5 opacity-90" color={goldInk} />
      </motion.header>

      {/* 7. Centerpiece: Khmer Silk Story Keepsake Medallion & Couple Names */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-20 flex flex-col items-center my-1.5"
      >
        <div
          className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
          style={{
            background: isLight
              ? 'linear-gradient(135deg, #d4af37, #fef3c7, #946212)'
              : 'linear-gradient(135deg, #f4cb5c, #fde68a, #9a6d16)',
          }}
        >
          <div
            className={`w-full h-full rounded-full overflow-hidden border-2 ${
              isLight ? 'border-white/90 bg-[#f8f1e1]' : 'border-[#1a070d] bg-[#2a0c15]'
            }`}
          >
            {!emblemFailed ? (
              <img
                src={medallionSrc}
                alt={
                  language === 'kh'
                    ? 'ចិញ្ចៀនមាសគូ និងកម្រងផ្កាម្លិះខ្មែរ'
                    : 'Intertwined gold wedding bands with Cambodian jasmine and lotus petals'
                }
                referrerPolicy="no-referrer"
                onError={() => setEmblemFailed(true)}
                className="w-full h-full object-cover scale-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#5b1021] to-[#29060f] text-amber-200">
                <Heart className="w-8 h-8 mb-1" />
                <span className="text-[10px] font-khmer">{milestone.yearsBadge}</span>
              </div>
            )}
          </div>
        </div>

        {/* Couple Names (Clean Typographic Hierarchy, Zero Ghost Watermark) */}
        <div className="mt-2 space-y-0.5 max-w-sm px-2">
          <h2
            className="text-[18px] sm:text-xl font-normal leading-[1.6] tracking-normal text-balance"
            style={{
              fontFamily: containsKhmerScript(hostsKh) ? "'Moul', serif" : "'Playfair Display', serif",
              color: crimsonInk,
            }}
          >
            {hostsKh}
          </h2>
          <p
            className="text-sm sm:text-base font-medium italic tracking-wide"
            style={{
              color:
                coverEnNameColor && !coverEnNameColor.includes('fde047')
                  ? coverEnNameColor
                  : goldInk,
              fontFamily: coverEnFontFamily || "'Playfair Display', serif",
            }}
          >
            {hostsEn}
          </p>
        </div>
      </motion.div>

      {/* 8. Editorial Khmer Love-Story Chapter Note & Timeline Milestone Strip */}
      <div
        className="relative z-20 w-full max-w-sm py-2.5 px-3 border-y space-y-1.5"
        style={{ borderColor: mutedHairline }}
      >
        {/* Unboxed 3-Stop Story Arc */}
        <div
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-semibold tabular-nums"
          style={{ color: goldInk }}
        >
          <span>
            {language === 'kh'
              ? resolvedStart
                ? `ចាប់ផ្តើម ${resolvedStart.startYearKh}`
                : 'ថ្ងៃរៀបការ'
              : resolvedStart
              ? `Est. ${resolvedStart.startYearEn}`
              : 'Wedding Day'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{milestone.yearsBadge}</span>
          <span aria-hidden="true">·</span>
          <span>
            {language === 'kh'
              ? toKhmerDigits(targetYearNum)
              : targetYearNum}
          </span>
        </div>

        {/* Poetic Khmer Story Excerpt */}
        <p
          className="text-xs sm:text-[13px] leading-[1.7] max-w-[34ch] mx-auto font-normal"
          style={{
            color: bodyInk,
            fontFamily: language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
          }}
        >
          “{storyQuote}”
        </p>

        {/* Quiet 4-Chapter Khmer Cultural Story Index (Zero-Pill) */}
        <p
          className="text-[10px] sm:text-[11px] font-medium opacity-85"
          style={{
            color: goldInk,
            fontFamily: language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
          }}
        >
          {language === 'kh'
            ? '០១ និស្ស័យ · ០២ សំពះផ្ទឹម · ០៣ គ្រួសារ · ០៤ សិរីមង្គល'
            : 'I. Nissay · II. Sompeah Ptem · III. Hearth · IV. Blessing'}
        </p>

        {/* Celebration Date, Time & Expandable Venue */}
        <div className="pt-1 flex flex-col items-center gap-0.5">
          <div
            className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-semibold tabular-nums"
            style={{ color: crimsonInk }}
          >
            <span>{language === 'kh' ? schedule.dateLabelKh : schedule.dateLabelEn}</span>
            <span aria-hidden="true" style={{ color: goldInk }}>
              ·
            </span>
            <span>{language === 'kh' ? schedule.timeLabelKh : schedule.timeLabelEn}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsLocationExpanded((prev) => !prev)}
            aria-expanded={isLocationExpanded}
            className="inline-flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-medium max-w-full hover:opacity-80 transition-opacity cursor-pointer"
            style={{ color: bodyInk }}
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: goldInk }} />
            <span className="truncate max-w-[235px] sm:max-w-[290px]">{cleanLocation}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                isLocationExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          <AnimatePresence>
            {isLocationExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden w-full pt-1 text-center"
              >
                <a
                  href={buildGoogleMapsSearchUrl(cleanLocation, mapUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold underline underline-offset-2 hover:opacity-80"
                  style={{ color: goldInk }}
                >
                  <span>
                    {language === 'kh'
                      ? 'បើកមើលទីតាំងលើ Google Maps'
                      : 'Open location in Google Maps'}
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 9. Honored Guest Plaque & Optional Guest Selector */}
      <div className="relative z-20 w-full max-w-sm flex flex-col items-center my-1.5 space-y-2">
        {savedGuestsList.length > 0 && (
          <div className="w-full max-w-[300px]">
            <label htmlFor="guest-database-dropbox-select" className="sr-only">
              {language === 'kh' ? 'ជ្រើសរើសឈ្មោះភ្ញៀវ' : 'Select Guest'}
            </label>
            <select
              id="guest-database-dropbox-select"
              value={savedGuestsList.some((g) => g.name === guestName) ? guestName : ''}
              onChange={(e) => onSelectFromDropbox(e.target.value)}
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-khmer border focus:outline-none focus-visible:ring-2 cursor-pointer ${
                isLight
                  ? 'bg-white/95 text-[#731325] border-[#946212]/35 focus-visible:ring-amber-600'
                  : 'bg-[#260912]/90 text-amber-100 border-amber-400/35 focus-visible:ring-amber-400'
              }`}
            >
              <option value="" disabled>
                {language === 'kh'
                  ? '▼ ជ្រើសរើសឈ្មោះភ្ញៀវពីបញ្ជី...'
                  : '▼ Select Guest from List...'}
              </option>
              {savedGuestsList.map((g, idx) => (
                <option key={g.id ? `${g.id}-${idx}` : `an-guest-${idx}`} value={g.name}>
                  {g.name}{' '}
                  {g.categoryLabelKh
                    ? `(${language === 'kh' ? g.categoryLabelKh : g.categoryLabelEn || g.categoryLabelKh})`
                    : ''}
                </option>
              ))}
              {isAdmin && (
                <option value="__ADD_NEW__">
                  + {language === 'kh' ? 'បន្ថែមភ្ញៀវថ្មី...' : 'Add New Guest...'}
                </option>
              )}
            </select>
          </div>
        )}

        {!isEditingGuest ? (
          <div
            className={`w-full max-w-[320px] px-4 py-2 rounded-xl border ${
              isLight
                ? 'bg-white/90 border-[#946212]/35 shadow-sm'
                : 'bg-[#260912]/85 border-amber-400/35 shadow-md'
            }`}
          >
            <p
              className={`text-[11px] sm:text-xs font-khmer font-semibold ${
                language === 'kh' ? 'tracking-normal' : 'tracking-wide'
              }`}
              style={{ color: goldInk }}
            >
              {ribbonLabel ||
                (language === 'kh'
                  ? 'សូមគោរពអញ្ជើញចូលរួមអបអរសាទរ'
                  : 'Cordially Invited to Celebrate With Us')}
            </p>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  if (onOpenAddGuestModal) {
                    onOpenAddGuestModal();
                  } else {
                    setTempGuestName(guestName || '');
                    setIsEditingGuest(true);
                  }
                }}
                title={
                  language === 'kh'
                    ? 'ចុចដើម្បីបន្ថែម ឬកែឈ្មោះភ្ញៀវ'
                    : 'Click to edit or add guest name'
                }
                className="w-full mt-0.5 text-center hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span
                  className={`block truncate leading-relaxed ${
                    containsKhmerScript(displayGuest)
                      ? 'font-moul text-base sm:text-lg tracking-normal'
                      : 'font-bold text-lg sm:text-xl tracking-wide'
                  }`}
                  style={{
                    fontFamily:
                      guestNameFontFamily && containsKhmerScript(displayGuest)
                        ? guestNameFontFamily
                        : containsKhmerScript(displayGuest)
                        ? "'Moul', serif"
                        : "'Playfair Display', serif",
                    fontSize: guestNameFontSize ? `${guestNameFontSize}px` : undefined,
                    color: crimsonInk,
                  }}
                >
                  {displayGuest}
                </span>
              </button>
            ) : (
              <span
                className={`block truncate leading-relaxed mt-0.5 ${
                  containsKhmerScript(displayGuest)
                    ? 'font-moul text-base sm:text-lg tracking-normal'
                    : 'font-bold text-lg sm:text-xl tracking-wide'
                }`}
                style={{
                  fontFamily:
                    guestNameFontFamily && containsKhmerScript(displayGuest)
                      ? guestNameFontFamily
                      : containsKhmerScript(displayGuest)
                      ? "'Moul', serif"
                      : "'Playfair Display', serif",
                  fontSize: guestNameFontSize ? `${guestNameFontSize}px` : undefined,
                  color: crimsonInk,
                }}
              >
                {displayGuest}
              </span>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleSaveInlineGuest}
            className={`w-full max-w-[320px] p-2.5 rounded-xl border space-y-2 ${
              isLight
                ? 'bg-white/95 border-[#946212]/40'
                : 'bg-[#260912]/95 border-amber-400/40'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-khmer font-semibold">
              <span className="flex items-center gap-1" style={{ color: goldInk }}>
                <User className="w-3.5 h-3.5" />
                <span>{language === 'kh' ? 'ឈ្មោះភ្ញៀវកិត្តិយស' : 'Guest Name'}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsEditingGuest(false)}
                aria-label="Cancel editing guest name"
                className="p-1 rounded hover:opacity-75 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="guest-name-input"
                type="text"
                value={tempGuestName}
                onChange={(e) => setTempGuestName(e.target.value)}
                autoFocus
                placeholder={language === 'kh' ? 'ឈ្មោះភ្ញៀវ...' : 'Guest name...'}
                className={`flex-1 px-3 py-1.5 rounded-lg border text-sm font-moul text-center focus:outline-none ${
                  isLight
                    ? 'bg-white text-[#731325] border-[#946212]/35'
                    : 'bg-[#17050a] text-amber-100 border-amber-400/35'
                }`}
              />
              <button
                id="save-guest-name-btn"
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#7c1428] text-amber-100 text-xs font-khmer font-bold flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{language === 'kh' ? 'រក្សាទុក' : 'Save'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 10. Primary Open Story Invitation Button */}
      <div className="relative z-20 w-full flex justify-center pt-1">
        <motion.button
          id="open-anniversary-invitation-btn"
          type="button"
          onClick={onOpenInvitation}
          disabled={isOpening}
          whileHover={prefersReducedMotion ? undefined : { scale: 1.03, y: -1 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          className="relative group px-7 py-3 rounded-full bg-gradient-to-r from-[#7c1428] via-[#991b33] to-[#681021] hover:from-[#8d172e] hover:to-[#7a1326] text-amber-100 border border-[#e8bf54]/85 shadow-[0_10px_24px_rgba(90,12,28,0.45)] flex items-center justify-center gap-2.5 whitespace-nowrap shrink-0 overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-amber-200/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
          />
          <BookOpen className="relative z-10 w-4 h-4 text-[#f4cb5c] shrink-0" />
          <span
            className={`relative z-10 text-xs sm:text-sm font-bold text-[#fef8e8] ${
              language === 'kh' ? 'tracking-normal' : 'tracking-wide'
            }`}
            style={{ fontFamily: "'Noto Serif Khmer', serif" }}
          >
            {isOpening
              ? language === 'kh'
                ? 'កំពុងបើករឿងរ៉ាវ...'
                : 'Opening Story...'
              : language === 'kh'
              ? 'សូមចុចបើកអានរឿងរ៉ាវ'
              : 'Read Story Invitation'}
          </span>
          <Heart className="relative z-10 w-3.5 h-3.5 text-[#f4cb5c] fill-[#f4cb5c]/70 shrink-0" />
        </motion.button>
      </div>

      {/* Quick In-Place Story Editor Dialog */}
      {isQuickEditorOpen && canQuickEdit && eventData && onSaveAnniversaryInfo && (
        <AnniversaryQuickEditor
          isOpen={isQuickEditorOpen}
          event={eventData}
          language={language}
          theme={theme}
          onClose={() => setIsQuickEditorOpen(false)}
          onSave={onSaveAnniversaryInfo}
        />
      )}
    </div>
  );
}
