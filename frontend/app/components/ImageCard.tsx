import Image from "next/image";
import Link from "next/link";
import type { IndexedImage } from "../lib/api";

interface ImageCardProps {
  image: IndexedImage;
  /** Position in the grid, used to stagger the entrance. */
  index?: number;
}

// Matches the home grid: 2 / 3 / 4 / 5 / 6 columns at base / sm / md / lg / xl.
const CARD_SIZES =
  "(min-width: 1280px) 16vw, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw";

export function ImageCard({ image, index = 0 }: ImageCardProps) {
  const imageUrl = `/images/${image.filename}`;

  return (
    <Link
      href={`/image/${image.id}`}
      className="card stagger-in group block"
      style={{ "--stagger-index": Math.min(index, 12) } as React.CSSProperties}
    >
      {/* Image: aspect-square reserves the space before it loads */}
      <div
        className="image-outline relative w-full aspect-square mb-3 overflow-hidden"
        style={{
          borderRadius: "var(--radius-standard)",
          backgroundColor: "var(--color-bg-elevated)",
        }}
      >
        <Image
          src={imageUrl}
          alt={image.title}
          fill
          sizes={CARD_SIZES}
          className="card-image object-cover"
        />

        {/* Score badge */}
        {image.score != null && (
          <span
            className="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold tabular-nums"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "#000",
              borderRadius: "var(--radius-full-pill)",
            }}
          >
            <span className="sr-only">Match </span>
            {(image.score * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {/* Title: truncated visually, full text on hover and to screen readers */}
      <h2
        className="text-sm font-bold truncate"
        title={image.title}
        style={{ color: "var(--color-text-primary)", letterSpacing: "0" }}
      >
        {image.title}
      </h2>

      {/* Summary */}
      <p
        className="text-sm mt-1 line-clamp-2 leading-normal"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {image.summary}
      </p>
    </Link>
  );
}

/** Same footprint as ImageCard, shown while the grid loads. */
export function ImageCardSkeleton() {
  return (
    <div aria-hidden="true" className="card-shell">
      <div
        className="skeleton w-full aspect-square mb-3"
        style={{ borderRadius: "var(--radius-standard)" }}
      />
      <div className="skeleton h-4 w-3/4 mb-2" style={{ borderRadius: "var(--radius-subtle)" }} />
      <div className="skeleton h-3.5 w-full mb-1" style={{ borderRadius: "var(--radius-subtle)" }} />
      <div className="skeleton h-3.5 w-2/3" style={{ borderRadius: "var(--radius-subtle)" }} />
    </div>
  );
}
