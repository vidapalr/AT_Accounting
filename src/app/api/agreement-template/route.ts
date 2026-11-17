
import { requireGroupOwner } from "@/lib/auth";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  await requireGroupOwner();

  const templatePath = path.join(
    process.cwd(),
    "private_templates",
    "profit_participation_agreement_blank.docx"
  );

  try {
    const file = await readFile(templatePath);

    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition":
          'attachment; filename="profit_participation_agreement.docx"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "Agreement template download failed:",
      error
    );

    return Response.json(
      { error: "Agreement template unavailable." },
      { status: 404 }
    );
  }
}
