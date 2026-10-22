'use client';

// ── MangaReader — full-screen vertical-scroll reader ─────────────────────────
// Longstrip (manhwa) and paged (manga) both read as one continuous column.
// • Tracks the topmost visible page and saves reading progress locally
// • Prev/next chapter navigation — the parent swaps the chapter and remounts
//   this component via key={chapter.id}, which resets scroll cleanly
// • Resumes at the saved page when opened from Continue Reading

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MangaChapter, MangaItem } from '@/lib/ajest/types';
import { fetchMangaChapters, fetchMangaPages } from '@/lib/ajest/manga';
import { useMangaHistory } from '@/lib/ajest/mangastore';
import { useMangaSourcePrefs } from '@/lib/ajest/prefs';
import { MangaFireEmbed } from './MangaFireEmbed';
import { IconChevronLeft, IconChevronRight, IconClose, IconLoader, IconAlert, IconBook } from './icons';

interface Props {
  manga: MangaItem;
  chapter: MangaChapter;
  resumePage?: number;
  onClose: () => void;
  /** Parent replaces the chapter (and remounts the reader via key) */
  onNav: (c: MangaChapter) => void;
}

export function MangaReader({ manga, chapter, resumePage = 0, onClose, onNav }: Props) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(resumePage);
  const [feed, setFeed] = useState<MangaChapter[] | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const tickingRef = useRef(false);
  const resumedRef = useRef(resumePage <= 0);

  const upsertHistory = useMangaHistory((s) => s.upsert);
  const mfEnabled = useMangaSourcePrefs().disabled.includes('mangafire') === false;

  // Chapter feed (for prev/next) — server-cached, one cheap request
  useEffect(() => {
    let cancelled = false;
    fetchMangaChapters(manga.id)
      .then((d) => {
        if (!cancelled && d.ok) setFeed(d.chapters || []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [manga.id]);

  // Page list for the active chapter — the reader remounts per chapter
  // (key={chapter.id} in the parent), so no synchronous state reset is needed.
  useEffect(() => {
    let cancelled = false;
    fetchMangaPages(chapter.id)
      .then((d) => {
        if (cancelled) return;
        if (d.ok && d.pages.length) setPages(d.pages);
        else setError('This chapter has no readable pages yet — try another one.');
      })
      .catch(() => !cancelled && setError('Could not load pages for this chapter.'));
    return () => {
      cancelled = true;
    };
  }, [chapter.id]);

  // Resume scroll once pages are mounted
  useEffect(() => {
    if (!pages || resumedRef.current || resumePage <= 0) return;
    resumedRef.current = true;
    const t = setTimeout(() => {
      const el = imgRefs.current[Math.min(resumePage, pages.length - 1)];
      const shell = shellRef.current;
      if (el && shell) shell.scrollTo({ top: el.offsetTop - 72 });
    }, 350);
    return () => clearTimeout(t);
  }, [pages, resumePage]);

  // Save progress whenever the visible page changes
  useEffect(() => {
    if (!pages || !pages.length) return;
    upsertHistory({
      manga,
      chapter: { id: chapter.id, number: chapter.number, title: chapter.title },
      page: current,
      pages: pages.length,
      updatedAt: Date.now(),
    });
  }, [current, pages, manga, chapter, upsertHistory]);

  // Scroll → current page index (rAF-throttled)
  const onScroll = useCallback(() => {
    if (tickingRef.current || !pages) return;
    tickingRef.current = true;
    requestAnimationFrame(() => {
      tickingRef.current = false;
      const shell = shellRef.current;
      if (!shell) return;
      const probe = shell.scrollTop + shell.clientHeight * 0.35;
      let idx = 0;
      for (let i = 0; i < imgRefs.current.length; i++) {
        const el = imgRefs.current[i];
        if (el && el.offsetTop <= probe) idx = i;
        else break;
      }
      setCurrent(idx);
    });
  }, [pages]);

  // Feed is newest-first: the next chapter sits one index BEFORE, prev one AFTER
  const chapterIdx = feed ? feed.findIndex((c) => c.id === chapter.id) : -1;
  const prevChapter = chapterIdx >= 0 ? feed![chapterIdx + 1] : undefined;
  const nextChapter = chapterIdx > 0 ? feed![chapterIdx - 1] : undefined;

  // Keyboard: Esc closes, arrows flip chapters
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && nextChapter) onNav(nextChapter);
      if (e.key === 'ArrowLeft' && prevChapter) onNav(prevChapter);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nextChapter, prevChapter, onClose, onNav]);

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 z-[80] select-none overflow-y-auto overscroll-contain bg-black"
      onScroll={onScroll}
      role="dialog"
      aria-label={`${manga.title} — chapter ${chapter.number}`}
    >
      {/* Top chrome */}
      <div className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-white/[0.06] bg-black/85 px-3 py-2.5 backdrop-blur-xl md:gap-3 md:px-5">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/80 transition hover:bg-white/[0.16] hover:text-white"
          aria-label="Close reader"
        >
          <IconClose size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-white/90">{manga.title}</p>
          <p className="truncate text-[11px] text-white/45">
            Chapter {chapter.number}
            {chapter.title ? ` · ${chapter.title}` : ''}
          </p>
        </div>
        {pages && (
          <span className="shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-bold text-white/70">
            {current + 1} / {pages.length}
          </span>
        )}
        {mfEnabled && <MangaFireEmbed title={manga.title} compact />}
        <button
          onClick={() => prevChapter && onNav(prevChapter)}
          disabled={!prevChapter}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition enabled:hover:bg-white/[0.14] enabled:hover:text-white disabled:opacity-30"
          aria-label="Previous chapter"
        >
          <IconChevronLeft size={16} />
        </button>
        <button
          onClick={() => nextChapter && onNav(nextChapter)}
          disabled={!nextChapter}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition enabled:hover:bg-white/[0.14] enabled:hover:text-white disabled:opacity-30"
          aria-label="Next chapter"
        >
          <IconChevronRight size={16} />
        </button>
      </div>

      {/* Pages */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-32 text-white/55">
          <IconAlert size={30} className="text-[#ff6b70]" />
          <p className="text-sm">{error}</p>
          <button onClick={onClose} className="rounded-full bg-[var(--aj-acc)] px-5 py-2 text-[12.5px] font-bold text-black">
            Back to series
          </button>
        </div>
      ) : !pages ? (
        <div className="flex flex-col items-center justify-center gap-3 py-32 text-white/50">
          <IconLoader size={34} className="aj-spin text-[var(--aj-acc)]" />
          <p className="text-sm">Unpacking chapter {chapter.number}…</p>
        </div>
      ) : (
        <div className="mx-auto flex flex-col items-center">
          {pages.map((src, i) => (
            <img
              key={`${src}-${i}`}
              ref={(el) => {
                imgRefs.current[i] = el;
              }}
              src={src}
              alt={`Page ${i + 1}`}
              loading={i < 2 ? 'eager' : 'lazy'}
              draggable={false}
              referrerPolicy="no-referrer"
              className="block w-full max-w-[860px]"
            />
          ))}

          {/* End-of-chapter panel */}
          <div className="flex w-full max-w-[860px] flex-col items-center gap-4 px-6 py-16 text-center">
            <IconBook size={26} className="text-white/25" />
            <p className="text-sm font-semibold text-white/80">End of Chapter {chapter.number}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {prevChapter && (
                <button
                  onClick={() => onNav(prevChapter)}
                  className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-5 py-2.5 text-[13px] font-semibold text-white/85 transition hover:bg-white/[0.15]"
                >
                  <IconChevronLeft size={14} /> Ch {prevChapter.number}
                </button>
              )}
              {nextChapter ? (
                <button
                  onClick={() => onNav(nextChapter)}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--aj-acc)] px-6 py-2.5 text-[13px] font-bold text-black transition hover:bg-[var(--aj-acc-hi2)]"
                >
                  Next Chapter <IconChevronRight size={14} />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="rounded-full bg-white/[0.08] px-5 py-2.5 text-[13px] font-semibold text-white/85 transition hover:bg-white/[0.15]"
                >
                  You&apos;re all caught up
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
