import { redirect } from "next/navigation";

/** Owner accounts moved to My money > Accounts and cards (same accounts, now with cards, statements and balances). */
export default function Page() {
  redirect("/accounting/my-money?tab=accounts");
}
