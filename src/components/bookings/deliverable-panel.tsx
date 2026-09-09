"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  prepareDeliverableUploadAction,
  recordDeliverableAction,
} from "@/actions/deliverables";
import { Button } from "@/components/ui/button";
import { MAX_UPLOAD_BYTES, UPLOAD_MIME_ALLOWLIST } from "@/lib/validation";

export type DeliverableView = {
  id: string;
  version: number;
  fileName: string;
  storageKey: string;
  createdAt: string;
};

/**
 * Workspace deliverables: the creator PUTs through the existing presign port,
 * then a row lands in `deliverables`. Participants download via presignGet
 * (GET /api/uploads) — a stranger's request is 403.
 */
export function DeliverablePanel({
  bookingId,
  files,
  canUpload,
}: {
  bookingId: string;
  files: DeliverableView[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function onUpload(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a file to upload.");
      return;
    }
    if (!UPLOAD_MIME_ALLOWLIST.has(file.type)) {
      setError("Unsupported file type.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File is too large.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareDeliverableUploadAction({
        bookingId,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if ("error" in prepared && prepared.error) {
        setError(prepared.error);
        return;
      }
      if (!("url" in prepared) || !("key" in prepared)) {
        setError("Could not prepare the upload.");
        return;
      }
      const put = await fetch(prepared.url, { method: "PUT", body: file });
      if (!put.ok) {
        setError("Upload did not complete. Try again.");
        return;
      }
      const recorded = await recordDeliverableAction({
        bookingId,
        storageKey: prepared.key,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        note: String(data.get("note") ?? ""),
      });
      if (recorded.error) {
        setError(recorded.error);
        return;
      }
      form.reset();
      setNote("");
      router.refresh();
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(storageKey: string) {
    setDownloading(storageKey);
    setError(null);
    try {
      const params = new URLSearchParams({ bookingId, key: storageKey });
      const res = await fetch(`/api/uploads?${params.toString()}`);
      if (res.status === 403) {
        setError("You do not have access to this file.");
        return;
      }
      if (!res.ok) {
        setError("Could not open this file.");
        return;
      }
      const body = (await res.json()) as { url?: string };
      if (!body.url) {
        setError("Could not open this file.");
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Could not open this file.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <ul className="space-y-2">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 rounded border border-line bg-canvas px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate text-text">
              v{f.version} · {f.fileName}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-text-faint">{f.createdAt}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={downloading === f.storageKey}
                onClick={() => onDownload(f.storageKey)}
              >
                {downloading === f.storageKey ? "Opening…" : "Download"}
              </Button>
            </span>
          </li>
        ))}
        {files.length === 0 && (
          <li className="text-sm text-text-muted">
            {canUpload
              ? "No versions yet. Upload a file to share it with the brand."
              : "No versions yet. They appear here when the creator uploads."}
          </li>
        )}
      </ul>

      {canUpload && (
        <form
          className="mt-4 space-y-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onUpload(e.currentTarget);
          }}
        >
          <label className="block text-sm text-text-muted">
            New version
            <input
              type="file"
              name="file"
              required
              disabled={busy}
              className="mt-1.5 block w-full text-sm text-text file:mr-3 file:rounded file:border-0 file:bg-beam file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-canvas"
            />
          </label>
          <label className="block text-sm text-text-muted">
            Note (optional)
            <textarea
              name="note"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              placeholder="What changed in this version"
              className="mt-1.5 w-full rounded border border-line bg-canvas px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-beam/60 disabled:opacity-50"
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Upload version"}
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
