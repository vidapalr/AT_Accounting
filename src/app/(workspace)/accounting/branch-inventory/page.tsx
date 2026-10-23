import { redirect } from "next/navigation";

/** The old warehouse and shop stock pages are now one page: Stock on Hand. */
export default function Redirect() {
  redirect("/accounting/stock");
}
