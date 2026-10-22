
import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await destroySession();

  return NextResponse.redirect(
    new URL("/login", request.url),
    303
  );
}
