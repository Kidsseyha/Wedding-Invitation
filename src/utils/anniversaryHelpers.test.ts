import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAnniversaryMilestone,
  formatAnniversarySchedule,
  buildAnniversaryHostsDisplay,
  buildAnniversaryStoryQuote,
  formatAnniversaryLocation,
  resolveStoryStartYear,
  buildAnniversaryCoverDraft,
  applyAnniversaryCoverDraft,
  buildDefaultKhmerAnniversaryChapters,
  resolveAnniversaryStoryChapters,
  KHMER_CULTURAL_SYMBOLS,
  DEFAULT_KHMER_ANNIVERSARY_PROVERB,
  type AnniversaryEditableEvent,
} from './anniversaryHelpers';

test('formatAnniversaryMilestone formats Khmer and English milestones into story chapters', () => {
  const kh = formatAnniversaryMilestone('៥០', '50th', 'kh');
  assert.equal(kh.yearsNumber, 50);
  assert.equal(kh.yearsBadge, '៥០ ឆ្នាំ');
  assert.ok(kh.kickerLabel.includes('ជំពូកស្នេហា'));
  assert.ok(kh.kickerLabel.includes('៥០ ឆ្នាំ'));

  const en = formatAnniversaryMilestone('៥០', '50th', 'en');
  assert.equal(en.yearsNumber, 50);
  assert.equal(en.yearsBadge, '50 Years');
  assert.ok(en.kickerLabel.includes('50TH ANNIVERSARY'));

  const fallback = formatAnniversaryMilestone('', '', 'kh');
  assert.equal(fallback.yearsNumber, null);
  assert.ok(fallback.kickerLabel.includes('ខួបអាពាហ៍ពិពាហ៍'));
});

test('formatAnniversarySchedule formats ISO date and evening time into Khmer and English', () => {
  const sched = formatAnniversarySchedule('2026-12-26', '06:00 PM');
  assert.equal(sched.dateLabelKh, 'ថ្ងៃសៅរ៍ ទី២៦ ខែធ្នូ ឆ្នាំ២០២៦');
  assert.equal(sched.timeLabelKh, 'ម៉ោង ០៦:០០ ល្ងាច');
  assert.equal(sched.timeLabelEn, '6:00 PM');
  assert.equal(sched.targetYearEn, '2026');
});

test('buildAnniversaryHostsDisplay joins couple names cleanly', () => {
  assert.equal(
    buildAnniversaryHostsDisplay('ហេង ពិសិដ្ឋ', 'ផែ រក្សា', false),
    'ហេង ពិសិដ្ឋ & ផែ រក្សា'
  );
  assert.equal(buildAnniversaryHostsDisplay('ហេង ពិសិដ្ឋ', '', true), 'ហេង ពិសិដ្ឋ');
});

test('buildAnniversaryStoryQuote prefers custom Khmer story message and falls back with milestone years', () => {
  const custom = buildAnniversaryStoryQuote({
    milestoneKh: '២៥',
    customMessageKh: 'ក្តីស្រឡាញ់ ២៥ឆ្នាំរបស់យើង គឺជាកាដូដ៏វិសេសបំផុតក្នុងជីវិត។',
    language: 'kh',
  });
  assert.equal(custom, 'ក្តីស្រឡាញ់ ២៥ឆ្នាំរបស់យើង គឺជាកាដូដ៏វិសេសបំផុតក្នុងជីវិត។');

  const generatedKh = buildAnniversaryStoryQuote({
    milestoneKh: '៥០',
    milestoneEn: '50th',
    language: 'kh',
  });
  assert.ok(generatedKh.includes('៥០ ឆ្នាំ'));

  const generatedEn = buildAnniversaryStoryQuote({
    milestoneKh: '៥០',
    milestoneEn: '50th',
    language: 'en',
  });
  assert.ok(generatedEn.includes('50 cherished years'));
});

test('formatAnniversaryLocation returns localized defaults when empty', () => {
  assert.ok(formatAnniversaryLocation('', 'kh').includes('រ៉ូសវូដ'));
  assert.ok(formatAnniversaryLocation('', 'en').includes('Rosewood Phnom Penh'));
});

test('resolveStoryStartYear computes start year from milestone or respects custom Khmer/Latin year', () => {
  assert.deepEqual(resolveStoryStartYear('', '2026', 25), {
    startYearKh: '២០០១',
    startYearEn: '2001',
  });
  assert.deepEqual(resolveStoryStartYear('១៩៩៩', '2026', 25), {
    startYearKh: '១៩៩៩',
    startYearEn: '1999',
  });
});

test('buildDefaultKhmerAnniversaryChapters creates 4 culturally grounded chapters tailored to couple and milestone', () => {
  const chapters = buildDefaultKhmerAnniversaryChapters({
    groom: 'សុខ ចាន់',
    bride: 'កែវ ស្រីពេជ្រ',
    groomEn: 'Sok Chan',
    brideEn: 'Keo Sreypich',
    storyStartYear: '2001',
    targetYearEn: '2026',
    milestoneYears: 25,
  });

  assert.equal(chapters.length, 4);
  assert.equal(chapters[0].chapterNumberKh, 'ជំពូកទី ១');
  assert.ok(chapters[0].storyKh.includes('សុខ ចាន់'));
  assert.ok(chapters[1].titleKh.includes('សំពះផ្ទឹម'));
  assert.ok(chapters[1].yearLabelKh.includes('២០០១'));
  assert.ok(chapters[3].titleKh.includes('២៥ ឆ្នាំ'));
  assert.ok(chapters.every((c) => c.image.startsWith('/assets/images/')));
  assert.equal(KHMER_CULTURAL_SYMBOLS.length, 4);
});

test('resolveAnniversaryStoryChapters merges custom edits while replacing any unsplash image with local artwork', () => {
  const resolved = resolveAnniversaryStoryChapters(
    [
      {
        id: 'ch1',
        chapterNumberKh: 'ជំពូកទី ១',
        chapterNumberEn: 'Chapter I',
        yearLabelKh: 'ឆ្នាំ ២០០០',
        yearLabelEn: '2000',
        titleKh: 'ជំនួបដំបូងនៅអង្គរ',
        titleEn: 'First Meeting at Angkor',
        traditionLabelKh: 'និស្ស័យស្នេហ៍',
        traditionLabelEn: 'Destined Meeting',
        storyKh: 'រឿងរ៉ាវស្នេហាផ្ទាល់ខ្លួនរបស់យើង។',
        storyEn: 'Our custom first chapter story.',
        image: 'https://images.unsplash.com/photo-1510076857177-7470076d4098',
      },
    ],
    {
      groom: 'សុខ ចាន់',
      bride: 'កែវ ស្រីពេជ្រ',
      storyStartYear: '2001',
      targetYearEn: '2026',
      milestoneYears: 25,
    }
  );

  assert.equal(resolved.length, 4);
  assert.equal(resolved[0].titleKh, 'ជំនួបដំបូងនៅអង្គរ');
  assert.equal(resolved[0].storyKh, 'រឿងរ៉ាវស្នេហាផ្ទាល់ខ្លួនរបស់យើង។');
  assert.ok(!resolved[0].image.includes('unsplash.com'));
  assert.equal(resolved[1].chapterNumberKh, 'ជំពូកទី ២');
});

test('buildAnniversaryCoverDraft and applyAnniversaryCoverDraft sync cover, proverbs, and chapters cleanly', () => {
  const baseEvent: AnniversaryEditableEvent = {
    name: 'ពិធីខួបអាពាហ៍ពិពាហ៍ ហេង ពិសិដ្ឋ & ផែ រក្សា',
    groom: 'ហេង ពិសិដ្ឋ',
    bride: 'ផែ រក្សា',
    groomEn: 'Heng Piseth',
    brideEn: 'Phea Raksa',
    anniversary_milestone: '៥០',
    anniversary_milestone_en: '50th',
    date: '2026-12-26',
    startTime: '2026-12-26T18:00:00+07:00',
    eating_time: '06:00 PM',
    location: 'សណ្ឋាគារ រ៉ូសវូដ',
    locationEn: 'Rosewood Phnom Penh',
    config: {
      map_url: 'https://maps.google.com',
      cover_subtitle_kh: 'ពិធីខួបអាពាហ៍ពិពាហ៍',
      cover_subtitle_en: 'Wedding Anniversary Story',
      anniversary_milestone: '៥០',
      anniversary_milestone_en: '50th',
      story_start_year: '1976',
      invitation_kh: {
        location: 'សណ្ឋាគារ រ៉ូសវូដ',
        subtitle: 'សូមគោរពអញ្ជើញ',
        date_time: 'ថ្ងៃសៅរ៍ ទី២៦ ខែធ្នូ ឆ្នាំ២០២៦',
        main_title: 'ពិធីខួបអាពាហ៍ពិពាហ៍',
        invitation_message: 'រឿងរ៉ាវស្នេហាដ៏មានន័យរបស់យើង',
      },
      invitation_en: {
        location: 'Rosewood Phnom Penh',
        subtitle: 'Cordially Invited',
        date_time: 'Saturday, December 26, 2026',
        main_title: 'Wedding Anniversary Story',
        invitation_message: 'Half a century of love together.',
      },
    },
  };

  const draft = buildAnniversaryCoverDraft(baseEvent);
  assert.equal(draft.milestoneKh, '៥០');
  assert.equal(draft.storyStartYear, '1976');
  assert.equal(draft.storyChapters.length, 4);
  assert.equal(draft.proverbKh, DEFAULT_KHMER_ANNIVERSARY_PROVERB.kh);

  const editedChapters = draft.storyChapters.map((ch, idx) =>
    idx === 0 ? { ...ch, titleKh: 'ជំនួបនិស្ស័យពិសេស' } : ch
  );

  const updated = applyAnniversaryCoverDraft(baseEvent, {
    ...draft,
    coverTitleKh: 'ខួបមង្គលការប្រាក់ ២៥ ឆ្នាំ',
    coverTitleEn: '25th Silver Anniversary Story',
    milestoneKh: '២៥',
    milestoneEn: '25th',
    storyStartYear: '2001',
    groomKh: 'សុខ ចាន់',
    brideKh: 'កែវ ស្រីពេជ្រ',
    storyMessageKh: '២៥ ឆ្នាំនៃក្តីស្រឡាញ់ និងការយោគយល់គ្នា។',
    storyMessageEn: '25 silver years of love and devotion.',
    proverbKh: 'ស្នេហាស្មោះស្ម័គ្រ មិនប្រែប្រួលតាមកាលវេលា។',
    storyChapters: editedChapters,
    eventDate: '2026-11-15',
    eventTime: '07:00 PM',
    locationKh: 'ភោជនីយដ្ឋាន ទន្លេបាសាក់ II',
    ribbonLabelKh: 'សូមគោរពអញ្ជើញចូលរួមជាភ្ញៀវកិត្តិយស',
  });

  assert.equal(updated.groom, 'សុខ ចាន់');
  assert.equal(updated.bride, 'កែវ ស្រីពេជ្រ');
  assert.equal(updated.anniversary_milestone, '២៥');
  assert.equal(updated.config.story_start_year, '2001');
  assert.equal(updated.config.cover_subtitle_kh, 'ខួបមង្គលការប្រាក់ ២៥ ឆ្នាំ');
  assert.equal(updated.config.anniversary_proverb_kh, 'ស្នេហាស្មោះស្ម័គ្រ មិនប្រែប្រួលតាមកាលវេលា។');
  assert.equal(updated.config.anniversary_story_chapters?.[0].titleKh, 'ជំនួបនិស្ស័យពិសេស');
  assert.equal(updated.config.invitation_kh.invitation_message, '២៥ ឆ្នាំនៃក្តីស្រឡាញ់ និងការយោគយល់គ្នា។');
  assert.equal(updated.config.invitation_en.invitation_message, '25 silver years of love and devotion.');
  assert.equal(updated.eating_time, '07:00 PM');
  assert.equal(updated.date, '2026-11-15');
  assert.equal(updated.config.guest_label_text, 'សូមគោរពអញ្ជើញចូលរួមជាភ្ញៀវកិត្តិយស');
});
