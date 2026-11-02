"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "./icons";
import { useUpload } from "./UploadProvider";

export function Navbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const { openUpload } = useUpload();

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    router.push(trimmed ? `/?q=${encodeURIComponent(trimmed)}` : "/");
  }

  return (
    <nav aria-label="Main" className="nav-material sticky top-0 z-50">
      <div className="page-container flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      {/* ── Brand ── */}
      <Link
        href="/"
        className="pressable shrink-0 inline-flex items-center min-h-11 text-lg font-bold tracking-tight"
        style={{ color: "var(--color-accent)" }}
      >
        Glimpse
      </Link>

      {/* ── Search: own row on phones, centred column from sm up ── */}
      <form
        onSubmit={handleSearch}
        role="search"
        className="order-last w-full sm:order-none sm:w-auto sm:flex-1 max-w-xl sm:mx-auto"
      >
        <div className="relative">
          <span
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <SearchIcon className="w-4 h-4" strokeWidth={1.5} />
          </span>
          {/*
            Uncontrolled and keyed by the URL query: whenever the URL's
            ?q= changes (Clear Search, Back/Forward, a link), the input
            remounts showing the query the page is actually displaying.
          */}
          <input
            key={urlQuery}
            id="search-input"
            name="q"
            type="search"
            enterKeyHint="search"
            aria-label="Search images"
            defaultValue={urlQuery}
            placeholder="Search images..."
            className="field w-full min-h-11 py-2.5 pl-11 pr-4 text-base sm:text-sm outline-none"
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
        type="button"
        onClick={(e) => openUpload(e.currentTarget)}
        className="pressable pressable-elevated shrink-0 ml-auto sm:ml-0 min-h-11 px-5 text-sm font-bold uppercase cursor-pointer"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          borderRadius: "var(--radius-full-pill)",
          letterSpacing: "0.1em",
        }}
      >
        Upload
      </button>
      </div>
    </nav>
  );
}
