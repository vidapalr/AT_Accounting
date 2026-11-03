import { NextRequest, NextResponse } from "next/server";
import {
  verifyCredentials,
  createSession,
} from "@/lib/auth";
import { hasTwoStep, startChallenge } from "@/lib/two-step";
import { tooManyAttempts, recordWrongPassword, tidyAfterLogin } from "@/lib/login-guard";

export async function POST(request: NextRequest) {
  const publicOrigin =
    process.env.NODE_ENV === "production"
      ? "https://accounting.abhiraminc.com"
      : request.nextUrl.origin;

  const origin = request.headers.get("origin");

  if (!origin || origin !== publicOrigin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();

  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  const loginUrl = new URL("/login", publicOrigin);

  if (
    email.length > 190 ||
    password.length > 1024 ||
    !email.trim() ||
    !password
  ) {
    loginUrl.searchParams.set("error", "1");
    return NextResponse.redirect(loginUrl, 303);
  }

  const cleanEmail = email.trim().toLowerCase();
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);

  try {
    if (await tooManyAttempts(cleanEmail, ip)) {
      loginUrl.searchParams.set("error", "3");
      return NextResponse.redirect(loginUrl, 303);
    }

    const user = await verifyCredentials(email, password);

    if (!user) {
      await recordWrongPassword(cleanEmail, ip);
      loginUrl.searchParams.set("error", "1");
      return NextResponse.redirect(loginUrl, 303);
    }

    if (await hasTwoStep(user.id)) {
      await startChallenge(user.id);
      await tidyAfterLogin(cleanEmail);
      return NextResponse.redirect(new URL("/login/code", publicOrigin), 303);
    }

    await createSession(user.id);
    await tidyAfterLogin(cleanEmail);

    return NextResponse.redirect(
      new URL("/dashboard", publicOrigin),
      303
    );
  } catch (error) {
    console.error("Login error:", error);

    loginUrl.searchParams.set("error", "2");
    return NextResponse.redirect(loginUrl, 303);
  }
}