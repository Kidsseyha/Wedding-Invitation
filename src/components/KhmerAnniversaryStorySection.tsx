import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Edit3, Flame, Heart, Music, Sparkles } from 'lucide-react';
import { AnniversaryStoryChapter, Language, WeddingEvent } from '../types';
import { ThemeMode } from './ThemeToggle';
import { KhmerDividerKbach } from './KhmerRoyalOrnament';
import {
  DEFAULT_KHMER_ANNIVERSARY_PROVERB,
  KHMER_CULTURAL_SYMBOLS,
  parseMilestoneYears,
  resolveAnniversaryStoryChapters,
  toKhmerDigits,
} from '../utils/anniversaryHelpers';

interface KhmerAnniversaryStorySectionProps {
  event: WeddingEvent;
  language: Language;
  theme: ThemeMode;
  canEdit?: boolean;
  onEditStory?: () => void;
}

export default function KhmerAnniversaryStorySection({
  event,
  language,
  theme,
  canEdit = false,
  onEditStory,
}: KhmerAnniversaryStorySectionProps) {
  const isLight = theme === 'light';
  const [selectedChapterId, setSelectedChapterId] = useState<string>('all');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const cfg = event.config || ({} as WeddingEvent['config']);
  const milestoneYears = parseMilestoneYears(
    cfg.anniversary_milestone || event.anniversary_milestone,
    cfg.anniversary_milestone_en || event.anniversary_milestone_en
  );

  const targetYear =
    (event.date || event.startTime || '').match(/\d{4}/)?.[0] || '2026';

  const chapters: AnniversaryStoryChapter[] = useMemo(
    () =>
      resolveAnniversaryStoryChapters(cfg.anniversary_story_chapters, {
        groom: event.groom,
        bride: event.bride,
        groomEn: event.groomEn,
        brideEn: event.brideEn,
        storyStartYear: cfg.story_start_year,
        targetYearEn: targetYear,
        milestoneYears,
      }),
    [
      cfg.anniversary_story_chapters,
      cfg.story_start_year,
      event.groom,
      event.bride,
      event.groomEn,
      event.brideEn,
      targetYear,
      milestoneYears,
    ]
  );

  const visibleChapters =
    selectedChapterId === 'all'
      ? chapters
      : chapters.filter((ch) => ch.id === selectedChapterId);

  const proverbText =
    language === 'kh'
      ? (cfg.anniversary_proverb_kh || '').trim() || DEFAULT_KHMER_ANNIVERSARY_PROVERB.kh
      : (cfg.anniversary_proverb_en || '').trim() || DEFAULT_KHMER_ANNIVERSARY_PROVERB.en;

  const goldInk = isLight ? '#946212' : '#f4cb5c';
  const headingInk = isLight ? '#731325' : '#fde8c8';
  const bodyInk = isLight ? '#2d1814' : '#eedcc8';
  const mutedInk = isLight ? '#6b4238' : '#d5b99d';
  const hairline = isLight ? 'rgba(148, 98, 18, 0.24)' : 'rgba(244, 203, 92, 0.25)';

  const renderSymbolIcon = (key: 'jasmine' | 'redThread' | 'popil' | 'music') => {
    const iconProps = { className: 'w-4 h-4 shrink-0', style: { color: goldInk } };
    switch (key) {
      case 'jasmine':
        return <Sparkles {...iconProps} />;
      case 'redThread':
        return <Heart {...iconProps} />;
      case 'popil':
        return <Flame {...iconProps} />;
      case 'music':
        return <Music {...iconProps} />;
    }
  };

  return (
    <section
      id="khmer-anniversary-story-section"
      data-testid="khmer-anniversary-story-section"
      className="relative z-10 py-10 px-5 sm:px-9 md:px-12"
    >
      {/* 1. Editorial Chronicle Masthead */}
      <div
        className="pb-6 mb-7 border-b text-center"
        style={{ borderColor: hairline }}
      >
        <p
          className={`text-[11px] sm:text-xs font-semibold mb-2 ${
            language === 'kh' ? 'tracking-normal' : 'uppercase tracking-[0.2em]'
          }`}
          style={{
            color: goldInk,
            fontFamily:
              language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
          }}
        >
          {language === 'kh'
            ? `បទនិទានរឿងរ៉ាវស្នេហាខ្មែរ · ${toKhmerDigits(chapters.length)} ជំពូកនៃសេចក្តីស្រឡាញ់`
            : `Khmer Cultural Love Chronicle · ${chapters.length} Chapters of Devotion`}
        </p>

        <h2
          className="text-2xl sm:text-3xl font-normal leading-[1.55] text-balance"
          style={{
            color: headingInk,
            fontFamily:
              language === 'kh' ? "'Moul', serif" : "'Playfair Display', serif",
          }}
        >
          {language === 'kh'
            ? 'រឿងរ៉ាវស្នេហា និងទំនៀមទម្លាប់ដូនតា'
            : 'Our Story in Khmer Cultural Heritage'}
        </h2>

        <p
          className="mt-2.5 text-sm leading-[1.85] max-w-[58ch] mx-auto"
          style={{
            color: bodyInk,
            fontFamily:
              language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
          }}
        >
          {language === 'kh'
            ? 'ពីនិស្ស័យបុព្វេសន្និវាសគ្រាដំបូង ពិធីមង្គលសំពះផ្ទឹមបង្វិលពពិល ៧ ជុំ ការសាងគេហដ្ឋានរក្សាទំនៀមទម្លាប់ខ្មែរ រហូតដល់ពិធីសូត្រមន្តគម្រប់ខួបសិរីមង្គលនាថ្ងៃនេះ។'
            : 'From the first destined meeting and Sompeah Ptem Popil candle blessings to decades building a Khmer household honored with monk prayers today.'}
        </p>

        <KhmerDividerKbach className="w-44 sm:w-56 h-4 mt-4 mx-auto opacity-90" color={goldInk} />

        {/* Editorial Proverb Pull-Quote (Double Hairline Frame) */}
        <blockquote
          className="mt-5 mx-auto max-w-2xl py-3.5 px-5 border-y"
          style={{ borderColor: hairline }}
        >
          <p
            className={`text-sm sm:text-base leading-[1.85] ${
              language === 'en' ? 'italic' : 'font-semibold'
            }`}
            style={{
              color: headingInk,
              fontFamily:
                language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
            }}
          >
            {proverbText}
          </p>
        </blockquote>

        {/* Filter Bar + Edit Trigger */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setSelectedChapterId('all')}
            aria-pressed={selectedChapterId === 'all'}
            className={`pb-1.5 text-xs sm:text-[13px] font-khmer font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              selectedChapterId === 'all'
                ? 'opacity-100'
                : 'border-transparent opacity-65 hover:opacity-100'
            }`}
            style={{
              color: selectedChapterId === 'all' ? headingInk : mutedInk,
              borderColor: selectedChapterId === 'all' ? goldInk : 'transparent',
            }}
          >
            {language === 'kh' ? 'គ្រប់ជំពូក (ទាំង ៤)' : 'All Chapters'}
          </button>

          {chapters.map((chapter, idx) => {
            const isActive = selectedChapterId === chapter.id;
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => setSelectedChapterId(chapter.id)}
                aria-pressed={isActive}
                className={`pb-1.5 text-xs sm:text-[13px] font-khmer font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isActive ? 'opacity-100' : 'border-transparent opacity-65 hover:opacity-100'
                }`}
                style={{
                  color: isActive ? headingInk : mutedInk,
                  borderColor: isActive ? goldInk : 'transparent',
                }}
              >
                {language === 'kh'
                  ? `ជំពូក ${toKhmerDigits(idx + 1)}`
                  : `Ch. ${idx + 1}`}
              </button>
            );
          })}

          {canEdit && onEditStory && (
            <button
              id="edit-khmer-story-chapters-btn"
              type="button"
              onClick={onEditStory}
              className={`ml-1 px-3 py-1 rounded-lg border text-xs font-khmer font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                isLight
                  ? 'bg-[#731325] text-amber-100 border-[#946212]/40 hover:bg-[#8d172e]'
                  : 'bg-amber-400/15 text-amber-200 border-amber-400/45 hover:bg-amber-400/25'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span>{language === 'kh' ? 'កែរឿងរ៉ាវស្នេហា' : 'Edit Story'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Multi-Chapter Editorial Narrative Reader */}
      <div className="space-y-8">
        {visibleChapters.map((chapter) => {
          const originalIdx = chapters.findIndex((c) => c.id === chapter.id);
          const reverseLayout = originalIdx % 2 === 1;
          const imageFailed = Boolean(failedImages[chapter.id]);
          const chapterNum = language === 'kh' ? chapter.chapterNumberKh : chapter.chapterNumberEn;
          const yearLabel = language === 'kh' ? chapter.yearLabelKh : chapter.yearLabelEn;
          const title = language === 'kh' ? chapter.titleKh : chapter.titleEn;
          const tradition = language === 'kh' ? chapter.traditionLabelKh : chapter.traditionLabelEn;
          const story = language === 'kh' ? chapter.storyKh : chapter.storyEn;
          const miniProverb = language === 'kh' ? chapter.proverbKh : chapter.proverbEn;

          return (
            <motion.article
              key={chapter.id}
              data-testid={`story-chapter-${chapter.id}`}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.5 }}
              className={`rounded-2xl border p-5 sm:p-7 transition-colors ${
                isLight
                  ? 'bg-[#fffdf8]/95 border-[#946212]/25 shadow-[0_12px_34px_rgba(115,19,37,0.06)]'
                  : 'bg-[#260a13]/85 border-amber-400/25 shadow-[0_14px_38px_rgba(0,0,0,0.45)]'
              }`}
            >
              <div
                className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-center ${
                  reverseLayout ? 'lg:[&>*:first-child]:order-2' : ''
                }`}
              >
                {/* Chapter Illustration */}
                <figure className="lg:col-span-5 space-y-2">
                  <div
                    className="relative aspect-[4/3] w-full rounded-xl overflow-hidden border"
                    style={{ borderColor: hairline }}
                  >
                    {!imageFailed && chapter.image ? (
                      <img
                        src={chapter.image}
                        alt={title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [chapter.id]: true }))
                        }
                        className="w-full h-full object-cover object-center"
                      />
                    ) : (
                      <div
                        className={`w-full h-full flex flex-col items-center justify-center p-6 text-center ${
                          isLight
                            ? 'bg-gradient-to-br from-[#f8ecd4] to-[#eed9b4]'
                            : 'bg-gradient-to-br from-[#3b0f1c] to-[#1a070d]'
                        }`}
                      >
                        <BookOpen className="w-8 h-8 mb-2" style={{ color: goldInk }} />
                        <span
                          className="text-xs font-khmer font-semibold"
                          style={{ color: headingInk }}
                        >
                          {title}
                        </span>
                      </div>
                    )}
                  </div>
                  <figcaption
                    className="text-[11px] leading-snug text-center lg:text-left"
                    style={{
                      color: mutedInk,
                      fontFamily:
                        language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
                    }}
                  >
                    {chapterNum} · {tradition}
                  </figcaption>
                </figure>

                {/* Chapter Narrative Column */}
                <div className="lg:col-span-7 text-left space-y-3">
                  {/* Unboxed Editorial Meta Line */}
                  <div
                    className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold tabular-nums"
                    style={{
                      color: goldInk,
                      fontFamily:
                        language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
                    }}
                  >
                    <span>{chapterNum}</span>
                    <span aria-hidden="true">·</span>
                    <span>{yearLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium">{tradition}</span>
                  </div>

                  <h3
                    className="text-lg sm:text-xl font-bold leading-[1.6]"
                    style={{
                      color: headingInk,
                      fontFamily:
                        language === 'kh' ? "'Moul', 'Noto Serif Khmer', serif" : "'Playfair Display', serif",
                    }}
                  >
                    {title}
                  </h3>

                  <p
                    className="text-sm sm:text-[15px] leading-[1.95] max-w-[65ch]"
                    style={{
                      color: bodyInk,
                      fontFamily:
                        language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
                    }}
                  >
                    {story}
                  </p>

                  {miniProverb && (
                    <p
                      className={`pt-2.5 border-t text-xs sm:text-[13px] leading-[1.75] ${
                        language === 'en' ? 'italic' : ''
                      }`}
                      style={{
                        borderColor: hairline,
                        color: goldInk,
                        fontFamily:
                          language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
                      }}
                    >
                      “{miniProverb}”
                    </p>
                  )}
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* 3. Cambodian Cultural Heritage Symbols Lexicon */}
      <div
        className="mt-9 pt-7 border-t"
        style={{ borderColor: hairline }}
      >
        <div className="text-center mb-5">
          <p
            className={`text-[11px] font-semibold mb-1 ${
              language === 'kh' ? 'tracking-normal' : 'uppercase tracking-[0.18em]'
            }`}
            style={{ color: goldInk }}
          >
            {language === 'kh'
              ? 'និមិត្តរូបមង្គលក្នុងវប្បធម៌ខ្មែរ'
              : 'Sacred Khmer Marriage Traditions'}
          </p>
          <h3
            className="text-base sm:text-lg font-bold"
            style={{
              color: headingInk,
              fontFamily:
                language === 'kh' ? "'Moul', 'Noto Serif Khmer', serif" : "'Playfair Display', serif",
            }}
          >
            {language === 'kh'
              ? 'អត្ថន័យនៃប្រពៃណីប្រសិទ្ធពរជ័យគូស្វាមីភរិយា'
              : 'Traditional Cambodian Blessings & Symbols'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          {KHMER_CULTURAL_SYMBOLS.map((sym) => (
            <div
              key={sym.id}
              className={`p-4 rounded-xl border space-y-1.5 ${
                isLight
                  ? 'bg-[#fffdf8]/85 border-[#946212]/22'
                  : 'bg-[#260a13]/70 border-amber-400/22'
              }`}
            >
              <div className="flex items-center gap-2">
                {renderSymbolIcon(sym.symbolKey)}
                <h4
                  className="text-xs sm:text-sm font-bold leading-snug"
                  style={{
                    color: headingInk,
                    fontFamily:
                      language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
                  }}
                >
                  {language === 'kh' ? sym.titleKh : sym.titleEn}
                </h4>
              </div>
              <p
                className="text-xs leading-[1.8]"
                style={{
                  color: bodyInk,
                  fontFamily:
                    language === 'kh' ? "'Noto Serif Khmer', serif" : "'Playfair Display', serif",
                }}
              >
                {language === 'kh' ? sym.meaningKh : sym.meaningEn}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
