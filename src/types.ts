export type Language = 'kh' | 'en';

export interface TimelineItem {
  id: string;
  time: string;
  name: string;
  nameEn?: string;
  description?: string;
  descriptionEn?: string;
  icon?: string;
}

export interface Shift {
  id: string;
  name: string;
  nameEn?: string;
  date: string;
  timeLine: TimelineItem[];
}

export interface Schedule {
  id: string;
  eventId: string;
  shifts: Shift[];
}

export interface InvitationContent {
  location: string;
  subtitle: string;
  date_time: string;
  main_title: string;
  details_title: string;
  invitation_title: string;
  invitation_message: string;
  gratitude_title?: string;
  gratitude_message?: string;
  groom?: string;
  bride?: string;
}

export interface BankInfo {
  accountName: string;
  accountNumber: string;
  bankName: string;
  usdQr?: string;
  khrQr?: string;
}

export interface AnniversaryStoryChapter {
  id: string;
  chapterNumberKh: string;
  chapterNumberEn: string;
  yearLabelKh: string;
  yearLabelEn: string;
  titleKh: string;
  titleEn: string;
  traditionLabelKh: string;
  traditionLabelEn: string;
  storyKh: string;
  storyEn: string;
  proverbKh?: string;
  proverbEn?: string;
  image: string;
}

export interface TemplateConfig {
  map_url: string;
  primaryColor: string;
  textColor: string;
  envelope_theme_color?: string;
  guestNameColor: string;
  guest_name_font_family?: string;
  guest_name_font_size?: string;
  main_background: string;
  hide_main_background?: boolean;
  cover_background: string;
  hide_cover_background?: boolean;
  cover_subtitle_kh?: string;
  cover_subtitle_en?: string;
  anniversary_milestone?: string;
  anniversary_milestone_en?: string;
  story_start_year?: string;
  anniversary_proverb_kh?: string;
  anniversary_proverb_en?: string;
  anniversary_story_chapters?: AnniversaryStoryChapter[];
  cover_en_name_color?: string;
  cover_en_font_family?: string;
  cover_monogram_groom?: string;
  cover_monogram_bride?: string;
  cover_monogram_font_family?: string;
  cover_monogram_color?: string;
  cover_monogram_font_size?: string;
  groom_name_kh?: string;
  groom_name_en?: string;
  bride_name_kh?: string;
  bride_name_en?: string;
  portrait_shape?: 'circle' | 'rounded' | 'arch' | 'oval' | 'heart' | 'capsule' | 'leaf' | 'square';
  title_text_shape?: 'straight' | 'arch-up' | 'arch-down' | 'wave';
  details_background: string;
  envelope_frame?: string;
  envelope_header_image?: string;
  guest_frame_style?: string;
  guest_label_text?: string;
  guest_label_text_en?: string;
  background_music: string;
  event_location: string;
  galleryPhotos?: string[];
  gallery_photo_captions?: string[];
  gallery_layout_style?: 'bento' | 'grid' | 'alternating' | 'carousel' | 'masonry' | 'polaroid-grid' | 'circular' | 'filmstrip' | 'luxury-gold' | 'magazine-vibe' | 'heart-mosaic' | 'parallax-scroll';
  photo_gallary: {
    photo1: string;
    photo2: string;
    photo3: string;
    photo4: string;
  };
  qr_code?: string;
  qr_code_riel?: string;
  bankInfo?: BankInfo;
  invitation_kh: InvitationContent;
  invitation_en: InvitationContent;
}

export interface WeddingEvent {
  id: string;
  templateId?: string;
  name: string;
  slug: string;
  bride: string;
  groom: string;
  brideEn?: string;
  groomEn?: string;
  singlePerson?: boolean;
  anniversary_milestone?: string;
  anniversary_milestone_en?: string;
  eventType?: 'wedding' | 'engagement' | 'housewarming' | 'birthday' | 'anniversary';
  ownerId?: string;
  ownerEmail?: string;
  updatedAt?: string;
  location: string;
  locationEn?: string;
  eating_time: string;
  startTime: string;
  date?: string;
  cover_image?: string;
  image: string;
  schedules: Schedule[];
  config: TemplateConfig;
}

export interface GuestInfo {
  id: string;
  name: string;
  nameEn?: string;
  phone?: string;
  status?: 'confirmed' | 'declined' | 'pending';
  guestCount?: number;
  tableNumber?: string;
}

export interface WishMessage {
  id: string;
  name: string;
  relationship?: string;
  message: string;
  createdAt: string;
  likes: number;
}
