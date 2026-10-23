import Link from "next/link";

const STEPS = [
  { n: 1, label: "Enter balances", href: "/accounting/opening-balances" },
  { n: 2, label: "Check and authorise", href: "/accounting/opening-balances/review#authorization" },
  { n: 3, label: "Post to the books", href: "/accounting/opening-balances/review#post" },
];

/** One wizard across the two opening-balance pages: always shows where you are. */
export default function OpeningSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      aria-label="Opening balance steps"
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        listStyle: "none",
        padding: 0,
        margin: "14px 0 18px",
      }}
    >
      {STEPS.map((s) => {
        const active = s.n === current;
        return (
          <li key={s.n}>
            <Link
              href={s.href}
              aria-current={active ? "step" : undefined}
              className={active ? "btn-link btn-link-primary" : "btn-link"}
            >
              Step {s.n}: {s.label}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
