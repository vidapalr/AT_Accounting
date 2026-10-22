"use client";

import styles from "./stock-transfers.module.css";

export default function PrintTransferButton() {
  return <button type="button" className={styles.secondaryButton} onClick={() => window.print()}>Print Transfer Challan</button>;
}
