/**
 * Uploaded files (PDFs, images) live on the server's disk under public/uploads
 * and are served at /uploads/<name>. A runsheet only stores a link to its PDF,
 * so the row can outlive the file (a server move or a disk that isn't kept
 * between deploys). These helpers check the file is really there before the
 * app offers it to anyone.
 */
import fs from "fs";
import path from "path";

export function uploadsDir(): string {
  return path.join(process.cwd(), "public", "uploads");
}

/** The only links a runsheet attachment may hold: a PDF that /api/upload-pdf saved. */
export const UPLOAD_PDF_URL_RE = /^\/uploads\/[A-Za-z0-9._-]+\.pdf$/;

/** Whether an "/uploads/<name>" link still points at a file on disk. */
export function uploadExists(url: unknown, dir: string = uploadsDir()): boolean {
  if (typeof url !== "string" || !/^\/uploads\/[A-Za-z0-9._-]+$/.test(url)) return false;
  const root = path.resolve(dir);
  const file = path.resolve(root, url.slice("/uploads/".length));
  // "/uploads/.." and "/uploads/." match the name pattern; never leave the folder.
  if (!file.startsWith(root + path.sep)) return false;
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export type RunsheetAttachment = {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
  uploadedAt: number;
};

function asList(value: unknown): RunsheetAttachment[] {
  return Array.isArray(value) ? (value.filter(a => a && typeof a === "object") as RunsheetAttachment[]) : [];
}

/** For the runsheet builder: every attachment, each marked `missing` when its file is gone. */
export function withFileStatus(
  value: unknown,
  dir: string = uploadsDir(),
): Array<RunsheetAttachment & { missing: boolean }> {
  return asList(value).map(a => ({ ...a, missing: !uploadExists(a.url, dir) }));
}

/**
 * For the public staff link: only PDFs this server saved and still has. A link
 * to a lost file would just open an error page on a staff member's phone.
 */
export function staffLinkAttachments(
  value: unknown,
  dir: string = uploadsDir(),
): Array<Pick<RunsheetAttachment, "id" | "name" | "url" | "size">> {
  return asList(value)
    .filter(a => typeof a.url === "string" && UPLOAD_PDF_URL_RE.test(a.url) && uploadExists(a.url, dir))
    .map(a => ({ id: String(a.id), name: String(a.name ?? "Attachment"), url: a.url, size: Number(a.size) || 0 }));
}
