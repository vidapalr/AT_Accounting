import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const publicOrigin =
    process.env.NODE_ENV === "production"
      ? "https://accounting.abhiraminc.com"
      : request.nextUrl.origin;

  const origin = request.headers.get("origin");

  if (!origin || origin !== publicOrigin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await destroySession();

  return NextResponse.redirect(
    new URL("/login", publicOrigin),
    303
  );
}