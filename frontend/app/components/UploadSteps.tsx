"use client";

import { useEffect, useRef, useState } from "react";
import type { GenerateResult } from "../lib/api";
import { CheckIcon, ChevronIcon, ImageIcon } from "./icons";
import { TagGroups, type TagGroup } from "./TagGroups";

/**
 * Object URL for a file, revoked when the file changes or the caller
 * unmounts so preview blobs never leak.
 */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [file]);

  return url;
}

/* ── Progress: Upload → Review → Index ── */

const STAGES = ["Upload", "Review", "Index"];

/** `current` is the active stage index; STAGES.length means all done. */
export function StepIndicator({ current }: { current: number }) {
  const label =
    current >= STAGES.length
      ? "All steps complete"
      : `Step ${current + 1} of ${STAGES.length}: ${STAGES[current]}`;

  return (
    <ol aria-label={label} className="flex items-center gap-2 mt-3 mb-6">
      {STAGES.map((name, i) => {
        const state = i < current ? "complete" : i === current ? "current" : "upcoming";
        return (
          <li
            key={name}
            aria-current={state === "current" ? "step" : undefined}
            className="flex items-center gap-2 text-xs font-semibold"
            style={{
              color:
                state === "upcoming"
                  ? "var(--color-text-secondary)"
                  : "var(--color-text-primary)",
            }}
          >
            <span
              aria-hidden="true"
              className="step-dot w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  state === "upcoming" ? "var(--color-border)" : "var(--color-accent)",
              }}
            />
            {name}
            {i < STAGES.length - 1 && (
              <span
                aria-hidden="true"
                className="w-6 h-px"
                style={{ backgroundColor: "var(--color-border)" }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Step: Upload ── */

interface UploadStepProps {
  file: File | null;
  preview: string | null;
  description: string;
  onFileSelect: (file: File) => void;
  onDescriptionChange: (value: string) => void;
  onGenerate: () => void;
}

export function UploadStep({
  file,
  preview,
  description,
  onFileSelect,
  onDescriptionChange,
  onGenerate,
}: UploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Paste an image from the clipboard (Ctrl+V) while this step is shown.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find(
        (i) => i.kind === "file" && i.type.startsWith("image/")
      );
      const pasted = item?.getAsFile();
      if (!pasted) return;

      e.preventDefault();
      // Clipboard images are all named "image.png"; give each a unique
      // name so it does not overwrite an earlier upload on the backend.
      const ext = pasted.type.split("/")[1] ?? "png";
      onFileSelect(
        new File([pasted], `pasted-${Date.now()}.${ext}`, { type: pasted.type })
      );
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onFileSelect]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFileSelect(f);
  }

  return (
    <div className="step-enter space-y-5">
      {/* Drop zone: highlights continuously while a file hovers it */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose an image"
        data-dragging={isDragging}
        className="dropzone pressable flex flex-col items-center justify-center gap-3 p-8 cursor-pointer"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          borderRadius: "var(--radius-comfortable)",
          border: "2px dashed var(--color-border)",
        }}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDragging) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        {preview ? (
          <img
            src={preview}
            alt="Preview"
            className="image-outline max-h-48 object-contain"
            style={{ borderRadius: "var(--radius-standard)" }}
          />
        ) : (
          <>
            <span style={{ color: "var(--color-text-secondary)" }}>
              <ImageIcon className="w-10 h-10" strokeWidth={1.5} />
            </span>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Drop, paste (Ctrl+V), or click to browse
            </p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* File name */}
      {file && (
        <p className="text-xs truncate -mt-2" title={file.name} style={{ color: "var(--color-text-secondary)" }}>
          {file.name}
        </p>
      )}

      {/* Description */}
      <div>
        <label
          htmlFor="description-input"
          className="block text-sm font-semibold mb-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Description{" "}
          <span className="font-normal">(optional)</span>
        </label>
        <input
          id="description-input"
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="e.g. cat staring at camera looking nonchalant"
          className="field w-full min-h-11 py-2.5 px-4 text-base sm:text-sm outline-none"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            borderRadius: "var(--radius-pill)",
            boxShadow: "var(--shadow-inset)",
          }}
        />
      </div>

      {/* Generate button */}
      <button
        id="generate-button"
        onClick={onGenerate}
        disabled={!file}
        type="button"
        className="pressable pressable-accent w-full py-3 text-sm font-bold uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: file ? "var(--color-accent)" : "var(--color-bg-elevated)",
          color: file ? "#000" : "var(--color-text-secondary)",
          borderRadius: "var(--radius-pill)",
          letterSpacing: "0.1em",
        }}
      >
        Generate Metadata
      </button>
    </div>
  );
}

/* ── Step: Review ── */

interface ReviewStepProps {
  result: GenerateResult;
  preview: string | null;
  onIngest: () => void;
}

export function ReviewStep({ result, preview, onIngest }: ReviewStepProps) {
  const { metadata } = result;
  const tagGroups: TagGroup[] = [
    ["People", metadata.people],
    ["Objects", metadata.objects],
    ["Actions", metadata.actions],
    ["Setting", metadata.setting],
    ["Emotions", metadata.emotions],
    ["Concepts", metadata.concepts],
    ["Keywords", metadata.keywords],
    ["Usage Contexts", metadata.usage_contexts],
  ];

  return (
    <div className="step-enter">
      {/* Preview beside the generated text from md up, stacked below */}
      <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
        {preview && (
          <div
            className="image-outline overflow-hidden md:sticky md:top-0"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              borderRadius: "var(--radius-standard)",
            }}
          >
            <img src={preview} alt="Uploaded" className="w-full max-h-56 md:max-h-72 object-contain" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-balance">{metadata.title}</h3>
          <p className="text-sm mt-1 leading-relaxed text-pretty" style={{ color: "var(--color-text-secondary)" }}>
            {metadata.summary}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <TagGroups groups={tagGroups} />
      </div>

      <details className="disclosure mt-6">
        <summary className="flex items-center justify-between gap-3 min-h-11 cursor-pointer list-none">
          <span
            className="text-xs font-semibold uppercase"
            style={{ color: "var(--color-text-secondary)", letterSpacing: "0.08em" }}
          >
            Semantic Document
          </span>
          <span className="disclosure-chevron shrink-0" style={{ color: "var(--color-text-secondary)" }}>
            <ChevronIcon className="w-4 h-4" strokeWidth={2.5} />
          </span>
        </summary>
        <pre
          className="mt-2 text-xs whitespace-pre-wrap wrap-anywhere leading-relaxed"
          style={{ color: "var(--color-text-bright)" }}
        >
          {result.semantic_document}
        </pre>
      </details>

      {/* Action stays reachable however long the metadata is */}
      <div className="dialog-actions">
        <button
          id="ingest-button"
          onClick={onIngest}
          type="button"
          className="pressable pressable-accent w-full min-h-11 py-3 text-sm font-bold uppercase cursor-pointer"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "#000",
            borderRadius: "var(--radius-pill)",
            letterSpacing: "0.1em",
          }}
        >
          Ingest Into Store
        </button>
      </div>
    </div>
  );
}

/* ── Steps: Generating / Ingesting (spinner) ── */

export function ProgressStep({ message }: { message: string }) {
  return (
    <div role="status" className="step-enter flex flex-col items-center gap-4 py-12">
      <div
        className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
      />
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {message}
      </p>
    </div>
  );
}

/* ── Step: Done ── */

export function DoneStep() {
  return (
    <div role="status" className="step-enter flex flex-col items-center gap-4 py-12">
      <div
        className="w-12 h-12 flex items-center justify-center"
        style={{
          backgroundColor: "rgba(30,215,96,0.15)",
          color: "var(--color-accent)",
          borderRadius: "50%",
        }}
      >
        <CheckIcon className="w-6 h-6" strokeWidth={2.5} />
      </div>
      <p className="text-sm font-semibold">Image indexed successfully!</p>
    </div>
  );
}
