import { GET as downloadDocument } from "../route";
import type { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  return downloadDocument(request, context);
}
