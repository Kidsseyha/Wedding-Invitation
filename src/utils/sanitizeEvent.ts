import { WeddingEvent } from '../types';
import { WEDDING_EVENT } from '../data/weddingData';
import { VERIFIED_CATEGORY_COVERS, getCategoryCoverImage, findTemplatePreset } from '../data/eventTemplates';

export const VERIFIED_WEDDING_COVER = '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg';
export const VERIFIED_AUDIO = 'https://focuz-staging-space.sgp1.cdn.digitaloceanspaces.com/plan-essential/template/audio/audio-2.mp3';

/**
 * Validates and sanitizes event data to resolve mismatched resources,
 * corrupted cross-template attributes (e.g., birthday or housewarming with wedding couple photos),
 * and broken media links.
 */
export function sanitizeWeddingEvent(rawEvent: any): WeddingEvent {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return WEDDING_EVENT;
  }

  // Detect event type and ID
  const eventId = (rawEvent.id || '').toLowerCase();
  const rawEventType = ((rawEvent.eventType || '') as string).toLowerCase();

  const isBirthday = rawEventType === 'birthday' || eventId.includes('birthday') || (rawEvent.name && (rawEvent.name.includes('ខួបកំណើត') || rawEvent.name.toLowerCase().includes('birthday')));
  const isHousewarming = rawEventType === 'housewarming' || eventId.includes('housewarming') || (rawEvent.name && (rawEvent.name.includes('ឡើងគេហដ្ឋាន') || rawEvent.name.includes('ឡើងផ្ទះ') || rawEvent.name.toLowerCase().includes('housewarming')));
  const isEngagement = rawEventType === 'engagement' || eventId.includes('engagement') || (rawEvent.name && (rawEvent.name.includes('ភ្ជាប់ពាក្យ') || rawEvent.name.toLowerCase().includes('engagement')));
  const isAnniversary = rawEventType === 'anniversary' || eventId.includes('anniversary') || (rawEvent.name && (rawEvent.name.includes('ខួបអាពាហ៍ពិពាហ៍') || rawEvent.name.toLowerCase().includes('anniversary')));

  const resolvedType = isBirthday ? 'birthday' : isHousewarming ? 'housewarming' : isEngagement ? 'engagement' : isAnniversary ? 'anniversary' : 'wedding';

  // Ensure category-appropriate cover image
  const defaultCategoryCover = getCategoryCoverImage(resolvedType);
  let sanitizedImage = rawEvent.image;

  if (!sanitizedImage || typeof sanitizedImage !== 'string' || sanitizedImage.includes('pixabay.com')) {
    sanitizedImage = defaultCategoryCover;
  } else if (sanitizedImage.includes('focuz-staging-space.sgp1.digitaloceanspaces.com') && !sanitizedImage.includes('.cdn.')) {
    sanitizedImage = sanitizedImage.replace('focuz-staging-space.sgp1.digitaloceanspaces.com', 'focuz-staging-space.sgp1.cdn.digitaloceanspaces.com');
  }

  // Prevent wedding couple cover photo or legacy Unsplash cover from leaking into non-wedding templates
  if (
    resolvedType !== 'wedding' &&
    (sanitizedImage.includes('491657278_9322919307805207_5998846575526453583_n.jpg') ||
      sanitizedImage.includes('white_arch_columns_wedding_cover') ||
      sanitizedImage.includes('khmer_royal_gold_wedding_cover'))
  ) {
    sanitizedImage = defaultCategoryCover;
  }

  if (resolvedType === 'anniversary' && sanitizedImage.includes('unsplash.com')) {
    sanitizedImage = defaultCategoryCover;
  }

  // Ensure music URL is working (replace any broken Pixabay links)
  let backgroundMusic = rawEvent.config?.background_music;
  if (!backgroundMusic || backgroundMusic.includes('pixabay.com')) {
    backgroundMusic = VERIFIED_AUDIO;
  }

  // Clean out any conflicting legacy keys
  const { groom_name, bride_name, title, ...cleanEvent } = rawEvent;

  // Clean config gallery if contaminated with wrong category photos
  let photoGallary = cleanEvent.config?.photo_gallary;
  if (resolvedType === 'birthday') {
    const preset = findTemplatePreset('birthday');
    if (preset && (!photoGallary?.photo1 || photoGallary.photo1.includes('9318228111607660') || photoGallary.photo1.includes('491657278'))) {
      photoGallary = preset.sampleEvent.config.photo_gallary;
    }
  } else if (resolvedType === 'housewarming') {
    const preset = findTemplatePreset('housewarming');
    if (preset && (!photoGallary?.photo1 || photoGallary.photo1.includes('9318228111607660') || photoGallary.photo1.includes('491657278'))) {
      photoGallary = preset.sampleEvent.config.photo_gallary;
    }
  } else if (resolvedType === 'engagement') {
    const preset = findTemplatePreset('engagement');
    if (preset && (!photoGallary?.photo1 || photoGallary.photo1.includes('9318228111607660') || photoGallary.photo1.includes('491657278'))) {
      photoGallary = preset.sampleEvent.config.photo_gallary;
    }
  } else if (resolvedType === 'anniversary') {
    const preset = findTemplatePreset('anniversary');
    if (
      preset &&
      (!photoGallary?.photo1 ||
        photoGallary.photo1.includes('unsplash.com') ||
        photoGallary.photo1.includes('9318228111607660') ||
        photoGallary.photo1.includes('491657278'))
    ) {
      photoGallary = preset.sampleEvent.config.photo_gallary;
    }
  }

  const sanitizedCoverBg =
    resolvedType === 'anniversary' &&
    (!cleanEvent.config?.cover_background || String(cleanEvent.config.cover_background).includes('unsplash.com'))
      ? '/assets/images/khmer_anniversary_silk_bg_1794794578031.jpg'
      : cleanEvent.config?.cover_background;

  const sanitizedMainBg =
    resolvedType === 'anniversary' &&
    (!cleanEvent.config?.main_background || String(cleanEvent.config.main_background).includes('unsplash.com'))
      ? '/assets/images/khmer_anniversary_silk_bg_1794794578031.jpg'
      : cleanEvent.config?.main_background;

  const sanitizedDetailsBg =
    resolvedType === 'anniversary' &&
    (!cleanEvent.config?.details_background || String(cleanEvent.config.details_background).includes('unsplash.com'))
      ? '/assets/images/khmer_anniversary_silk_bg_1794794578031.jpg'
      : cleanEvent.config?.details_background;

  const anniversaryPreset = resolvedType === 'anniversary' ? findTemplatePreset('anniversary')?.sampleEvent : undefined;
  const resolvedAnnivChapters =
    resolvedType === 'anniversary' &&
    (!Array.isArray(cleanEvent.config?.anniversary_story_chapters) || cleanEvent.config.anniversary_story_chapters.length === 0)
      ? anniversaryPreset?.config?.anniversary_story_chapters
      : cleanEvent.config?.anniversary_story_chapters;

  return {
    ...cleanEvent,
    eventType: resolvedType,
    image: sanitizedImage,
    config: {
      ...(cleanEvent.config || {}),
      image: sanitizedImage,
      cover_background: sanitizedCoverBg,
      main_background: sanitizedMainBg,
      details_background: sanitizedDetailsBg,
      ...(resolvedType === 'anniversary' && anniversaryPreset
        ? {
            anniversary_milestone: cleanEvent.config?.anniversary_milestone || cleanEvent.anniversary_milestone || anniversaryPreset.config.anniversary_milestone,
            anniversary_milestone_en: cleanEvent.config?.anniversary_milestone_en || cleanEvent.anniversary_milestone_en || anniversaryPreset.config.anniversary_milestone_en,
            story_start_year: cleanEvent.config?.story_start_year || anniversaryPreset.config.story_start_year,
            anniversary_proverb_kh: cleanEvent.config?.anniversary_proverb_kh || anniversaryPreset.config.anniversary_proverb_kh,
            anniversary_proverb_en: cleanEvent.config?.anniversary_proverb_en || anniversaryPreset.config.anniversary_proverb_en,
            anniversary_story_chapters: resolvedAnnivChapters,
            cover_subtitle_kh: cleanEvent.config?.cover_subtitle_kh && cleanEvent.config.cover_subtitle_kh !== 'សូមអញ្ជើញចូលរួមអបអរសាទរ'
              ? cleanEvent.config.cover_subtitle_kh
              : anniversaryPreset.config.cover_subtitle_kh,
            cover_subtitle_en: cleanEvent.config?.cover_subtitle_en && cleanEvent.config.cover_subtitle_en !== 'PLEASE JOIN US TO CELEBRATE THE'
              ? cleanEvent.config.cover_subtitle_en
              : anniversaryPreset.config.cover_subtitle_en,
          }
        : {}),
      photo_gallary: photoGallary || cleanEvent.config?.photo_gallary,
      background_music: backgroundMusic,
      portrait_shape: cleanEvent.config?.portrait_shape || 'circle',
    },
  } as WeddingEvent;
}
