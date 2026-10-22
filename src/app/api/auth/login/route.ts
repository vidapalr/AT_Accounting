
import { NextRequest, NextResponse } from "next/server";
import {
  verifyCredentials,
  createSession,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();

  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  const loginUrl = new URL("/login", request.url);

  if (
    email.length > 190 ||
    password.length > 1024 ||
    !email.trim() ||
    !password
  ) {
    loginUrl.searchParams.set("error", "1");
    return NextResponse.redirect(loginUrl, 303);
  }

  try {
    const user = await verifyCredentials(email, password);

    if (!user) {
      loginUrl.searchParams.set("error", "1");
      return NextResponse.redirect(loginUrl, 303);
    }

    await createSession(user.id);

    return NextResponse.redirect(
      new URL("/dashboard", request.url),
      303
    );
  } catch (error) {
    console.error("Login error:", error);

    loginUrl.searchParams.set("error", "2");
    return NextResponse.redirect(loginUrl, 303);
  }
}
