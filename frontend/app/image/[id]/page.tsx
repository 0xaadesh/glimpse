"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { fetchImage, NotFoundError, type IndexedImage } from "../../lib/api";
import { AlertIcon, BackIcon, ChevronIcon, ExternalIcon } from "../../components/icons";
import { TagGroups, type TagGroup } from "../../components/TagGroups";

const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
  backgroundColor: "var(--color-bg-elevated)",
  color: "var(--color-text-primary)",
  borderRadius: "var(--radius-full-pill)",
  letterSpacing: "0.1em",
};

const SECTION_LABEL_STYLE: React.CSSProperties = {
  color: "var(--color-text-secondary)",
  letterSpacing: "0.12em",
};

/** Staged entrance for the detail column: header, metadata, document. */
function enterStyle(index: number): React.CSSProperties {
  return { "--enter-index": index } as React.CSSProperties;
}

/* ── Data ── */

type LoadError = { notFound: boolean; message: string };

function useImage(imageId: string) {
  const [image, setImage] = useState<IndexedImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchImage(imageId)
      .then((result) => {
        if (!cancelled) setImage(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError({
          notFound: err instanceof NotFoundError,
          message: err instanceof Error ? err.message : "Failed to load image",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId, retryCount]);

  return { image, loading, error, retry: () => setRetryCount((n) => n + 1) };
}

/* ── States ── */

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading image" className="page-container py-6">
      <title>Loading… · Glimpse</title>
      <div className="skeleton h-11 w-28 mb-6" style={{ borderRadius: "var(--radius-full-pill)" }} />
      <div className="detail-grid">
        <div className="skeleton detail-hero" style={{ borderRadius: "var(--radius-medium)" }} />
        <div className="flex flex-col gap-3">
          <div className="skeleton h-9 w-3/4" style={{ borderRadius: "var(--radius-subtle)" }} />
          <div className="skeleton h-5 w-full" style={{ borderRadius: "var(--radius-subtle)" }} />
          <div className="skeleton h-5 w-5/6 mb-4" style={{ borderRadius: "var(--radius-subtle)" }} />
          <div className="skeleton h-64 w-full" style={{ borderRadius: "var(--radius-medium)" }} />
        </div>
      </div>
    </div>
  );
}

function DetailError({ error, onRetry, onHome }: { error: LoadError | null; onRetry: () => void; onHome: () => void }) {
  const notFound = error?.notFound ?? true;
  return (
    <div role="alert" className="page-container flex flex-col items-center justify-center py-24 gap-4 text-center">
      <title>{`${notFound ? "Not found" : "Error"} · Glimpse`}</title>
      <span style={{ color: "var(--color-negative)" }}>
        <AlertIcon className="w-12 h-12" strokeWidth={1.5} />
      </span>
      <div>
        <p className="text-base font-semibold">
          {notFound ? "This image doesn’t exist" : "Couldn’t load this image"}
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          {notFound
            ? "It may have been removed, or the link is wrong."
            : `${error?.message}. Check that the backend is running, then try again.`}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {!notFound && (
          <button
            type="button"
            onClick={onRetry}
            className="pressable pressable-elevated min-h-11 px-5 text-sm font-bold uppercase cursor-pointer"
            style={SECONDARY_BUTTON_STYLE}
          >
            Try Again
          </button>
        )}
        <button
          type="button"
          onClick={onHome}
          className="pressable pressable-elevated min-h-11 px-5 text-sm font-bold uppercase cursor-pointer"
          style={SECONDARY_BUTTON_STYLE}
        >
          Back to Gallery
        </button>
      </div>
    </div>
  );
}

/* ── Page ── */

export default function ImageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { image, loading, error, retry } = useImage(params.id as string);

  // Go back to where the user came from (keeps their search and scroll);
  // fall back to the gallery when the page was opened directly.
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  if (loading) return <DetailSkeleton />;
  if (error || !image) {
    return <DetailError error={error} onRetry={retry} onHome={() => router.push("/")} />;
  }

  const imageUrl = `/images/${image.filename}`;

  const tagGroups: TagGroup[] = [
    ["People", image.people],
    ["Objects", image.objects],
    ["Actions", image.actions],
    ["Setting", image.setting],
    ["Clothing", image.clothing],
    ["Emotions", image.emotions],
    ["Concepts", image.concepts],
    ["Keywords", image.keywords],
    ["Search Queries", image.possible_search_queries],
    ["Usage Contexts", image.usage_contexts],
  ];

  return (
    <div className="page-container py-6">
      <title>{`${image.title} · Glimpse`}</title>

      {/* ── Toolbar: way out on the left, actions on the right ── */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <button
          type="button"
          onClick={goBack}
          className="pressable pressable-elevated pressable-muted inline-flex items-center gap-2 min-h-11 ps-3.5 pe-4 text-sm font-bold uppercase cursor-pointer"
          style={{ ...SECONDARY_BUTTON_STYLE, color: "var(--color-text-secondary)", letterSpacing: "0.08em" }}
        >
          <BackIcon className="w-4 h-4" strokeWidth={2.5} />
          Back
        </button>
        <a
          href={imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable pressable-elevated pressable-muted inline-flex items-center gap-2 min-h-11 ps-4 pe-3.5 text-sm font-bold uppercase"
          style={{ ...SECONDARY_BUTTON_STYLE, color: "var(--color-text-secondary)", letterSpacing: "0.08em" }}
        >
          <span>
            Full size<span className="sr-only"> (opens in a new tab)</span>
          </span>
          <ExternalIcon className="w-4 h-4" strokeWidth={2.5} />
        </a>
      </div>

      <div className="detail-grid">
        {/* ── Image: sticks beside the details on wide screens ── */}
        <figure className="detail-media enter-item" style={enterStyle(0)}>
          <div
            className="detail-hero relative overflow-hidden image-outline"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              borderRadius: "var(--radius-medium)",
            }}
          >
            <Image
              src={imageUrl}
              alt={image.title}
              fill
              priority
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="object-contain"
            />
          </div>
        </figure>

        {/* ── Details ── */}
        <div className="flex flex-col gap-6 min-w-0">
          <header className="enter-item" style={enterStyle(1)}>
            <h1 className="text-3xl font-bold text-balance">{image.title}</h1>
            <p
              className="mt-3 text-base leading-relaxed text-pretty"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {image.summary}
            </p>
          </header>

          <section
            aria-labelledby="metadata-heading"
            className="panel enter-item"
            style={enterStyle(2)}
          >
            <div className="flex items-baseline justify-between gap-3 mb-5">
              <h2 id="metadata-heading" className="text-xs font-bold uppercase" style={SECTION_LABEL_STYLE}>
                AI-Generated Metadata
              </h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Select a tag to search
              </p>
            </div>
            <TagGroups groups={tagGroups} linkToSearch />
          </section>

          <section
            aria-labelledby="semantic-heading"
            className="panel enter-item"
            style={enterStyle(3)}
          >
            <details className="disclosure">
              <summary className="flex items-center justify-between gap-3 min-h-11 -my-2 cursor-pointer list-none">
                <span>
                  <h2 id="semantic-heading" className="text-xs font-bold uppercase" style={SECTION_LABEL_STYLE}>
                    Semantic Document
                  </h2>
                  <span className="block text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    The text this image is embedded and searched by
                  </span>
                </span>
                <span className="disclosure-chevron shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                  <ChevronIcon className="w-4 h-4" strokeWidth={2.5} />
                </span>
              </summary>
              <pre
                className="mt-4 text-sm whitespace-pre-wrap wrap-anywhere leading-relaxed"
                style={{ color: "var(--color-text-bright)" }}
              >
                {image.semantic_document}
              </pre>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
