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

  // Detect event type and ID (respect explicit valid eventType first)
  const eventId = (rawEvent.id || '').toLowerCase();
  const templateIdLower = (rawEvent.templateId || '').toLowerCase();
  const rawEventType = ((rawEvent.eventType || '') as string).toLowerCase().trim();
  const explicitValidTypes = ['wedding', 'engagement', 'housewarming', 'birthday', 'anniversary'] as const;

  let resolvedType: 'wedding' | 'engagement' | 'housewarming' | 'birthday' | 'anniversary';
  if ((explicitValidTypes as readonly string[]).includes(rawEventType)) {
    resolvedType = rawEventType as typeof resolvedType;
  } else {
    const isAnniversary =
      eventId.includes('anniversary') ||
      templateIdLower.includes('anniversary') ||
      (rawEvent.name && (rawEvent.name.includes('ខួបអាពាហ៍ពិពាហ៍') || rawEvent.name.toLowerCase().includes('anniversary')));
    const isBirthday =
      !isAnniversary &&
      (eventId.includes('birthday') ||
        templateIdLower.includes('birthday') ||
        (rawEvent.name && (rawEvent.name.includes('ខួបកំណើត') || rawEvent.name.toLowerCase().includes('birthday'))));
    const isHousewarming =
      eventId.includes('housewarming') ||
      templateIdLower.includes('housewarming') ||
      (rawEvent.name && (rawEvent.name.includes('ឡើងគេហដ្ឋាន') || rawEvent.name.includes('ឡើងផ្ទះ') || rawEvent.name.toLowerCase().includes('housewarming')));
    const isEngagement =
      eventId.includes('engagement') ||
      templateIdLower.includes('engagement') ||
      (rawEvent.name && (rawEvent.name.includes('ភ្ជាប់ពាក្យ') || rawEvent.name.toLowerCase().includes('engagement')));

    resolvedType = isAnniversary
      ? 'anniversary'
      : isBirthday
      ? 'birthday'
      : isHousewarming
      ? 'housewarming'
      : isEngagement
      ? 'engagement'
      : 'wedding';
  }

  const nameLower = String(rawEvent.name || '').toLowerCase();
  const isModernWedding =
    resolvedType === 'wedding' &&
    (eventId.includes('modern') ||
      templateIdLower.includes('modern') ||
      nameLower.includes('modern') ||
      String(rawEvent.name || '').includes('សម័យ'));

  // Ensure category-appropriate cover image
  const defaultCategoryCover = getCategoryCoverImage(isModernWedding ? 'preset-modern-wedding' : resolvedType);
  let sanitizedImage = rawEvent.image;
  const sanitizedImageTrimmed = typeof sanitizedImage === 'string' ? sanitizedImage.trim().toLowerCase() : '';

  if (
    !sanitizedImage ||
    typeof sanitizedImage !== 'string' ||
    !sanitizedImageTrimmed ||
    sanitizedImageTrimmed === 'none' ||
    sanitizedImageTrimmed === 'null' ||
    sanitizedImageTrimmed === 'undefined' ||
    sanitizedImage.includes('pixabay.com')
  ) {
    sanitizedImage = defaultCategoryCover;
  } else if (sanitizedImage.includes('focuz-staging-space.sgp1.digitaloceanspaces.com') && !sanitizedImage.includes('.cdn.')) {
    sanitizedImage = sanitizedImage.replace('focuz-staging-space.sgp1.digitaloceanspaces.com', 'focuz-staging-space.sgp1.cdn.digitaloceanspaces.com');
  }

  const isTradWeddingDefaultCover = (val: unknown): boolean => {
    if (!val || typeof val !== 'string') return false;
    return (
      val.includes('491657278_9322919307805207_5998846575526453583_n.jpg') ||
      val.includes('white_arch_columns_wedding_cover') ||
      val.includes('khmer_royal_gold_wedding_cover')
    );
  };

  // Prevent traditional wedding couple/arch cover photo from leaking into non-wedding or modern wedding templates
  if ((resolvedType !== 'wedding' || isModernWedding) && isTradWeddingDefaultCover(sanitizedImage)) {
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

  const modernPreset = isModernWedding ? findTemplatePreset('preset-modern-wedding')?.sampleEvent : undefined;
  const sanitizedCoverBg =
    resolvedType === 'anniversary' &&
    (!cleanEvent.config?.cover_background || String(cleanEvent.config.cover_background).includes('unsplash.com'))
      ? '/assets/images/khmer_anniversary_silk_bg_1794794578031.jpg'
      : isModernWedding && isTradWeddingDefaultCover(cleanEvent.config?.cover_background)
      ? modernPreset?.config?.cover_background
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
      : isModernWedding && isTradWeddingDefaultCover(cleanEvent.config?.details_background)
      ? modernPreset?.config?.details_background
      : cleanEvent.config?.details_background;

  const anniversaryPreset = resolvedType === 'anniversary' ? findTemplatePreset('anniversary')?.sampleEvent : undefined;
  const resolvedAnnivChapters =
    resolvedType === 'anniversary' &&
    (!Array.isArray(cleanEvent.config?.anniversary_story_chapters) || cleanEvent.config.anniversary_story_chapters.length === 0)
      ? anniversaryPreset?.config?.anniversary_story_chapters
      : cleanEvent.config?.anniversary_story_chapters;

  const normalizedCoverImage =
    cleanEvent.cover_image && ((resolvedType !== 'wedding' || isModernWedding) && isTradWeddingDefaultCover(cleanEvent.cover_image))
      ? sanitizedImage
      : cleanEvent.cover_image && cleanEvent.image && cleanEvent.cover_image !== cleanEvent.image
      ? sanitizedImage
      : cleanEvent.cover_image;

  return {
    ...cleanEvent,
    eventType: resolvedType,
    image: sanitizedImage,
    ...(normalizedCoverImage ? { cover_image: normalizedCoverImage } : {}),
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
