import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { fromThisSite, siteOrigin } from "@/lib/same-origin";

export async function POST(request: NextRequest) {
  if (!fromThisSite(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await destroySession();

  return NextResponse.redirect(new URL("/login", siteOrigin(request)), 303);
}
