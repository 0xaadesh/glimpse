"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchImage, type IndexedImage } from "../../lib/api";

export default function ImageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const imageId = params.id as string;

  const [image, setImage] = useState<IndexedImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchImage(imageId)
      .then(setImage)
      .catch(() => setError("Image not found"))
      .finally(() => setLoading(false));
  }, [imageId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div
          className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
          style={{
            borderColor: "var(--color-accent)",
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p style={{ color: "var(--color-negative)" }}>
          {error ?? "Image not found"}
        </p>
        <button
          onClick={() => router.push("/")}
          className="px-5 py-2 text-sm font-bold uppercase cursor-pointer"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            borderRadius: "var(--radius-full-pill)",
            letterSpacing: "1.4px",
          }}
        >
          Back to Gallery
        </button>
      </div>
    );
  }

  const imageUrl = `/images/${image.filename}`;

  const tagSections: [string, string[]][] = [
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
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Back ── */}
      <button
        onClick={() => router.push("/")}
        className="inline-flex items-center gap-2 mb-6 px-4 py-2 text-sm font-bold uppercase cursor-pointer transition-colors"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-secondary)",
          borderRadius: "var(--radius-full-pill)",
          letterSpacing: "1px",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.color = "#fff")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.color =
            "var(--color-text-secondary)")
        }
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back
      </button>

      {/* ── Hero Image ── */}
      <div
        className="w-full overflow-hidden mb-8"
        style={{ borderRadius: "var(--radius-comfortable)" }}
      >
        <img
          src={imageUrl}
          alt={image.title}
          className="w-full max-h-[500px] object-contain"
          style={{ backgroundColor: "var(--color-bg-surface)" }}
        />
      </div>

      {/* ── Title & Summary ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-3">{image.title}</h1>
        <p
          className="text-base leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {image.summary}
        </p>
      </div>

      {/* ── Metadata Tags ── */}
      <div
        className="p-6 mb-8"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          borderRadius: "var(--radius-comfortable)",
        }}
      >
        <h2
          className="text-xs font-bold uppercase mb-5"
          style={{
            color: "var(--color-text-secondary)",
            letterSpacing: "1.4px",
          }}
        >
          AI-Generated Metadata
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          {tagSections
            .filter(([, items]) => items.length > 0)
            .map(([label, items]) => (
              <div key={label}>
                <p
                  className="text-xs font-semibold uppercase mb-2"
                  style={{
                    color: "var(--color-accent)",
                    letterSpacing: "0.8px",
                  }}
                >
                  {label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <span
                      key={item}
                      className="px-2.5 py-1 text-xs"
                      style={{
                        backgroundColor: "var(--color-bg-elevated)",
                        color: "var(--color-text-bright)",
                        borderRadius: "var(--radius-full-pill)",
                      }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* ── Semantic Document ── */}
      <div
        className="p-6"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          borderRadius: "var(--radius-comfortable)",
        }}
      >
        <h2
          className="text-xs font-bold uppercase mb-4"
          style={{
            color: "var(--color-text-secondary)",
            letterSpacing: "1.4px",
          }}
        >
          Semantic Document
        </h2>
        <pre
          className="text-sm whitespace-pre-wrap leading-relaxed"
          style={{ color: "var(--color-text-bright)" }}
        >
          {image.semantic_document}
        </pre>
      </div>
    </div>
  );
}
