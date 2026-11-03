import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { readChallenge, endChallenge, countWrongCode, checkLoginCode, MAX_CODE_TRIES } from "@/lib/two-step";

export async function POST(request: NextRequest) {
  const publicOrigin =
    process.env.NODE_ENV === "production" ? "https://accounting.abhiraminc.com" : request.nextUrl.origin;
  if (request.headers.get("origin") !== publicOrigin) return new NextResponse("Forbidden", { status: 403 });

  const codeUrl = new URL("/login/code", publicOrigin);
  const loginUrl = new URL("/login", publicOrigin);
  try {
    const challenge = await readChallenge();
    if (!challenge) {
      loginUrl.searchParams.set("error", "4");
      return NextResponse.redirect(loginUrl, 303);
    }
    if (challenge.attempts >= MAX_CODE_TRIES) {
      await endChallenge(challenge.hash);
      loginUrl.searchParams.set("error", "5");
      return NextResponse.redirect(loginUrl, 303);
    }
    const typed = String((await request.formData()).get("code") ?? "").slice(0, 40);
    if (!(await checkLoginCode(challenge.userId, typed))) {
      await countWrongCode(challenge.hash);
      codeUrl.searchParams.set("error", "1");
      return NextResponse.redirect(codeUrl, 303);
    }
    await endChallenge(challenge.hash);
    await createSession(challenge.userId);
    return NextResponse.redirect(new URL("/dashboard", publicOrigin), 303);
  } catch (error) {
    console.error("Two-step login error:", error);
    loginUrl.searchParams.set("error", "2");
    return NextResponse.redirect(loginUrl, 303);
  }
}
