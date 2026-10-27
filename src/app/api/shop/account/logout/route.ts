import { logoutCustomer } from "@/lib/shop-account";

export async function POST() {
  await logoutCustomer();
  return Response.json({ ok: true });
}
