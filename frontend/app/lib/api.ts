/**
 * Glimpse API client.
 *
 * All calls go through Next.js rewrites → FastAPI on :8000.
 */

export interface IndexedImage {
  id: string;
  filename: string;
  image_path: string;
  title: string;
  summary: string;
  semantic_document: string;
  people: string[];
  objects: string[];
  actions: string[];
  setting: string[];
  clothing: string[];
  emotions: string[];
  concepts: string[];
  keywords: string[];
  possible_search_queries: string[];
  usage_contexts: string[];
  score?: number | null;
}

export interface GenerateResult {
  filename: string;
  metadata: {
    title: string;
    summary: string;
    people: string[];
    objects: string[];
    actions: string[];
    setting: string[];
    clothing: string[];
    emotions: string[];
    concepts: string[];
    keywords: string[];
    possible_search_queries: string[];
    usage_contexts: string[];
  };
  semantic_document: string;
}

// ── List all images ──

export async function fetchImages(): Promise<IndexedImage[]> {
  const res = await fetch("/api/images");
  if (!res.ok) throw new Error("Failed to fetch images");
  const data = await res.json();
  return data.images;
}

// ── Single image ──

/** Thrown when the backend has no image with the requested id. */
export class NotFoundError extends Error {
  constructor(message = "Image not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export async function fetchImage(id: string): Promise<IndexedImage> {
  const res = await fetch(`/api/images/${id}`);
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) throw new Error("Failed to load image");
  return res.json();
}

// ── Search ──

export async function searchImages(
  query: string,
  limit = 10
): Promise<IndexedImage[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`/api/search?${params}`);
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  return data.results;
}

// ── Upload ──

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.filename;
}

// ── Generate ──

export async function generateMetadata(
  filename: string,
  description: string
): Promise<GenerateResult> {
  const form = new FormData();
  form.append("filename", filename);
  form.append("description", description);
  const res = await fetch("/api/generate", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? "Generation failed");
  }
  return res.json();
}

// ── Ingest ──

export async function ingestImage(filename: string): Promise<void> {
  const form = new FormData();
  form.append("filename", filename);
  const res = await fetch("/api/ingest", { method: "POST", body: form });
  if (!res.ok) throw new Error("Ingest failed");
}
