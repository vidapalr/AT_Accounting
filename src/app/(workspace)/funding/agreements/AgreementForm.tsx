"use client";

import { useState } from "react";
import { createFundingAgreementAction } from
  "@/lib/funding-agreement-actions";
import styles from "../funding.module.css";

type DivisionOption = {
  id: number;
  code: string;
  name: string;
};

type BranchOption = {
  id: number;
  division_id: number;
  code: string;
  name: string;
};

type Props = {
  parties: DivisionOption[];
  divisions: DivisionOption[];
  branches: BranchOption[];
};

type FundingScope = "GROUP" | "DIVISION" | "BRANCH";
type FundingType = "PROFIT_LINKED" | "LOAN";

export default function AgreementForm({
  parties,
  divisions,
  branches,
}: Props) {
  const [scope, setScope] =
    useState<FundingScope>("BRANCH");

  const [divisionId, setDivisionId] =
    useState("");

  const [branchId, setBranchId] =
    useState("");

  const [fundingType, setFundingType] =
    useState<FundingType>("PROFIT_LINKED");

  const [interestRate, setInterestRate] =
    useState("");

  const availableBranches = branches.filter(
    (branch) =>
      String(branch.division_id) === divisionId
  );

  function changeScope(next: FundingScope) {
    setScope(next);
    setDivisionId("");
    setBranchId("");
  }

  function changeDivision(next: string) {
    setDivisionId(next);
    setBranchId("");
  }

  return (
    <form
      action={createFundingAgreementAction}
      className={styles.formGrid}
    >
      <Field label="Agreement Number">
        <input
          name="agreement_no"
          placeholder="ATX-KAP-INV001"
          maxLength={40}
          required
        />
      </Field>

      <Field label="Funding Party">
        <select
          name="party_id"
          defaultValue=""
          required
        >
          <option value="" disabled>
            Select investor or lender
          </option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.code} — {party.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Funding Scope">
        <select
          name="funding_scope"
          value={scope}
          onChange={(event) =>
            changeScope(
              event.target.value as FundingScope
            )
          }
        >
          <option value="GROUP">
            Abhiram Group
          </option>
          <option value="DIVISION">
            Business Division
          </option>
          <option value="BRANCH">
            Specific Branch
          </option>
        </select>
      </Field>

      {scope !== "GROUP" && (
        <Field label="Business Division">
          <select
            name="division_id"
            value={divisionId}
            onChange={(event) =>
              changeDivision(event.target.value)
            }
            required
          >
            <option value="">
              Select Division
            </option>
            {divisions.map((division) => (
              <option
                key={division.id}
                value={division.id}
              >
                {division.code} — {division.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {scope === "BRANCH" && (
        <Field label="Business Branch">
          <select
            name="branch_id"
            value={branchId}
            onChange={(event) =>
              setBranchId(event.target.value)
            }
            disabled={!divisionId}
            required
          >
            <option value="">
              Select Branch
            </option>

            {availableBranches.map((branch) => (
              <option
                key={branch.id}
                value={branch.id}
              >
                {branch.code} — {branch.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Funding Type">
        <select
          name="funding_type"
          value={fundingType}
          onChange={(event) => {
            setFundingType(
              event.target.value as FundingType
            );
            setInterestRate("");
          }}
        >
          <option value="PROFIT_LINKED">
            Profit-Linked Funding
          </option>
          <option value="LOAN">
            Loan
          </option>
        </select>
      </Field>

      <Field label="Committed Amount (₹)">
        <input
          name="committed_amount"
          type="text"
          inputMode="decimal"
          placeholder="200000.00"
          required
        />
      </Field>

      {fundingType === "PROFIT_LINKED" ? (
        <>
          <Field label="Profit Share (%)">
            <input
              name="profit_share_percentage"
              type="number"
              min="0.0001"
              max="100"
              step="0.0001"
              required
            />
          </Field>

          <Field label="Profit Calculation Basis">
            <select
              name="profit_basis"
              defaultValue="Distributable Net Profit"
              required
            >
              <option value="Distributable Net Profit">
                Distributable Net Profit
              </option>
              <option value="Net Profit After Tax">
                Net Profit After Tax
              </option>
              <option value="Operating Profit">
                Operating Profit
              </option>
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label="Annual Interest Rate (%)">
            <input
              name="interest_rate_percentage"
              type="number"
              min="0"
              max="100"
              step="0.0001"
              value={interestRate}
              onChange={(event) =>
                setInterestRate(event.target.value)
              }
              placeholder="0 for interest-free loan"
            />
          </Field>

          {interestRate !== "" &&
            Number(interestRate) > 0 && (
              <Field label="Interest Method">
                <select
                  name="interest_method"
                  defaultValue="SIMPLE"
                >
                  <option value="SIMPLE">
                    Simple Interest
                  </option>
                  <option value="REDUCING_BALANCE">
                    Reducing Balance
                  </option>
                </select>
              </Field>
            )}
        </>
      )}

      <Field label="Effective From">
        <input
          name="effective_from"
          type="date"
          required
        />
      </Field>

      <Field label="Effective To">
        <input
          name="effective_to"
          type="date"
        />
      </Field>

      <Field label="Payout Frequency">
        <select
          name="payout_frequency"
          defaultValue="QUARTERLY"
        >
          {[
            "MONTHLY",
            "QUARTERLY",
            "HALF_YEARLY",
            "YEARLY",
            "ON_MATURITY",
            "CUSTOM",
          ].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Principal Repayment Terms">
        <textarea
          name="principal_repayment_terms"
          rows={3}
        />
      </Field>

      {fundingType === "PROFIT_LINKED" && (
        <Field label="Loss Sharing Terms">
          <textarea
            name="loss_sharing_terms"
            rows={3}
          />
        </Field>
      )}

      <Field label="Agreement Notes">
        <textarea
          name="agreement_notes"
          rows={3}
        />
      </Field>

      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primary}
        >
          Save Draft Agreement
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
