"use client";

import { useState, useRef, useEffect } from "react";
import {
  uploadImage,
  generateMetadata,
  ingestImage,
  type GenerateResult,
} from "../lib/api";
import { useRouter } from "next/navigation";

interface UploadDialogProps {
  onClose: () => void;
}

type Step = "upload" | "generating" | "review" | "ingesting" | "done";

export function UploadDialog({ onClose }: UploadDialogProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [uploadedFilename, setUploadedFilename] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  }

  // Paste an image from the clipboard (Ctrl+V) while on the upload step.
  useEffect(() => {
    if (step !== "upload") return;

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
      selectFile(
        new File([pasted], `pasted-${Date.now()}.${ext}`, { type: pasted.type })
      );
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [step]);

  async function handleGenerate() {
    if (!file || !description.trim()) return;
    setError(null);
    setStep("generating");

    try {
      const filename = await uploadImage(file);
      setUploadedFilename(filename);
      const gen = await generateMetadata(filename, description);
      setResult(gen);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStep("upload");
    }
  }

  async function handleIngest() {
    if (!uploadedFilename) return;
    setError(null);
    setStep("ingesting");

    try {
      await ingestImage(uploadedFilename);
      setStep("done");
      setTimeout(() => {
        onClose();
        router.refresh();
        window.location.reload();
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
      setStep("review");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "generating" && step !== "ingesting")
          onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 p-6"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          borderRadius: "var(--radius-comfortable)",
          boxShadow: "var(--shadow-heavy)",
        }}
      >
        {/* Close button */}
        {step !== "generating" && step !== "ingesting" && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              borderRadius: "50%",
              color: "var(--color-text-secondary)",
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLElement).style.color = "#fff")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLElement).style.color =
                "var(--color-text-secondary)")
            }
          >
            ✕
          </button>
        )}

        {/* ── Title ── */}
        <h2 className="text-xl font-bold mb-6">
          {step === "upload" && "Upload Image"}
          {step === "generating" && "Analyzing..."}
          {step === "review" && "Review Metadata"}
          {step === "ingesting" && "Indexing..."}
          {step === "done" && "Done!"}
        </h2>

        {/* ── Error ── */}
        {error && (
          <div
            className="mb-4 px-4 py-2 text-sm"
            style={{
              backgroundColor: "rgba(243,114,127,0.1)",
              color: "var(--color-negative)",
              borderRadius: "var(--radius-standard)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Step: Upload ── */}
        {step === "upload" && (
          <div className="space-y-5">
            {/* Drop zone */}
            <div
              className="flex flex-col items-center justify-center gap-3 p-8 cursor-pointer transition-colors"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                borderRadius: "var(--radius-comfortable)",
                border: "2px dashed var(--color-border)",
              }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-48 object-contain"
                  style={{ borderRadius: "var(--radius-standard)" }}
                />
              ) : (
                <>
                  <svg
                    className="w-10 h-10"
                    style={{ color: "var(--color-text-secondary)" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
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
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {file.name}
              </p>
            )}

            {/* Description */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Description
              </label>
              <input
                id="description-input"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. cat staring at camera looking nonchalant"
                className="w-full py-2.5 px-4 text-sm outline-none"
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
              onClick={handleGenerate}
              disabled={!file || !description.trim()}
              className="w-full py-3 text-sm font-bold uppercase transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor:
                  file && description.trim()
                    ? "var(--color-accent)"
                    : "var(--color-bg-elevated)",
                color:
                  file && description.trim()
                    ? "#000"
                    : "var(--color-text-secondary)",
                borderRadius: "var(--radius-pill)",
                letterSpacing: "1.4px",
              }}
            >
              Generate Metadata
            </button>
          </div>
        )}

        {/* ── Step: Generating ── */}
        {step === "generating" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div
              className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
            />
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              AI is analyzing your image...
            </p>
          </div>
        )}

        {/* ── Step: Review ── */}
        {step === "review" && result && (
          <div className="space-y-5">
            {/* Image preview */}
            {preview && (
              <img
                src={preview}
                alt="Uploaded"
                className="w-full max-h-56 object-contain"
                style={{ borderRadius: "var(--radius-standard)" }}
              />
            )}

            {/* Title & Summary */}
            <div>
              <h3 className="text-lg font-bold">{result.metadata.title}</h3>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {result.metadata.summary}
              </p>
            </div>

            {/* Tags grid */}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["People", result.metadata.people],
                  ["Objects", result.metadata.objects],
                  ["Actions", result.metadata.actions],
                  ["Setting", result.metadata.setting],
                  ["Emotions", result.metadata.emotions],
                  ["Concepts", result.metadata.concepts],
                  ["Keywords", result.metadata.keywords],
                  ["Usage Contexts", result.metadata.usage_contexts],
                ] as [string, string[]][]
              )
                .filter(([, items]) => items.length > 0)
                .map(([label, items]) => (
                  <div key={label}>
                    <p
                      className="text-xs font-semibold mb-1 uppercase"
                      style={{
                        color: "var(--color-text-secondary)",
                        letterSpacing: "1px",
                      }}
                    >
                      {label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <span
                          key={item}
                          className="px-2.5 py-0.5 text-xs"
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

            {/* Semantic document preview */}
            <details>
              <summary
                className="text-xs font-semibold uppercase cursor-pointer"
                style={{
                  color: "var(--color-text-secondary)",
                  letterSpacing: "1px",
                }}
              >
                Semantic Document
              </summary>
              <pre
                className="mt-2 text-xs whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto"
                style={{ color: "var(--color-text-bright)" }}
              >
                {result.semantic_document}
              </pre>
            </details>

            {/* Ingest button */}
            <button
              id="ingest-button"
              onClick={handleIngest}
              className="w-full py-3 text-sm font-bold uppercase transition-all cursor-pointer"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "#000",
                borderRadius: "var(--radius-pill)",
                letterSpacing: "1.4px",
              }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.filter = "brightness(1.1)")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.filter = "brightness(1)")
              }
            >
              Ingest Into Store
            </button>
          </div>
        )}

        {/* ── Step: Ingesting ── */}
        {step === "ingesting" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div
              className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
            />
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Embedding and indexing...
            </p>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div
              className="w-12 h-12 flex items-center justify-center text-2xl"
              style={{
                backgroundColor: "rgba(30,215,96,0.15)",
                color: "var(--color-accent)",
                borderRadius: "50%",
              }}
            >
              ✓
            </div>
            <p className="text-sm font-semibold">
              Image indexed successfully!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
