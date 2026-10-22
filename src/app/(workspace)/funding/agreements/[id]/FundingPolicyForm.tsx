
"use client";

import { useState } from "react";
import {
  saveFundingPolicyAction,
  confirmFundingPolicyAction,
} from "@/lib/funding-policy-actions";
import type { FundingPolicy } from "@/lib/funding-policies";
import styles from "./details.module.css";

type Props = {
  agreementId: number;
  fundingType: "LOAN" | "PROFIT_LINKED";
  existing: FundingPolicy | null;
  canEdit: boolean;
};

const models = [
  ["FIXED", "Fixed Funding"],
  ["FLEXIBLE_ADVANCE", "Flexible Advance"],
  ["REVOLVING", "Revolving Facility"],
  ["TERM_LOAN", "Term Loan"],
  ["NO_INITIAL_FUNDING", "No Initial Funding"],
];

const entitlements = [
  ["FIXED_CONTRACTUAL", "Fixed Contractual Share"],
  ["OUTSTANDING_DEPENDENT", "Depends on Outstanding Funding"],
  ["TIME_WEIGHTED", "Time-Weighted Funding"],
  ["MINIMUM_FUNDING", "Minimum Funding Required"],
];

export default function FundingPolicyForm({
  agreementId,
  fundingType,
  existing,
  canEdit,
}: Props) {
  const isLoan = fundingType === "LOAN";

  const [model, setModel] = useState(
    existing?.funding_model ??
      (isLoan ? "TERM_LOAN" : "FIXED")
  );

  const [entitlement, setEntitlement] = useState(
    existing?.profit_entitlement_model ??
      (isLoan ? "NOT_APPLICABLE" : "FIXED_CONTRACTUAL")
  );

  const [lossModel, setLossModel] = useState(
    existing?.loss_sharing_model ??
      (isLoan ? "NONE" : "NONE")
  );

  const [maximum, setMaximum] = useState(
    existing?.maximum_outstanding ?? ""
  );

  const [minimum, setMinimum] = useState(
    existing?.minimum_funding ?? ""
  );

  const [lossRate, setLossRate] = useState(
    existing?.loss_share_percentage ?? ""
  );

  const [lossCap, setLossCap] = useState(
    existing?.maximum_loss_exposure ?? ""
  );

  const [additional, setAdditional] = useState(
    existing
      ? Boolean(existing.additional_funding_allowed)
      : false
  );

  const [flexible, setFlexible] = useState(
    existing
      ? Boolean(existing.flexible_repayment_allowed)
      : false
  );

  const [zeroBalance, setZeroBalance] = useState(
    existing?.entitlement_on_zero_balance == null
      ? "NO"
      : existing.entitlement_on_zero_balance
        ? "YES"
        : "NO"
  );

  const [settlement, setSettlement] = useState(
    existing?.loss_settlement_method ??
      "NOT_APPLICABLE"
  );

  const [order, setOrder] = useState(
    existing?.profit_calculation_order ??
      "UNSPECIFIED"
  );

  if (!canEdit) {
    return (
      <p className={styles.notice}>
        This agreement version is not editable.
        Approved or confirmed contractual terms must
        be changed through a versioned amendment.
      </p>
    );
  }

  const needsMaximum = model === "REVOLVING";
  const canAddFunding =
    model !== "FIXED" &&
    model !== "NO_INITIAL_FUNDING";
  const canFlexibleRepay =
    model !== "TERM_LOAN";

  function updateModel(next: FundingPolicy["funding_model"]) {
    setModel(next);

    if (next === "REVOLVING") {
      setAdditional(true);
      setFlexible(true);
    } else if (
      next === "FIXED" ||
      next === "NO_INITIAL_FUNDING"
    ) {
      setAdditional(false);

      if (next === "FIXED") {
        setFlexible(false);
      }
    }

    if (next === "TERM_LOAN") {
      setFlexible(false);
    }

    if (next === "NO_INITIAL_FUNDING") {
      setMinimum("");
    }
  }

  function updateLossModel(next: string) {
    setLossModel(next);
    setLossRate("");
    setLossCap("");

    if (next === "NONE") {
      setSettlement("NOT_APPLICABLE");
    } else if (next === "UNSPECIFIED") {
      setSettlement("UNSPECIFIED");
    } else {
      setSettlement("CARRY_FORWARD");
    }
  }

  return (
    <div className={styles.policyPanel}>
      <form
        action={saveFundingPolicyAction}
        className={styles.form}
      >
        <input
          type="hidden"
          name="agreement_id"
          value={agreementId}
        />

        {isLoan && (
          <>
            <input
              type="hidden"
              name="profit_entitlement_model"
              value="NOT_APPLICABLE"
            />
            <input
              type="hidden"
              name="entitlement_on_zero_balance"
              value="NOT_APPLICABLE"
            />
            <input
              type="hidden"
              name="loss_sharing_model"
              value="NONE"
            />
            <input
              type="hidden"
              name="loss_settlement_method"
              value="NOT_APPLICABLE"
            />
            <input
              type="hidden"
              name="profit_calculation_order"
              value="UNSPECIFIED"
            />
          </>
        )}

        {!canAddFunding && (
          <input
            type="hidden"
            name="additional_funding_allowed"
            value="no"
          />
        )}

        {!canFlexibleRepay && (
          <input
            type="hidden"
            name="flexible_repayment_allowed"
            value="no"
          />
        )}

        {!isLoan &&
          (lossModel === "NONE" ||
            lossModel === "UNSPECIFIED") && (
            <input
              type="hidden"
              name="loss_settlement_method"
              value={
                lossModel === "NONE"
                  ? "NOT_APPLICABLE"
                  : "UNSPECIFIED"
              }
            />
          )}

        <label>
          Funding Model
          <select
            name="funding_model"
            value={model}
            onChange={(e) =>
              updateModel(
                e.target.value as FundingPolicy["funding_model"]
              )
            }
          >
            {models.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Maximum Outstanding Funding (₹)
          <input
            name="maximum_outstanding"
            value={maximum}
            onChange={(e) => setMaximum(e.target.value)}
            inputMode="decimal"
            placeholder={
              needsMaximum ? "Required for revolving funding" : "Optional"
            }
            required={needsMaximum}
          />
        </label>

        {model !== "NO_INITIAL_FUNDING" && (
          <label>
            Minimum Funding (₹)
            <input
              name="minimum_funding"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
              inputMode="decimal"
              required={entitlement === "MINIMUM_FUNDING"}
              placeholder="Optional"
            />
          </label>
        )}

        <label>
          Additional Funding Allowed
          <select
            name="additional_funding_allowed"
            value={additional ? "yes" : "no"}
            disabled={!canAddFunding}
            onChange={(e) =>
              setAdditional(e.target.value === "yes")
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label>
          Flexible Principal Repayment
          <select
            name="flexible_repayment_allowed"
            value={flexible ? "yes" : "no"}
            disabled={!canFlexibleRepay}
            onChange={(e) =>
              setFlexible(e.target.value === "yes")
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label>
          Profit Entitlement Model
          <select
            name="profit_entitlement_model"
            value={isLoan ? "NOT_APPLICABLE" : entitlement}
            disabled={isLoan}
            onChange={(e) =>
              setEntitlement(e.target.value)
            }
          >
            {isLoan ? (
              <option value="NOT_APPLICABLE">
                Not Applicable
              </option>
            ) : (
              entitlements.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Profit Entitlement at Zero Funding Balance
          <select
            name="entitlement_on_zero_balance"
            value={isLoan ? "NOT_APPLICABLE" : zeroBalance}
            disabled={isLoan}
            onChange={(e) =>
              setZeroBalance(e.target.value)
            }
          >
            {isLoan ? (
              <option value="NOT_APPLICABLE">
                Not Applicable
              </option>
            ) : (
              <>
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </>
            )}
          </select>
        </label>

        <label>
          Loss Sharing Model
          <select
            name="loss_sharing_model"
            value={lossModel}
            disabled={isLoan}
            onChange={(e) =>
              updateLossModel(e.target.value)
            }
          >
            <option value="NONE">No Loss Sharing</option>
            {!isLoan && (
              <>
                <option value="SAME_AS_PROFIT">
                  Same as Profit Share
                </option>
                <option value="CUSTOM_PERCENTAGE">
                  Custom Percentage
                </option>
                <option value="CAPPED">
                  Percentage with Loss Cap
                </option>
                <option value="UNSPECIFIED">
                  Not Yet Specified
                </option>
              </>
            )}
          </select>
        </label>

        {(lossModel === "CUSTOM_PERCENTAGE" ||
          lossModel === "CAPPED") && !isLoan && (
          <label>
            Loss Share Percentage (%)
            <input
              name="loss_share_percentage"
              type="number"
              min="0"
              max="100"
              step="0.0001"
              value={lossRate}
              onChange={(e) => setLossRate(e.target.value)}
              required
            />
          </label>
        )}

        {lossModel === "CAPPED" && !isLoan && (
          <label>
            Maximum Loss Exposure (₹)
            <input
              name="maximum_loss_exposure"
              value={lossCap}
              onChange={(e) => setLossCap(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
        )}

        <label>
          Loss Settlement Method
          <select
            name="loss_settlement_method"
            value={isLoan ? "NOT_APPLICABLE" : settlement}
            disabled={isLoan || lossModel === "NONE" ||
              lossModel === "UNSPECIFIED"}
            onChange={(e) =>
              setSettlement(e.target.value)
            }
          >
            <option value="NOT_APPLICABLE">
              Not Applicable
            </option>
            <option value="UNSPECIFIED">
              Not Specified
            </option>
            <option value="CARRY_FORWARD">
              Carry Forward Against Future Profit
            </option>
            <option value="DEDUCT_FROM_RISK_BALANCE">
              Deduct from Contractual Risk Balance
            </option>
            <option value="ADDITIONAL_CONTRIBUTION">
              Additional Contribution if Contractually Required
            </option>
          </select>
        </label>

        <label>
          Profit Calculation Order
          <select
            name="profit_calculation_order"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            disabled={isLoan}
          >
            <option value="UNSPECIFIED">
              To Be Defined
            </option>
            <option value="BEFORE_OTHER_ALLOCATIONS">
              Before Other Investor Allocations
            </option>
            <option value="AFTER_BRANCH_ALLOCATIONS">
              After Branch Investor Allocations
            </option>
            <option value="CONTRACT_DEFINED">
              As Defined in Agreement
            </option>
          </select>
        </label>

        <label className={styles.fullWidth}>
          Policy Notes / Contractual Conditions
          <textarea
            name="policy_notes"
            rows={4}
            maxLength={5000}
            defaultValue={existing?.policy_notes ?? ""}
            placeholder="Document limits, eligibility and calculation conditions"
          />
        </label>

        <div className={styles.fullWidth}>
          <button type="submit">
            Save Draft Funding Policy
          </button>
        </div>
      </form>

      {existing?.policy_status === "DRAFT" && (
        <div className={styles.policyConfirm}>
          <h3>Confirm Funding Policy</h3>
          <p>
            Confirm only when these rules match the documented
            contractual arrangement.
          </p>

          <form
            action={confirmFundingPolicyAction}
            className={styles.form}
          >
            <input
              type="hidden"
              name="agreement_id"
              value={agreementId}
            />

            <label className={styles.fullWidth}>
              Supporting Agreement Reference
              <input
                name="evidence_reference"
                minLength={5}
                maxLength={250}
                required
                placeholder="Signed agreement / approved addendum reference"
              />
            </label>

            <label className={styles.fullWidth}>
              <span className={styles.confirmRow}>
                <input
                  type="checkbox"
                  name="confirmed"
                  value="yes"
                  required
                />
                <span>
                  I confirm that these funding, profit and
                  loss rules match the supporting agreement.
                </span>
              </span>
            </label>

            <div className={styles.fullWidth}>
              <button type="submit">
                Confirm & Lock Policy
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
