"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";
import { UploadDialog } from "./UploadDialog";

interface UploadContextValue {
  /** Open the upload dialog, growing out of `origin` when given. */
  openUpload: (origin?: HTMLElement | null) => void;
  /** Bumps after every successful ingest, so lists can refetch. */
  libraryVersion: number;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUpload(): UploadContextValue {
  const value = use(UploadContext);
  if (!value) throw new Error("useUpload must be used inside <UploadProvider>");
  return value;
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [libraryVersion, setLibraryVersion] = useState(0);

  const openUpload = useCallback((from?: HTMLElement | null) => {
    setOrigin(from ?? null);
    setIsOpen(true);
  }, []);

  const value = useMemo(
    () => ({ openUpload, libraryVersion }),
    [openUpload, libraryVersion]
  );

  return (
    <UploadContext value={value}>
      {children}
      {isOpen && (
        <UploadDialog
          origin={origin}
          onClose={() => setIsOpen(false)}
          onIngested={() => setLibraryVersion((v) => v + 1)}
        />
      )}
    </UploadContext>
  );
}
