
"use client";

import { useState } from "react";

type Branch = {
  id: number;
  name: string;
};

type Props = {
  branches: Branch[];
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

export default function ExpenseAllocationFields({
  branches,
}: Props) {
  // Every cost is booked to a branch, whichever account paid it; head-office costs go to the branch you choose.
  const [level] = useState("BRANCH");

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fit, minmax(210px, 1fr))",
      gap: 16,
    }}>
      <label>
        Booked to
        <input type="hidden" name="allocation_level" value={level} />
        <input value="A branch (pick below)" readOnly style={fieldStyle} />
      </label>

      <label>
        Group
        <input
          value="Abhiram Group"
          readOnly
          style={fieldStyle}
        />
      </label>

      <label>
        Division
        <select
          name="division_id"
          disabled={level === "GROUP"}
          defaultValue="1"
          style={fieldStyle}
        >
          <option value="1">Abhiram Textiles</option>
        </select>
      </label>

      <label>
        Branch
        <select
          name="branch_id"
          required={level === "BRANCH"}
          disabled={level !== "BRANCH"}
          defaultValue=""
          style={fieldStyle}
        >
          <option value="">Select Branch</option>
          {branches.map(branch => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>
      <p style={{ gridColumn: "1 / -1", margin: 0, color: "#64748b" }}>
        Every cost is booked to a branch, whichever account pays it (shop cash, bank, an investor or you). For a head-office cost, pick the branch it belongs to.
      </p>
    </div>
  );
}
