"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { dispatchStockTransferAction, receiveStockTransferAction } from "@/lib/stock-transfer-actions";
import styles from "./stock-transfers.module.css";

type Transfer = {
  id: number;
  transfer_no: string;
  transfer_date: string;
  from_location: string;
  to_location: string;
  item_count: number;
  total_quantity: number;
  status: string;
};

export default function TransferHistoryTable({transfers, today}: {transfers: Transfer[]; today: string}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [location, setLocation] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;
  const locations = useMemo(() => [...new Set(transfers.flatMap(t => [t.from_location, t.to_location]))].sort(), [transfers]);
  const filtered = useMemo(() => transfers.filter(t => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const text = `${t.transfer_no} ${t.from_location} ${t.to_location} ${t.transfer_date} ${t.status}`.toLowerCase();
    return words.every(w => text.includes(w)) &&
      (status === "ALL" || t.status === status) &&
      (location === "ALL" || t.from_location === location || t.to_location === location) &&
      (!dateFrom || t.transfer_date >= dateFrom) &&
      (!dateTo || t.transfer_date <= dateTo);
  }), [transfers, query, status, location, dateFrom, dateTo]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const activePage = Math.min(page, pages);
  const rows = filtered.slice((activePage - 1) * perPage, activePage * perPage);
  const resetPage = () => setPage(1);

  return <>
    <div className={styles.historyFilters}>
      <label>Search transfer / location
        <input className={styles.control} type="search" value={query} placeholder="Transfer no., location, date..." onChange={e => {setQuery(e.target.value); resetPage();}} />
      </label>
      <label>Status
        <select className={styles.control} value={status} onChange={e => {setStatus(e.target.value); resetPage();}}>
          <option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="DISPATCHED">In transit</option><option value="RECEIVED">Received</option>
        </select>
      </label>
      <label>Location
        <select className={styles.control} value={location} onChange={e => {setLocation(e.target.value); resetPage();}}>
          <option value="ALL">All locations</option>{locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <label>From date<input className={styles.control} type="date" value={dateFrom} onChange={e => {setDateFrom(e.target.value); resetPage();}} /></label>
      <label>To date<input className={styles.control} type="date" value={dateTo} onChange={e => {setDateTo(e.target.value); resetPage();}} /></label>
      <button type="button" className={styles.secondaryButton} onClick={() => {setQuery(""); setStatus("ALL"); setLocation("ALL"); setDateFrom(""); setDateTo(""); resetPage();}}>Clear filters</button>
    </div>
    <p className={styles.muted}>{filtered.length} matching transfer(s)</p>
    <div className={styles.tableWrap}>
      <table className={styles.recentTable}>
        <thead><tr><th>Transfer</th><th>Date</th><th>Source</th><th>Destination</th><th>Items</th><th>Quantity*</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{rows.map(t => <tr key={t.id}>
          <td><Link href={`/accounting/stock-transfers?view=${t.id}`} className={styles.editLink}>{t.transfer_no}</Link></td>
          <td>{t.transfer_date}</td><td>{t.from_location}</td><td>{t.to_location}</td>
          <td>{t.item_count}</td><td>{t.total_quantity.toLocaleString("en-IN", {maximumFractionDigits:3})}</td>
          <td><span className={`${styles.transferBadge} ${t.status === "RECEIVED" ? styles.badgeReceived : t.status === "DISPATCHED" ? styles.badgeTransit : styles.badgeDraft}`}>{t.status === "DISPATCHED" ? "IN TRANSIT" : t.status}</span></td>
          <td className={styles.transferActions}>
            {t.status === "DRAFT" && <div className={styles.actionGroup}>
              <Link className={styles.editLink} href={`/accounting/stock-transfers?edit=${t.id}`}>Edit</Link>
              <form action={dispatchStockTransferAction} onSubmit={e => {if (!window.confirm(`Dispatch ${t.transfer_no}? Stock will be deducted from ${t.from_location}.`)) e.preventDefault();}}>
                <input type="hidden" name="transfer_id" value={t.id}/><button className={styles.actionButton} type="submit">Dispatch</button>
              </form>
            </div>}
            {t.status === "DISPATCHED" && <form action={receiveStockTransferAction} className={styles.receiveForm} onSubmit={e => {if (!window.confirm(`Confirm full receipt of ${t.transfer_no}? All items will be added to destination stock.`)) e.preventDefault();}}>
              <input type="hidden" name="transfer_id" value={t.id}/><input type="date" name="received_date" defaultValue={today} min={t.transfer_date} required className={styles.dateControl} aria-label={`Receive date ${t.transfer_no}`}/><button type="submit" className={styles.actionButton}>Receive</button>
            </form>}
            {t.status === "RECEIVED" && <span className={styles.muted}>Completed</span>}
          </td>
        </tr>)}{rows.length === 0 && <tr><td colSpan={8} className={styles.emptyState}>No transfers match your filters.</td></tr>}</tbody>
      </table>
    </div>
    <p className={styles.muted}>*Quantity total combines numeric amounts across items; check each item's unit in Transfer Details.</p>
    <div className={styles.pager}>
      <button className={styles.secondaryButton} type="button" disabled={activePage <= 1} onClick={() => setPage(p => Math.max(1,p-1))}>Previous</button>
      <span>Page {activePage} of {pages}</span>
      <button className={styles.secondaryButton} type="button" disabled={activePage >= pages} onClick={() => setPage(p => Math.min(pages,p+1))}>Next</button>
    </div>
  </>;
}
