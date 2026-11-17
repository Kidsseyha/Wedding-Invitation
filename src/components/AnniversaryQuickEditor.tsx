import React, { useState, useRef, useEffect, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  Sparkles,
  Upload,
  RotateCcw,
  Calendar,
  Clock,
  MapPin,
  Heart,
  BookOpen,
  ScrollText,
} from 'lucide-react';
import { AnniversaryStoryChapter, Language, WeddingEvent } from '../types';
import { ThemeMode } from './ThemeToggle';
import {
  AnniversaryCoverDraft,
  buildAnniversaryCoverDraft,
  applyAnniversaryCoverDraft,
  buildDefaultKhmerAnniversaryChapters,
  parseMilestoneYears,
  toKhmerDigits,
} from '../utils/anniversaryHelpers';
import { compressImageFile } from '../utils/imageCompressor';
import khmerAnnivStoryEmblem from '../assets/images/khmer_anniversary_story_emblem_1794794574209.jpg';

interface AnniversaryQuickEditorProps {
  isOpen: boolean;
  event: WeddingEvent;
  language: Language;
  theme: ThemeMode;
  initialTab?: 'cover' | 'chapters';
  onClose: () => void;
  onSave: (updatedEvent: WeddingEvent) => Promise<void> | void;
}

const TIME_PRESETS = ['04:30 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM'];

export default function AnniversaryQuickEditor({
  isOpen,
  event,
  language,
  theme,
  initialTab = 'cover',
  onClose,
  onSave,
}: AnniversaryQuickEditorProps) {
  const isLight = theme === 'light';
  const [activeTab, setActiveTab] = useState<'cover' | 'chapters'>(initialTab);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
  const [draft, setDraft] = useState<AnniversaryCoverDraft>(() =>
    buildAnniversaryCoverDraft(event)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chapterFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(buildAnniversaryCoverDraft(event));
      setActiveTab(initialTab);
      setSelectedChapterIdx(0);
    }
  }, [isOpen, initialTab, event]);

  if (!isOpen) return null;

  const updateDraft = <K extends keyof AnniversaryCoverDraft>(
    key: K,
    value: AnniversaryCoverDraft[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateChapterField = <K extends keyof AnniversaryStoryChapter>(
    index: number,
    field: K,
    value: AnniversaryStoryChapter[K]
  ) => {
    setDraft((prev) => ({
      ...prev,
      storyChapters: prev.storyChapters.map((ch, idx) =>
        idx === index ? { ...ch, [field]: value } : ch
      ),
    }));
  };

  const handleResetChaptersToKhmerDefault = () => {
    const years = parseMilestoneYears(draft.milestoneKh, draft.milestoneEn);
    const regenerated = buildDefaultKhmerAnniversaryChapters({
      groom: draft.groomKh,
      bride: draft.brideKh,
      groomEn: draft.groomEn,
      brideEn: draft.brideEn,
      storyStartYear: draft.storyStartYear,
      targetYearEn: draft.eventDate.slice(0, 4),
      milestoneYears: years,
    });
    updateDraft('storyChapters', regenerated);
  };

  const handleChapterPhotoUpload = async (files: FileList | null, chapterIndex: number) => {
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    try {
      const compressed = await compressImageFile(files[0], {
        maxWidth: 900,
        maxHeight: 720,
        quality: 0.78,
      });
      updateChapterField(chapterIndex, 'image', compressed);
    } catch (err) {
      console.warn('Could not compress chapter photo:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    try {
      const compressed = await compressImageFile(files[0], {
        maxWidth: 640,
        maxHeight: 640,
        quality: 0.72,
      });
      updateDraft('medallionImage', compressed);
    } catch (err) {
      console.warn('Could not compress medallion photo:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = applyAnniversaryCoverDraft(event, draft);
      await onSave(updated);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const labelClass = `block text-[11px] font-khmer font-semibold mb-1 ${
    isLight ? 'text-[#731325]' : 'text-amber-200'
  }`;

  const inputClass = `w-full px-3 py-2 rounded-lg text-xs border focus:outline-none focus-visible:ring-2 ${
    isLight
      ? 'bg-white text-[#2a1215] border-[#946212]/35 focus-visible:ring-amber-600'
      : 'bg-[#17050a] text-amber-50 border-amber-400/35 focus-visible:ring-amber-400'
  }`;

  const sectionClass = `p-3 rounded-xl border space-y-2.5 ${
    isLight
      ? 'bg-white/85 border-[#946212]/25'
      : 'bg-[#2a0c15]/70 border-amber-400/25'
  }`;

  return createPortal(
    <div
      id="anniversary-quick-editor-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={
        language === 'kh'
          ? 'កែសម្រួលព័ត៌មានធៀបខួបអាពាហ៍ពិពាហ៍'
          : 'Edit Anniversary Story Cover'
      }
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm text-left"
    >
      <div
        className={`relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
          isLight
            ? 'bg-[#fcf7eb] border-[#946212]/45 text-[#3d241c]'
            : 'bg-[#1a070d] border-[#f4cb5c]/45 text-[#fdf4e3]'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${
            isLight
              ? 'bg-[#f6ebd3] border-[#946212]/25'
              : 'bg-[#280b14] border-amber-400/25'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isLight ? 'bg-[#731325] text-amber-200' : 'bg-amber-400/15 text-amber-300'
              }`}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                className={`text-sm font-bold truncate ${
                  isLight ? 'text-[#731325]' : 'text-amber-200'
                }`}
                style={{ fontFamily: "'Noto Serif Khmer', serif" }}
              >
                {language === 'kh'
                  ? 'កែព័ត៌មានលើធៀបខួបអាពាហ៍ពិពាហ៍'
                  : 'Edit Anniversary Story Cover'}
              </h3>
              <p className="text-[11px] font-khmer opacity-80 truncate">
                {language === 'kh'
                  ? 'កែសម្រួលរាល់ព័ត៌មានលើទំព័រមុខ និងរក្សាទុកដោយផ្ទាល់'
                  : 'Customize milestone, couple names, story quote, schedule & venue'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={language === 'kh' ? 'បិទផ្ទាំងកែសម្រួល' : 'Close editor'}
            className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
              isLight
                ? 'border-[#946212]/25 hover:bg-white text-[#731325]'
                : 'border-amber-400/25 hover:bg-white/10 text-amber-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher: Cover & Details vs 4 Story Chapters */}
        <div
          className={`flex items-center gap-1 px-4 pt-2 border-b ${
            isLight
              ? 'bg-[#f6ebd3]/70 border-[#946212]/20'
              : 'bg-[#220911] border-amber-400/20'
          }`}
        >
          <button
            id="anniv-tab-cover-btn"
            type="button"
            onClick={() => setActiveTab('cover')}
            className={`px-3 py-2 text-xs font-khmer font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'cover'
                ? isLight
                  ? 'border-[#731325] text-[#731325]'
                  : 'border-[#f4cb5c] text-amber-200'
                : 'border-transparent opacity-65 hover:opacity-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{language === 'kh' ? 'ព័ត៌មានក្រប & ពេលវេលា' : 'Cover & Program'}</span>
          </button>
          <button
            id="anniv-tab-chapters-btn"
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={`px-3 py-2 text-xs font-khmer font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'chapters'
                ? isLight
                  ? 'border-[#731325] text-[#731325]'
                  : 'border-[#f4cb5c] text-amber-200'
                : 'border-transparent opacity-65 hover:opacity-100'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>
              {language === 'kh'
                ? `រឿងរ៉ាវស្នេហា (${toKhmerDigits(draft.storyChapters.length)} ជំពូក)`
                : `Story Chapters (${draft.storyChapters.length})`}
            </span>
          </button>
        </div>

        {/* Form Wrapper: Scrollable Body + Sticky Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {activeTab === 'cover' ? (
            <>
          {/* Section 1: Keepsake Medallion Photo & Cover Title */}
          <div className={sectionClass}>
            <div className="flex items-center gap-3">
              <img
                src={draft.medallionImage || khmerAnnivStoryEmblem}
                alt="Anniversary Medallion Preview"
                className="w-14 h-14 rounded-full object-cover border-2 border-amber-500/60 shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-1.5">
                <span className={labelClass}>
                  {language === 'kh'
                    ? 'រូបភាពមេដាយលើក្របធៀប (Keepsake Medallion)'
                    : 'Cover Keepsake Medallion Photo'}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-khmer font-semibold border flex items-center gap-1 cursor-pointer ${
                      isLight
                        ? 'bg-[#731325] text-amber-100 border-[#731325]'
                        : 'bg-amber-400/20 text-amber-200 border-amber-400/40'
                    }`}
                  >
                    <Upload className="w-3 h-3" />
                    <span>
                      {isUploadingPhoto
                        ? language === 'kh'
                          ? 'កំពុងផ្ទុក...'
                          : 'Uploading...'
                        : language === 'kh'
                        ? 'ប្តូររូបភាពគូ'
                        : 'Upload Photo'}
                    </span>
                  </button>
                  {draft.medallionImage && (
                    <button
                      type="button"
                      onClick={() => updateDraft('medallionImage', '')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-khmer border flex items-center gap-1 cursor-pointer ${
                        isLight
                          ? 'border-[#946212]/30 text-[#731325] hover:bg-amber-50'
                          : 'border-amber-400/30 text-amber-200 hover:bg-white/5'
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{language === 'kh' ? 'រូបចិញ្ចៀនដើម' : 'Default Emblem'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="anniv-edit-title-kh" className={labelClass}>
                  {language === 'kh' ? 'ចំណងជើងធំ (ខ្មែរ - ពិធីខួបអាពាហ៍ពិពាហ៍)' : 'Cover Main Title (Khmer)'}
                </label>
                <input
                  id="anniv-edit-title-kh"
                  type="text"
                  value={draft.coverTitleKh}
                  onChange={(e) => updateDraft('coverTitleKh', e.target.value)}
                  placeholder="ឧ. ពិធីខួបអាពាហ៍ពិពាហ៍"
                  className={`${inputClass} font-khmer`}
                />
              </div>
              <div>
                <label htmlFor="anniv-edit-title-en" className={labelClass}>
                  {language === 'kh' ? 'អត្ថបទខាងក្រោម (English / Subtitle below title)' : 'Cover Subtitle / English'}
                </label>
                <input
                  id="anniv-edit-title-en"
                  type="text"
                  value={draft.coverTitleEn}
                  onChange={(e) => updateDraft('coverTitleEn', e.target.value)}
                  placeholder="Wedding Anniversary Story"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Anniversary Milestone & Story Arc Year */}
          <div className={sectionClass}>
            <div className="flex items-center gap-1.5 text-xs font-khmer font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {language === 'kh'
                  ? 'គម្រប់ខួប និងឆ្នាំចាប់ផ្តើមរឿងរ៉ាវស្នេហា (Milestone & Story Span)'
                  : 'Anniversary Milestone & Story Years'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="anniv-edit-milestone-kh" className={labelClass}>
                  {language === 'kh' ? 'គម្រប់ខួប (ខ្មែរ)' : 'Milestone (Khmer)'}
                </label>
                <input
                  id="anniv-edit-milestone-kh"
                  type="text"
                  value={draft.milestoneKh}
                  onChange={(e) => updateDraft('milestoneKh', e.target.value)}
                  placeholder="ឧ. ៥០ ឬ ២៥"
                  className={`${inputClass} font-khmer`}
                />
              </div>
              <div>
                <label htmlFor="anniv-edit-milestone-en" className={labelClass}>
                  {language === 'kh' ? 'គម្រប់ខួប (English)' : 'Milestone (English)'}
                </label>
                <input
                  id="anniv-edit-milestone-en"
                  type="text"
                  value={draft.milestoneEn}
                  onChange={(e) => updateDraft('milestoneEn', e.target.value)}
                  placeholder="e.g. 50th or 25th"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="anniv-edit-start-year" className={labelClass}>
                  {language === 'kh' ? 'ឆ្នាំចាប់ផ្តើម (Est. Year)' : 'Start Year (Est.)'}
                </label>
                <input
                  id="anniv-edit-start-year"
                  type="text"
                  value={draft.storyStartYear}
                  onChange={(e) => updateDraft('storyStartYear', e.target.value)}
                  placeholder="1976"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Couple Names */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-khmer font-bold">
                <Heart className="w-3.5 h-3.5 text-rose-500" />
                <span>
                  {language === 'kh' ? 'ឈ្មោះគូស្វាមីភរិយា (Couple Names)' : 'Couple Names'}
                </span>
              </span>
              <label className="flex items-center gap-1.5 text-[11px] font-khmer cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.singlePerson}
                  onChange={(e) => updateDraft('singlePerson', e.target.checked)}
                  className="accent-amber-500"
                />
                <span>{language === 'kh' ? 'ម្ចាស់កម្មវិធីតែម្នាក់' : 'Single host'}</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="anniv-edit-groom-kh" className={labelClass}>
                  {language === 'kh' ? 'ឈ្មោះស្វាមី (ខ្មែរ)' : 'Husband Name (Khmer)'}
                </label>
                <input
                  id="anniv-edit-groom-kh"
                  type="text"
                  value={draft.groomKh}
                  onChange={(e) => updateDraft('groomKh', e.target.value)}
                  className={`${inputClass} font-khmer`}
                />
              </div>
              <div>
                <label htmlFor="anniv-edit-groom-en" className={labelClass}>
                  {language === 'kh' ? 'ឈ្មោះស្វាមី (English)' : 'Husband Name (English)'}
                </label>
                <input
                  id="anniv-edit-groom-en"
                  type="text"
                  value={draft.groomEn}
                  onChange={(e) => updateDraft('groomEn', e.target.value)}
                  className={inputClass}
                />
              </div>
              {!draft.singlePerson && (
                <>
                  <div>
                    <label htmlFor="anniv-edit-bride-kh" className={labelClass}>
                      {language === 'kh' ? 'ឈ្មោះភរិយា (ខ្មែរ)' : 'Wife Name (Khmer)'}
                    </label>
                    <input
                      id="anniv-edit-bride-kh"
                      type="text"
                      value={draft.brideKh}
                      onChange={(e) => updateDraft('brideKh', e.target.value)}
                      className={`${inputClass} font-khmer`}
                    />
                  </div>
                  <div>
                    <label htmlFor="anniv-edit-bride-en" className={labelClass}>
                      {language === 'kh' ? 'ឈ្មោះភរិយា (English)' : 'Wife Name (English)'}
                    </label>
                    <input
                      id="anniv-edit-bride-en"
                      type="text"
                      value={draft.brideEn}
                      onChange={(e) => updateDraft('brideEn', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 4: Story Excerpt / Love Message */}
          <div className={sectionClass}>
            <div>
              <label htmlFor="anniv-edit-story-kh" className={labelClass}>
                {language === 'kh'
                  ? 'ខ្លឹមសាររឿងរ៉ាវស្នេហា (Story Quote - Khmer)'
                  : 'Love Story Excerpt (Khmer)'}
              </label>
              <textarea
                id="anniv-edit-story-kh"
                rows={2}
                value={draft.storyMessageKh}
                onChange={(e) => updateDraft('storyMessageKh', e.target.value)}
                placeholder="វត្តមានរបស់លោកអ្នក គឺជាកិត្តិយសដ៏ធំធេង..."
                className={`${inputClass} font-khmer`}
              />
            </div>
            <div>
              <label htmlFor="anniv-edit-story-en" className={labelClass}>
                {language === 'kh'
                  ? 'ខ្លឹមសាររឿងរ៉ាវស្នេហា (Story Quote - English)'
                  : 'Love Story Excerpt (English)'}
              </label>
              <textarea
                id="anniv-edit-story-en"
                rows={2}
                value={draft.storyMessageEn}
                onChange={(e) => updateDraft('storyMessageEn', e.target.value)}
                placeholder="Your presence will make our anniversary celebration truly memorable."
                className={inputClass}
              />
            </div>
          </div>

          {/* Section 5: Date, Time & Venue */}
          <div className={sectionClass}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="anniv-edit-date" className={labelClass}>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{language === 'kh' ? 'កាលបរិច្ឆេទ (Event Date)' : 'Event Date'}</span>
                  </span>
                </label>
                <input
                  id="anniv-edit-date"
                  type="date"
                  value={draft.eventDate}
                  onChange={(e) => updateDraft('eventDate', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="anniv-edit-time" className={labelClass}>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{language === 'kh' ? 'ម៉ោងប្រារព្ធពិធី (Time)' : 'Event Time'}</span>
                  </span>
                </label>
                <input
                  id="anniv-edit-time"
                  type="text"
                  value={draft.eventTime}
                  onChange={(e) => updateDraft('eventTime', e.target.value)}
                  placeholder="06:00 PM"
                  className={inputClass}
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {TIME_PRESETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updateDraft('eventTime', t)}
                      className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer ${
                        draft.eventTime === t
                          ? 'bg-amber-500 text-black border-amber-500 font-bold'
                          : isLight
                          ? 'border-[#946212]/25 text-[#731325]'
                          : 'border-amber-400/25 text-amber-200/80'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="anniv-edit-location-kh" className={labelClass}>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{language === 'kh' ? 'ទីតាំងកម្មវិធី (ខ្មែរ)' : 'Venue (Khmer)'}</span>
                  </span>
                </label>
                <input
                  id="anniv-edit-location-kh"
                  type="text"
                  value={draft.locationKh}
                  onChange={(e) => updateDraft('locationKh', e.target.value)}
                  className={`${inputClass} font-khmer`}
                />
              </div>
              <div>
                <label htmlFor="anniv-edit-location-en" className={labelClass}>
                  {language === 'kh' ? 'ទីតាំងកម្មវិធី (English)' : 'Venue (English)'}
                </label>
                <input
                  id="anniv-edit-location-en"
                  type="text"
                  value={draft.locationEn}
                  onChange={(e) => updateDraft('locationEn', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="anniv-edit-map-url" className={labelClass}>
                {language === 'kh' ? 'តំណភ្ជាប់ Google Maps (Map URL)' : 'Google Maps URL'}
              </label>
              <input
                id="anniv-edit-map-url"
                type="url"
                value={draft.mapUrl}
                onChange={(e) => updateDraft('mapUrl', e.target.value)}
                placeholder="https://maps.google.com/..."
                className={inputClass}
              />
            </div>
          </div>

          {/* Section 6: Honored Guest Greeting Label */}
          <div className={sectionClass}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="anniv-edit-ribbon-kh" className={labelClass}>
                  {language === 'kh'
                    ? 'ពាក្យគោរពអញ្ជើញភ្ញៀវ (ខ្មែរ)'
                    : 'Guest Greeting Label (Khmer)'}
                </label>
                <input
                  id="anniv-edit-ribbon-kh"
                  type="text"
                  value={draft.ribbonLabelKh}
                  onChange={(e) => updateDraft('ribbonLabelKh', e.target.value)}
                  placeholder="សូមគោរពអញ្ជើញចូលរួមអបអរសាទរ"
                  className={`${inputClass} font-khmer`}
                />
              </div>
              <div>
                <label htmlFor="anniv-edit-ribbon-en" className={labelClass}>
                  {language === 'kh'
                    ? 'ពាក្យគោរពអញ្ជើញភ្ញៀវ (English)'
                    : 'Guest Greeting Label (English)'}
                </label>
                <input
                  id="anniv-edit-ribbon-en"
                  type="text"
                  value={draft.ribbonLabelEn}
                  onChange={(e) => updateDraft('ribbonLabelEn', e.target.value)}
                  placeholder="Cordially Invited to Celebrate With Us"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
            </>
          ) : (
            <>
              {/* Story Proverb Editor */}
              <div className={sectionClass}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-khmer font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>
                      {language === 'kh'
                        ? 'ពាក្យសច្ចា និងសុភាសិតស្នេហាខ្មែរ (Khmer Proverb Quote)'
                        : 'Khmer Proverb & Blessing Quote'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleResetChaptersToKhmerDefault}
                    className={`px-2 py-1 rounded-lg text-[10.5px] font-khmer border flex items-center gap-1 cursor-pointer ${
                      isLight
                        ? 'border-[#946212]/30 text-[#731325] hover:bg-amber-50'
                        : 'border-amber-400/30 text-amber-200 hover:bg-white/5'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{language === 'kh' ? 'បង្កើតតាមឈ្មោះគូថ្មី' : 'Regenerate Defaults'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label htmlFor="anniv-edit-proverb-kh" className={labelClass}>
                      {language === 'kh' ? 'សុភាសិត / ពាក្យជូនពរ (ខ្មែរ)' : 'Proverb (Khmer)'}
                    </label>
                    <input
                      id="anniv-edit-proverb-kh"
                      type="text"
                      value={draft.proverbKh}
                      onChange={(e) => updateDraft('proverbKh', e.target.value)}
                      className={`${inputClass} font-khmer`}
                    />
                  </div>
                  <div>
                    <label htmlFor="anniv-edit-proverb-en" className={labelClass}>
                      {language === 'kh' ? 'សុភាសិត / ពាក្យជូនពរ (English)' : 'Proverb (English)'}
                    </label>
                    <input
                      id="anniv-edit-proverb-en"
                      type="text"
                      value={draft.proverbEn}
                      onChange={(e) => updateDraft('proverbEn', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Chapter Selector Pills + Active Chapter Form */}
              <div className={sectionClass}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {draft.storyChapters.map((ch, idx) => (
                    <button
                      key={ch.id}
                      id={`anniv-select-chapter-${idx + 1}-btn`}
                      type="button"
                      onClick={() => setSelectedChapterIdx(idx)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-khmer font-bold border transition-colors cursor-pointer ${
                        selectedChapterIdx === idx
                          ? isLight
                            ? 'bg-[#731325] text-amber-100 border-[#731325]'
                            : 'bg-amber-400/25 text-amber-100 border-amber-400'
                          : isLight
                          ? 'bg-white text-[#731325] border-[#946212]/25'
                          : 'bg-[#17050a] text-amber-200/80 border-amber-400/20'
                      }`}
                    >
                      {language === 'kh'
                        ? `ជំពូក ${toKhmerDigits(idx + 1)}`
                        : `Chapter ${idx + 1}`}
                    </button>
                  ))}
                </div>

                {draft.storyChapters[selectedChapterIdx] && (() => {
                  const ch = draft.storyChapters[selectedChapterIdx];
                  return (
                    <div className="space-y-2.5 pt-2 border-t border-amber-500/20">
                      {/* Chapter Image & Upload */}
                      <div className="flex items-center gap-3">
                        <img
                          src={ch.image}
                          alt={ch.titleKh}
                          className="w-20 h-15 rounded-lg object-cover border border-amber-500/40 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <span className={labelClass}>
                            {language === 'kh'
                              ? `រូបភាពប្រចាំ${ch.chapterNumberKh}`
                              : `${ch.chapterNumberEn} Artwork`}
                          </span>
                          <input
                            ref={chapterFileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleChapterPhotoUpload(e.target.files, selectedChapterIdx)}
                          />
                          <button
                            type="button"
                            onClick={() => chapterFileInputRef.current?.click()}
                            disabled={isUploadingPhoto}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-khmer font-semibold border inline-flex items-center gap-1 cursor-pointer ${
                              isLight
                                ? 'bg-[#731325] text-amber-100 border-[#731325]'
                                : 'bg-amber-400/20 text-amber-200 border-amber-400/40'
                            }`}
                          >
                            <Upload className="w-3 h-3" />
                            <span>
                              {language === 'kh' ? 'ប្តូររូបភាពជំពូក' : 'Replace Image'}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="anniv-ch-year-kh" className={labelClass}>
                            {language === 'kh' ? 'ឆ្នាំ / កាលបរិច្ឆេទ (ខ្មែរ)' : 'Year Label (Khmer)'}
                          </label>
                          <input
                            id="anniv-ch-year-kh"
                            type="text"
                            value={ch.yearLabelKh}
                            onChange={(e) =>
                              updateChapterField(selectedChapterIdx, 'yearLabelKh', e.target.value)
                            }
                            className={`${inputClass} font-khmer`}
                          />
                        </div>
                        <div>
                          <label htmlFor="anniv-ch-year-en" className={labelClass}>
                            {language === 'kh' ? 'ឆ្នាំ / កាលបរិច្ឆេទ (English)' : 'Year Label (English)'}
                          </label>
                          <input
                            id="anniv-ch-year-en"
                            type="text"
                            value={ch.yearLabelEn}
                            onChange={(e) =>
                              updateChapterField(selectedChapterIdx, 'yearLabelEn', e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="anniv-ch-title-kh" className={labelClass}>
                            {language === 'kh' ? 'ចំណងជើងជំពូក (ខ្មែរ)' : 'Chapter Title (Khmer)'}
                          </label>
                          <input
                            id="anniv-ch-title-kh"
                            type="text"
                            value={ch.titleKh}
                            onChange={(e) =>
                              updateChapterField(selectedChapterIdx, 'titleKh', e.target.value)
                            }
                            className={`${inputClass} font-khmer`}
                          />
                        </div>
                        <div>
                          <label htmlFor="anniv-ch-title-en" className={labelClass}>
                            {language === 'kh' ? 'ចំណងជើងជំពូក (English)' : 'Chapter Title (English)'}
                          </label>
                          <input
                            id="anniv-ch-title-en"
                            type="text"
                            value={ch.titleEn}
                            onChange={(e) =>
                              updateChapterField(selectedChapterIdx, 'titleEn', e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="anniv-ch-tradition-kh" className={labelClass}>
                            {language === 'kh' ? 'ប្រពៃណី / និមិត្តសញ្ញា (ខ្មែរ)' : 'Cultural Tag (Khmer)'}
                          </label>
                          <input
                            id="anniv-ch-tradition-kh"
                            type="text"
                            value={ch.traditionLabelKh}
                            onChange={(e) =>
                              updateChapterField(selectedChapterIdx, 'traditionLabelKh', e.target.value)
                            }
                            className={`${inputClass} font-khmer`}
                          />
                        </div>
                        <div>
                          <label htmlFor="anniv-ch-tradition-en" className={labelClass}>
                            {language === 'kh' ? 'ប្រពៃណី / និមិត្តសញ្ញា (English)' : 'Cultural Tag (English)'}
                          </label>
                          <input
                            id="anniv-ch-tradition-en"
                            type="text"
                            value={ch.traditionLabelEn}
                            onChange={(e) =>
                              updateChapterField(selectedChapterIdx, 'traditionLabelEn', e.target.value)
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="anniv-ch-story-kh" className={labelClass}>
                          {language === 'kh' ? 'សាច់រឿងប្រពៃណីខ្មែរ (ខ្មែរ)' : 'Story Narrative (Khmer)'}
                        </label>
                        <textarea
                          id="anniv-ch-story-kh"
                          rows={3}
                          value={ch.storyKh}
                          onChange={(e) =>
                            updateChapterField(selectedChapterIdx, 'storyKh', e.target.value)
                          }
                          className={`${inputClass} font-khmer leading-relaxed`}
                        />
                      </div>

                      <div>
                        <label htmlFor="anniv-ch-story-en" className={labelClass}>
                          {language === 'kh' ? 'សាច់រឿងប្រពៃណីខ្មែរ (English)' : 'Story Narrative (English)'}
                        </label>
                        <textarea
                          id="anniv-ch-story-en"
                          rows={3}
                          value={ch.storyEn}
                          onChange={(e) =>
                            updateChapterField(selectedChapterIdx, 'storyEn', e.target.value)
                          }
                          className={`${inputClass} leading-relaxed`}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          </div>

          {/* Pinned Footer Save Bar */}
          <div
            className={`shrink-0 px-4 py-3 border-t flex items-center justify-end gap-2 ${
              isLight
                ? 'bg-[#f6ebd3] border-[#946212]/25'
                : 'bg-[#280b14] border-amber-400/25'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-khmer font-semibold border cursor-pointer ${
                isLight
                  ? 'bg-white border-[#946212]/30 text-[#731325]'
                  : 'bg-[#2a0c15] border-amber-400/30 text-amber-200'
              }`}
            >
              {language === 'kh' ? 'បោះបង់' : 'Cancel'}
            </button>
            <button
              id="save-anniversary-quick-edit-btn"
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl text-xs font-khmer font-bold bg-gradient-to-r from-[#7c1428] via-[#991b33] to-[#681021] text-amber-100 border border-[#e8bf54]/80 shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {isSaving
                  ? language === 'kh'
                    ? 'កំពុងរក្សាទុក...'
                    : 'Saving...'
                  : language === 'kh'
                  ? 'រក្សាទុកព័ត៌មាន'
                  : 'Save Changes'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
