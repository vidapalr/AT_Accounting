
import "server-only";

import path from "node:path";
import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";

const PRIVATE_ROOT = path.resolve(
  process.cwd(),
  "private_uploads"
);

export function resolvePrivateDocument(
  storageKey: string
): string {
  if (
    !storageKey ||
    storageKey.includes("\0") ||
    path.isAbsolute(storageKey) ||
    /^[A-Za-z]:/.test(storageKey)
  ) {
    throw new Error("Invalid storage key");
  }

  const resolved = path.resolve(
    PRIVATE_ROOT,
    storageKey
  );

  if (
    resolved === PRIVATE_ROOT ||
    !resolved.startsWith(PRIVATE_ROOT + path.sep)
  ) {
    throw new Error("Document path is outside storage");
  }

  return resolved;
}

export async function readPrivateDocument(
  storageKey: string
) {
  return readFile(resolvePrivateDocument(storageKey));
}

export function detectPreviewType(
  filename: string,
  mime: string
): "PDF" | "IMAGE" | "DOCX" | "UNSUPPORTED" {
  const extension = path.extname(filename).toLowerCase();

  if (
    extension === ".pdf" &&
    mime === "application/pdf"
  ) {
    return "PDF";
  }

  if (
    [".jpg", ".jpeg", ".png", ".webp"].includes(extension) &&
    ["image/jpeg", "image/png", "image/webp"].includes(mime)
  ) {
    return "IMAGE";
  }

  if (
    extension === ".docx" &&
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "DOCX";
  }

  return "UNSUPPORTED";
}

export async function convertWordToSafeHtml(
  buffer: Buffer
): Promise<string> {
  const result = await mammoth.convertToHtml({
    buffer,
  });

  const cleaned = sanitizeHtml(result.value, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i",
      "u", "s", "h1", "h2", "h3", "h4",
      "ul", "ol", "li", "table", "thead",
      "tbody", "tr", "td", "th", "blockquote",
      "div", "span", "img",
    ],
    allowedAttributes: {
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: [],
    allowedSchemesByTag: {
      img: ["data"],
    },
    allowedStyles: {},
  });

  return cleaned;
}

export function wordPreviewHtml(
  title: string,
  content: string
): string {
  const escapedTitle = title.replace(
    /[&<>"']/g,
    (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return entities[character];
    }
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<style>
  body {
    margin: 0 auto;
    max-width: 920px;
    padding: 35px;
    font-family: Arial, sans-serif;
    color: #14233a;
    line-height: 1.65;
    background: white;
  }
  h1, h2, h3 { color: #133b7c; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 9px;
    vertical-align: top;
  }
  img { max-width: 100%; height: auto; }
  blockquote {
    border-left: 3px solid #1d5eb5;
    margin-left: 0;
    padding-left: 16px;
  }
  @media(max-width:600px) {
    body { padding: 16px; }
  }
</style>
</head>
<body>
  <div role="note"
    style="padding:12px;background:#eef4ff;
      border:1px solid #c7d8f5;margin-bottom:24px">
    Word reading preview. Layout and pagination may differ
    from the original document.
  </div>
  ${content}
</body>
</html>`;
}
