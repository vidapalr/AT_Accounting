"use client";

import { usePathname } from "next/navigation";
import { setActiveDivisionAction } from "@/lib/division-switch-actions";

export default function DivisionSwitcher({
  divisions,
  activeId,
}: {
  divisions: { id: number; name: string }[];
  activeId: number;
}) {
  const pathname = usePathname();
  return (
    <form action={setActiveDivisionAction} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="hidden" name="back" value={pathname} />
      <label style={{ fontSize: 13, color: "#64748b" }} htmlFor="division-switch">
        Working in
      </label>
      <select
        id="division-switch"
        name="division_id"
        defaultValue={activeId}
        onChange={e => e.currentTarget.form?.requestSubmit()}
        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
      >
        {divisions.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    </form>
  );
}
