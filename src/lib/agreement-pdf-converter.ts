
import "server-only";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export async function convertAgreementToPdf(
  wordBuffer: Buffer
): Promise<Buffer> {
  const configured = process.env.LIBREOFFICE_PATH;

  const executable =
    configured?.trim() ||
    (process.platform === "win32"
      ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
      : "libreoffice");

  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "abhiram-pdf-")
  );

  const filename = `${randomUUID()}.docx`;
  const input = path.join(temporary, filename);
  const output = path.join(
    temporary,
    filename.replace(/\.docx$/, ".pdf")
  );

  const profile = path.join(temporary, "lo-profile");

  try {
    await writeFile(input, wordBuffer, {
      flag: "wx",
      mode: 0o600,
    });

    await new Promise<void>((resolve, reject) => {
      const args = [
        `-env:UserInstallation=${new URL(
          `file:///${profile.replaceAll("\\", "/")}`
        ).toString()}`,
        "--headless",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        temporary,
        input,
      ];

      // LibreOffice is installed on the host, not bundled with the application.
      const child = spawn(/* turbopackIgnore: true */ executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      let settled = false;

      const timeout = setTimeout(() => {
        child.kill();
        finish(new Error("PDF conversion timed out"));
      }, 45_000);

      function finish(error?: Error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (error) reject(error);
        else resolve();
      }

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString().slice(0, 1000);
      });

      child.on("error", (error) => finish(error));

      child.on("close", (code) => {
        if (code !== 0) {
          finish(
            new Error(
              `LibreOffice conversion failed: ${stderr}`
            )
          );
        } else {
          finish();
        }
      });
    });

    const pdf = await readFile(output);

    if (
      pdf.length < 100 ||
      pdf.subarray(0, 5).toString() !== "%PDF-"
    ) {
      throw new Error("PDF converter returned an invalid file");
    }

    return pdf;
  } finally {
    await rm(temporary, {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
}
