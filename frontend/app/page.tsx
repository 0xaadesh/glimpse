"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchImages, searchImages, type IndexedImage } from "./lib/api";
import { ImageCard } from "./components/ImageCard";

function HomeContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  const [images, setImages] = useState<IndexedImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const load = query ? searchImages(query) : fetchImages();
    load
      .then(setImages)
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="px-6 py-6">
      {/* ── Header ── */}
      {query ? (
        <div className="mb-6">
          <p
            className="text-xs font-semibold uppercase mb-1"
            style={{
              color: "var(--color-text-secondary)",
              letterSpacing: "1.4px",
            }}
          >
            Search Results
          </p>
          <h1 className="text-2xl font-bold">&ldquo;{query}&rdquo;</h1>
          <a
            href="/"
            className="inline-block mt-2 px-4 py-1.5 text-xs font-bold uppercase transition-colors"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-secondary)",
              borderRadius: "var(--radius-full-pill)",
              letterSpacing: "1px",
            }}
          >
            Clear Search
          </a>
        </div>
      ) : (
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Your Images</h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {images.length > 0
              ? `${images.length} image${images.length !== 1 ? "s" : ""} indexed`
              : ""}
          </p>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex justify-center py-20">
          <div
            className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
            style={{
              borderColor: "var(--color-accent)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && images.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <svg
            className="w-16 h-16"
            style={{ color: "var(--color-border)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {query ? "No images match your search." : "No images yet. Upload one to get started!"}
          </p>
        </div>
      )}

      {/* ── Grid ── */}
      {!loading && images.length > 0 && (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          {images.map((image) => (
            <ImageCard key={image.id} image={image} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div
            className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
            style={{
              borderColor: "var(--color-accent)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
