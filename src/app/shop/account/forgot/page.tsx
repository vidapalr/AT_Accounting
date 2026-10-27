import type { Metadata } from "next";

import ResetForm from "@/components/shop/ResetForm";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return <ResetForm />;
}
