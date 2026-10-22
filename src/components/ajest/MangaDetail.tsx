'use client';

// ── MangaDetail — cover hero, metadata, actions and the chapter list ─────────

import { useEffect, useMemo, useState } from 'react';
import type { MangaChapter, MangaItem } from '@/lib/ajest/types';
import { fetchMangaChapters, fetchMangaDetail, mangaOriginLabel, mangaStatusLabel, fmtFollows, fmtChapterDate } from '@/lib/ajest/manga';
import { cleanDescription } from '@/lib/ajest/client';
import { useMangaHistory, useMangaSaved, useMangaLiked } from '@/lib/ajest/mangastore';
import { IconChevronLeft, IconHeart, IconBookmark, IconPlay, IconBook, IconLoader, IconStar, IconCheck } from './icons';

interface Props {
  manga: MangaItem;
  onBack: () => void;
  onRead: (manga: MangaItem, chapter: MangaChapter, resumePage: number) => void;
}

const CHAPTER_PAGE_SIZE = 50;

export function MangaDetail({ manga, onBack, onRead }: Props) {
  const [full, setFull] = useState<MangaItem>(manga);
  // Keyed by manga id — while a new series is loading we derive "loading"
  // from the id mismatch instead of calling setState in the effect body.
  const [chaptersState, setChaptersState] = useState<{
    id: string;
    chapters: MangaChapter[];
    error: string | null;
  }>({ id: '', chapters: [], error: null });
  const [expanded, setExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const chaptersLoading = chaptersState.id !== manga.id;
  const chapters = chaptersState.id === manga.id ? chaptersState.chapters : [];
  const chaptersError = chaptersState.id === manga.id ? chaptersState.error : null;

  const historyEntry = useMangaHistory((s) => s.entries[manga.id]);
  const saved = useMangaSaved((s) => s.items.some((x) => x.id === manga.id));
  const toggleSaved = useMangaSaved((s) => s.toggle);
  const liked = useMangaLiked((s) => s.items.some((x) => x.id === manga.id));
  const toggleLiked = useMangaLiked((s) => s.toggle);

  // Enrich with authors/rating/fresh cover from the detail endpoint
  useEffect(() => {
    let cancelled = false;
    fetchMangaDetail(manga.id)
      .then((d) => {
        if (!cancelled && d.ok && d.manga) setFull(d.manga);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [manga.id]);

  useEffect(() => {
    let cancelled = false;
    fetchMangaChapters(manga.id)
      .then((d) => {
        if (cancelled) return;
        setChaptersState({
          id: manga.id,
          chapters: d.ok ? d.chapters || [] : [],
          error: d.ok ? null : 'Could not load the chapter list',
        });
      })
      .catch(
        () =>
          !cancelled &&
          setChaptersState({ id: manga.id, chapters: [], error: 'Could not load the chapter list' })
      );
    return () => {
      cancelled = true;
    };
  }, [manga.id]);

  const readUpTo = useMemo(() => {
    if (!historyEntry) return -1;
    const idx = chapters.findIndex((c) => c.id === historyEntry.chapter.id);
    return idx;
  }, [historyEntry, chapters]);

  const visible = expanded ? chapters : chapters.slice(0, CHAPTER_PAGE_SIZE);
  const description = cleanDescription(full.description);
  const origin = mangaOriginLabel(full.origin);

  const resume = () => {
    if (!chapters.length) return;
    if (historyEntry) {
      const ch = chapters.find((c) => c.id === historyEntry.chapter.id);
      if (ch) {
        onRead(full, ch, historyEntry.page);
        return;
      }
      // saved chapter no longer in feed — fall back to newest
    }
    onRead(full, chapters[0], 0);
  };

  return (
    <div className="min-h-screen pb-24">
      {/* ── Hero ── */}
      <div className="relative">
        <div className="absolute inset-0 h-[380px] overflow-hidden md:h-[440px]">
          {full.cover && (
            <img src={full.cover} alt="" aria-hidden className="h-full w-full scale-110 object-cover opacity-30 blur-2xl" referrerPolicy="no-referrer" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12]/60 to-[#0b0d12]/30" />
        </div>

        <button
          onClick={onBack}
          className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-4 py-2 text-[13px] font-semibold text-white/90 backdrop-blur transition hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)]"
          aria-label="Go back"
        >
          <IconChevronLeft size={16} /> Back
        </button>

        <div className="relative z-[1] mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-20 md:flex-row md:px-8 md:pt-24">
          <div className="w-[168px] shrink-0 self-center overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 md:self-start">
            {full.cover ? (
              <img src={full.cover} alt={full.title} className="aspect-[2/3] w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex aspect-[2/3] items-center justify-center bg-[#171b24]">
                <IconBook size={34} className="text-white/25" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 text-center md:text-left">
            {origin && (
              <span className="mb-2 inline-block rounded-md bg-[var(--aj-acc-15)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--aj-acc-hi)]">
                {origin}
              </span>
            )}
            <h1 className="text-[24px] font-extrabold leading-tight text-white md:text-[32px]">{full.title}</h1>
            {full.authors && full.authors.length > 0 && (
              <p className="mt-1.5 text-[13px] text-white/55">{full.authors.join(' · ')}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[12px] text-white/65 md:justify-start">
              {full.rating !== undefined && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 font-bold text-[var(--aj-acc-hi)]">
                  <IconStar size={11} filled /> {full.rating.toFixed(1)}
                </span>
              )}
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1">{mangaStatusLabel(full.status)}</span>
              {full.year ? <span className="rounded-full bg-white/[0.06] px-2.5 py-1">{full.year}</span> : null}
              {chapters.length > 0 && (
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1">{chapters.length} EN chapters</span>
              )}
              {full.follows ? <span className="rounded-full bg-white/[0.06] px-2.5 py-1">{fmtFollows(full.follows)}</span> : null}
            </div>

            {/* Tags */}
            {full.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 md:justify-start">
                {full.tags.slice(0, 8).map((t) => (
                  <span key={t} className="rounded-full border border-white/[0.09] px-2.5 py-0.5 text-[11px] text-white/55">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            <p className={`mt-4 text-[13.5px] leading-relaxed text-white/70 ${descExpanded ? '' : 'line-clamp-3'}`}>
              {description}
            </p>
            {description.length > 220 && (
              <button onClick={() => setDescExpanded((e) => !e)} className="mt-1 text-[12px] font-semibold text-[var(--aj-acc)] hover:underline">
                {descExpanded ? 'Show less' : 'Read more'}
              </button>
            )}

            {/* Actions */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <button
                onClick={resume}
                disabled={chaptersLoading || !chapters.length}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--aj-acc)] px-6 py-2.5 text-[13.5px] font-bold text-black transition hover:bg-[var(--aj-acc-hi2)] hover:scale-[1.03] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                <IconPlay size={15} />
                {historyEntry ? `Continue Ch ${historyEntry.chapter.number}` : 'Start Reading'}
              </button>
              <button
                onClick={() => toggleLiked(full)}
                aria-pressed={liked}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition hover:scale-[1.03] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  liked
                    ? 'bg-[var(--aj-acc-15)] text-[var(--aj-acc-hi)] ring-1 ring-[var(--aj-acc-40)]'
                    : 'bg-white/[0.07] text-white/85 hover:bg-white/[0.13]'
                }`}
              >
                <IconHeart size={15} filled={liked} /> {liked ? 'Liked' : 'Like'}
              </button>
              <button
                onClick={() => toggleSaved(full)}
                aria-pressed={saved}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition hover:scale-[1.03] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  saved
                    ? 'bg-[var(--aj-acc-15)] text-[var(--aj-acc-hi)] ring-1 ring-[var(--aj-acc-40)]'
                    : 'bg-white/[0.07] text-white/85 hover:bg-white/[0.13]'
                }`}
              >
                <IconBookmark size={15} filled={saved} /> {saved ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chapters ── */}
      <div className="mx-auto mt-10 max-w-5xl px-4 md:px-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold tracking-wide text-white/90 md:text-[16.5px]">Chapters</h2>
          {chapters.length > CHAPTER_PAGE_SIZE && (
            <button onClick={() => setExpanded((e) => !e)} className="text-[12px] font-semibold text-[var(--aj-acc-hi)] transition hover:text-white">
              {expanded ? 'Show latest only' : `Show all ${chapters.length}`}
            </button>
          )}
        </div>

        {chaptersLoading ? (
          <div className="flex flex-col items-center gap-3 py-14 text-white/50">
            <IconLoader size={28} className="aj-spin text-[var(--aj-acc)]" />
            <p className="text-sm">Fetching chapters…</p>
          </div>
        ) : chaptersError ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#14171f] py-12 text-center text-white/55">
            <p className="text-sm">{chaptersError}</p>
          </div>
        ) : !chapters.length ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#14171f] py-12 text-center text-white/55">
            <IconBook size={26} className="mx-auto mb-2 text-white/30" />
            <p className="text-sm font-semibold">No English chapters yet</p>
            <p className="mt-1 text-xs text-white/35">Check back later — Ajest lists every series with English releases.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visible.map((c, idx) => {
              const isCurrent = historyEntry?.chapter.id === c.id;
              const isRead = readUpTo >= 0 && idx > readUpTo; // list is newest-first: older = "already read"
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onRead(full, c, isCurrent ? historyEntry!.page : 0)}
                    className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      isCurrent
                        ? 'border-[var(--aj-acc-40)] bg-[var(--aj-acc-08)]'
                        : 'border-white/[0.06] bg-[#14171f] hover:border-[var(--aj-acc-50)] hover:bg-[#1a1f2b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)]'
                    }`}
                    aria-label={`Read chapter ${c.number}`}
                  >
                    <span
                      className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-lg text-[12.5px] font-extrabold ${
                        isCurrent ? 'bg-[var(--aj-acc)] text-black' : 'bg-white/[0.05] text-white/80'
                      }`}
                    >
                      {isRead && !isCurrent ? <IconCheck size={14} className="text-[var(--aj-acc-hi)]" /> : `#${c.number}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-white/90">
                        Chapter {c.number}
                        {c.title ? ` · ${c.title}` : ''}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-white/40">
                        {fmtChapterDate(c.at)}
                        {c.pages ? ` · ${c.pages} pages` : ''}
                        {c.group ? ` · ${c.group}` : ''}
                      </span>
                    </span>
                    {isCurrent && (
                      <span className="mr-1 rounded-full bg-[var(--aj-acc-15)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--aj-acc-hi)]">
                        Page {historyEntry!.page + 1}
                      </span>
                    )}
                    <span className="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition group-hover:bg-[var(--aj-acc)] group-hover:text-black">
                      <IconPlay size={13} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
