
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
  const [level, setLevel] = useState("BRANCH");

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fit, minmax(210px, 1fr))",
      gap: 16,
    }}>
      <label>
        Expense Level
        <select
          name="allocation_level"
          value={level}
          onChange={e => setLevel(e.target.value)}
          style={fieldStyle}
        >
          <option value="GROUP">Group Level</option>
          <option value="DIVISION">Division Level</option>
          <option value="BRANCH">Branch Level</option>
        </select>
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
    </div>
  );
}
