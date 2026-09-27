"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UploadDialog } from "./UploadDialog";

export function Navbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [showUpload, setShowUpload] = useState(false);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/");
    }
  }

  return (
    <>
      <nav
        className="sticky top-0 z-50 flex items-center gap-4 px-6 py-3"
        style={{
          backgroundColor: "var(--color-bg-base)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* ── Brand ── */}
        <a
          href="/"
          className="shrink-0 text-lg font-bold tracking-tight"
          style={{ color: "var(--color-accent)" }}
        >
          Glimpse
        </a>

        {/* ── Search ── */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-auto">
          <div className="relative">
            {/* Search icon */}
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--color-text-secondary)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              id="search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search images..."
              className="w-full py-2.5 pl-11 pr-4 text-sm outline-none transition-all"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
                borderRadius: "var(--radius-pill)",
                boxShadow: "var(--shadow-inset)",
              }}
            />
          </div>
        </form>

        {/* ── Upload Button ── */}
        <button
          id="upload-button"
          onClick={() => setShowUpload(true)}
          className="shrink-0 px-5 py-2 text-sm font-bold uppercase transition-all cursor-pointer"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            borderRadius: "var(--radius-full-pill)",
            letterSpacing: "1.4px",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.backgroundColor = "#2a2a2a";
            (e.target as HTMLElement).style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.backgroundColor =
              "var(--color-bg-elevated)";
            (e.target as HTMLElement).style.transform = "scale(1)";
          }}
        >
          Upload
        </button>
      </nav>

      {/* ── Upload Dialog ── */}
      {showUpload && (
        <UploadDialog onClose={() => setShowUpload(false)} />
      )}
    </>
  );
}
