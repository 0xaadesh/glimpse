import Link from "next/link";
import type { IndexedImage } from "../lib/api";

interface ImageCardProps {
  image: IndexedImage;
}

export function ImageCard({ image }: ImageCardProps) {
  const imageUrl = `/images/${image.filename}`;

  return (
    <Link
      href={`/image/${image.id}`}
      className="group block transition-all duration-200"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        borderRadius: "var(--radius-comfortable)",
      }}
    >
      <div
        className="p-3 transition-all duration-200"
        style={{ borderRadius: "var(--radius-comfortable)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor =
            "var(--color-bg-card)";
          (e.currentTarget as HTMLElement).style.boxShadow =
            "var(--shadow-medium)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
        }}
      >
        {/* Image */}
        <div
          className="relative w-full aspect-square mb-3 overflow-hidden"
          style={{ borderRadius: "var(--radius-standard)" }}
        >
          <img
            src={imageUrl}
            alt={image.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />

          {/* Score badge */}
          {image.score != null && (
            <span
              className="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "#000",
                borderRadius: "var(--radius-full-pill)",
              }}
            >
              {(image.score * 100).toFixed(0)}%
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          className="text-sm font-bold truncate"
          style={{ color: "var(--color-text-primary)" }}
        >
          {image.title}
        </h3>

        {/* Summary */}
        <p
          className="text-xs mt-1 line-clamp-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {image.summary}
        </p>
      </div>
    </Link>
  );
}
