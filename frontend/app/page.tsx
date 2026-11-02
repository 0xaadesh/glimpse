"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchImages, searchImages, type IndexedImage } from "./lib/api";
import { ImageCard, ImageCardSkeleton } from "./components/ImageCard";
import { AlertIcon, ImageIcon } from "./components/icons";
import { useUpload } from "./components/UploadProvider";

// Last result per query (per library version). Coming back from an image
// renders the same grid instantly, so the browser can restore the scroll
// position, then revalidates in the background.
const resultCache = new Map<string, IndexedImage[]>();

// 2 columns on phones up to 6 on wide screens; ImageCard sizes match.
const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

const PILL_BUTTON_STYLE: React.CSSProperties = {
  borderRadius: "var(--radius-full-pill)",
  letterSpacing: "0.1em",
};

function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/* ── Data ── */

interface LibraryState {
  images: IndexedImage[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** Gallery or search results; refetches on query change, ingest, or retry. */
function useLibrary(query: string, libraryVersion: number): LibraryState {
  const cacheKey = `${libraryVersion}:${query}`;
  const cached = resultCache.get(cacheKey);
  const [images, setImages] = useState<IndexedImage[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const hit = resultCache.get(cacheKey);
    if (hit) setImages(hit);
    setLoading(!hit);
    setError(null);
    (query ? searchImages(query) : fetchImages())
      .then((result) => {
        resultCache.set(cacheKey, result);
        if (!cancelled) setImages(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setImages([]);
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, query, retryCount]);

  return { images, loading, error, retry: () => setRetryCount((n) => n + 1) };
}

/* ── Pieces ── */

function SkeletonGrid() {
  return (
    <div role="status" aria-label="Loading images" className={GRID_CLASS}>
      {Array.from({ length: 8 }, (_, i) => (
        <ImageCardSkeleton key={i} />
      ))}
    </div>
  );
}

function countLabel(query: string, count: number, loading: boolean) {
  // A non-breaking space keeps the line's height so the header never jumps.
  if (loading) return " ";
  if (query) return plural(count, "match", "matches");
  return count > 0 ? `${plural(count, "image")} indexed` : " ";
}

function HomeHeader({ query, count, loading }: { query: string; count: number; loading: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
      {query && (
        <p
          className="text-xs font-semibold uppercase mb-1"
          style={{ color: "var(--color-text-secondary)", letterSpacing: "0.1em" }}
        >
          Search Results
        </p>
      )}
      <h1 className="text-2xl font-bold text-balance wrap-anywhere">
        {query ? <>&ldquo;{query}&rdquo;</> : "Your Images"}
      </h1>
      <p
        aria-live="polite"
        className="text-sm mt-1 tabular-nums"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {countLabel(query, count, loading)}
      </p>
      </div>
      {query && (
        <Link
          href="/"
          className="pressable pressable-elevated pressable-muted inline-flex items-center shrink-0 min-h-11 px-5 text-xs font-bold uppercase"
          style={{
            ...PILL_BUTTON_STYLE,
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-secondary)",
            letterSpacing: "0.08em",
          }}
        >
          Clear Search
        </Link>
      )}
    </div>
  );
}

function LoadError({ isSearch, message, onRetry }: { isSearch: boolean; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <span style={{ color: "var(--color-negative)" }}>
        <AlertIcon className="w-12 h-12" strokeWidth={1.5} />
      </span>
      <div>
        <p className="text-base font-semibold">
          {isSearch ? "Search failed" : "Couldn’t load your images"}
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          {message}. Check that the backend is running, then try again.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="pressable pressable-elevated min-h-11 px-5 text-sm font-bold uppercase cursor-pointer"
        style={{
          ...PILL_BUTTON_STYLE,
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
        }}
      >
        Try Again
      </button>
    </div>
  );
}

function EmptyLibrary({ isSearch }: { isSearch: boolean }) {
  const { openUpload } = useUpload();

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <span style={{ color: "var(--color-border)" }}>
        <ImageIcon className="w-16 h-16" strokeWidth={1} />
      </span>
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {isSearch
          ? "No images match your search. Try different words."
          : "No images yet. Upload one to get started."}
      </p>
      {!isSearch && (
        <button
          type="button"
          onClick={(e) => openUpload(e.currentTarget)}
          className="pressable pressable-accent min-h-11 px-6 text-sm font-bold uppercase cursor-pointer"
          style={{ ...PILL_BUTTON_STYLE, backgroundColor: "var(--color-accent)", color: "#000" }}
        >
          Upload an Image
        </button>
      )}
    </div>
  );
}

/* ── Page ── */

function LibraryBody({ query, library }: { query: string; library: LibraryState }) {
  const { images, loading, error, retry } = library;
  if (loading) return <SkeletonGrid />;
  if (error) return <LoadError isSearch={Boolean(query)} message={error} onRetry={retry} />;
  if (images.length === 0) return <EmptyLibrary isSearch={Boolean(query)} />;
  return (
    <div className={GRID_CLASS}>
      {images.map((image, i) => (
        <ImageCard key={image.id} image={image} index={i} />
      ))}
    </div>
  );
}

function HomeContent() {
  const query = useSearchParams().get("q") ?? "";
  const { libraryVersion } = useUpload();
  const library = useLibrary(query, libraryVersion);

  return (
    <div className="page-container py-6">
      <HomeHeader query={query} count={library.images.length} loading={library.loading} />
      <LibraryBody query={query} library={library} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="page-container py-6">
          <div className="mb-6 h-16" />
          <SkeletonGrid />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
