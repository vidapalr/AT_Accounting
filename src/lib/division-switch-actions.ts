"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { ACTIVE_DIVISION_COOKIE, listDivisions } from "@/lib/division-context";

export async function setActiveDivisionAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(form.get("division_id"));
  const back = String(form.get("back") ?? "/dashboard");
  const divisions = await listDivisions(user.legal_business_id);

  if (divisions.some(d => d.id === id)) {
    const jar = await cookies();
    jar.set(ACTIVE_DIVISION_COOKIE, String(id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  revalidatePath("/", "layout");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/dashboard");
}
