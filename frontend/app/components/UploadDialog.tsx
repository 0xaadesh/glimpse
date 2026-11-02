"use client";

import { useState, useRef, useLayoutEffect } from "react";
import {
  uploadImage,
  generateMetadata,
  ingestImage,
  type GenerateResult,
} from "../lib/api";
import {
  DoneStep,
  ProgressStep,
  ReviewStep,
  StepIndicator,
  UploadStep,
  useObjectUrl,
} from "./UploadSteps";
import { CloseIcon } from "./icons";

interface UploadDialogProps {
  onClose: () => void;
  /** Called once the image is indexed, so lists can refetch. */
  onIngested: () => void;
  /** Element the dialog grows out of and returns to. */
  origin?: HTMLElement | null;
}

type Step = "upload" | "generating" | "review" | "ingesting" | "done";

const TITLES: Record<Step, string> = {
  upload: "Upload Image",
  generating: "Analyzing...",
  review: "Review Metadata",
  ingesting: "Indexing...",
  done: "Done!",
};

// Which of the three user-facing stages each step belongs to.
const STAGE: Record<Step, number> = {
  upload: 0,
  generating: 0,
  review: 1,
  ingesting: 2,
  done: 3,
};

export function UploadDialog({ onClose, onIngested, origin }: UploadDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Only read inside handlers, so a ref rather than state.
  const uploadedFilenameRef = useRef("");

  // Mount closed, then open on the next frame so the panel transitions in.
  // Closing flips back to "closed"; the fade's end unmounts us.
  // CSS transitions re-target from the current value, so reopening a
  // closing dialog (or vice versa) reverses smoothly with no jump.
  const [visualState, setVisualState] = useState<"open" | "closed">("closed");

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useObjectUrl(file);

  const busy = step === "generating" || step === "ingesting";

  // Native modal: top layer, focus trap, inert background, Escape.
  // The scale origin is anchored to the trigger's centre. Scaling about
  // the default (centre) origin keeps the rect's centre fixed, so the
  // measured centre is the layout centre.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    if (origin?.isConnected) {
      const o = origin.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      const left = d.left + d.width / 2 - dialog.offsetWidth / 2;
      const top = d.top + d.height / 2 - dialog.offsetHeight / 2;
      dialog.style.transformOrigin = `${o.left + o.width / 2 - left}px ${
        o.top + o.height / 2 - top
      }px`;
    }

    const frame = requestAnimationFrame(() => setVisualState("open"));
    return () => cancelAnimationFrame(frame);
  }, [origin]);

  function requestClose() {
    if (!busy) setVisualState("closed");
  }

  function handleTransitionEnd(e: React.TransitionEvent<HTMLDialogElement>) {
    if (
      e.target === e.currentTarget &&
      e.propertyName === "opacity" &&
      visualState === "closed"
    ) {
      onClose();
    }
  }

  // Escape fires "cancel": run the exit animation instead of closing now.
  function handleCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault();
    requestClose();
  }

  // A press on the backdrop targets the dialog itself, outside its box.
  function handlePointerDown(e: React.PointerEvent<HTMLDialogElement>) {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const inside =
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom;
    if (!inside) requestClose();
  }

  async function handleGenerate() {
    if (!file) return;
    setError(null);
    setStep("generating");

    try {
      const filename = await uploadImage(file);
      uploadedFilenameRef.current = filename;
      setResult(await generateMetadata(filename, description));
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStep("upload");
    }
  }

  async function handleIngest() {
    if (!uploadedFilenameRef.current) return;
    setError(null);
    setStep("ingesting");

    try {
      await ingestImage(uploadedFilenameRef.current);
      setStep("done");
      // Refetch the library in place (no page reload), let the success
      // state register, then play the normal exit animation.
      onIngested();
      setTimeout(() => setVisualState("closed"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
      setStep("review");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="upload-dialog-title"
      data-state={visualState}
      onCancel={handleCancel}
      onPointerDown={handlePointerDown}
      onTransitionEnd={handleTransitionEnd}
      className="dialog-panel m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto p-6 border-0"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        color: "var(--color-text-primary)",
        borderRadius: "var(--radius-comfortable)",
        boxShadow: "var(--shadow-heavy)",
      }}
    >
      {/* Close button */}
      {!busy && (
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="pressable pressable-muted hit-44 absolute top-4 right-4 w-8 h-8 flex items-center justify-center cursor-pointer"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            borderRadius: "50%",
            color: "var(--color-text-secondary)",
          }}
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      )}

      {/* ── Title + progress ── */}
      <h2 id="upload-dialog-title" className="text-xl font-bold pr-12">
        {TITLES[step]}
      </h2>
      <StepIndicator current={STAGE[step]} />


      {/* ── Error ── */}
      {error && (
        <div
          role="alert"
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

      {step === "upload" && (
        <UploadStep
          file={file}
          preview={preview}
          description={description}
          onFileSelect={setFile}
          onDescriptionChange={setDescription}
          onGenerate={handleGenerate}
        />
      )}
      {step === "generating" && (
        <ProgressStep message="AI is analyzing your image..." />
      )}
      {step === "review" && result && (
        <ReviewStep result={result} preview={preview} onIngest={handleIngest} />
      )}
      {step === "ingesting" && <ProgressStep message="Embedding and indexing..." />}
      {step === "done" && <DoneStep />}
    </dialog>
  );
}
