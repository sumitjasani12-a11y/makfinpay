import React from "react";

export function StatusBadge({ status }) {
  const map = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
    success: "bg-emerald-100 text-emerald-800",
    reversed: "bg-rose-100 text-rose-800",
    paid: "bg-emerald-100 text-emerald-800",
  };
  const cls = map[status] || "bg-neutral-100 text-neutral-700";
  return <span className={`mfp-pill ${cls} capitalize`}>{status || "—"}</span>;
}

export function Kpi({ label, value, hint, accent, "data-testid": testid }) {
  return (
    <div className="mfp-kpi" data-testid={testid}>
      <div className="mfp-overline">{label}</div>
      <div className={`mt-3 text-3xl font-medium tracking-tight ${accent || ""}`}>{value}</div>
      {hint && <div className="mt-2 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">{title}</h1>
        {subtitle && <p className="text-neutral-600 mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="text-center text-neutral-500 py-12 text-sm">{children}</div>;
}

export function DataTable({ columns, rows, empty = "No data", pagination }) {
  return (
    <div className="mfp-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full mfp-table">
          <thead>
            <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length}><EmptyState>{empty}</EmptyState></td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id || i}>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && <PaginationBar {...pagination} />}
    </div>
  );
}

export function PaginationBar({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (p) => onPageChange(Math.max(1, Math.min(totalPages, p)));
  const btn = "px-2.5 py-1 text-xs rounded border border-black/10 hover:bg-[#1B4332]/5 disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-black/5 text-xs text-neutral-600"
      data-testid="pagination-bar"
    >
      <div data-testid="pagination-total">
        {total === 0
          ? "No records"
          : `Showing ${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} records`}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1">
          Rows per page:
          <select
            className="bg-[#FDFCF8] border border-black/10 hover:border-black/20 rounded-lg px-2 py-1 text-xs outline-none cursor-pointer min-w-[64px]"
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            data-testid="pagination-page-size"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button className={btn} disabled={page <= 1} onClick={() => go(1)} data-testid="pagination-first">« First</button>
          <button className={btn} disabled={page <= 1} onClick={() => go(page - 1)} data-testid="pagination-prev">‹ Prev</button>
          <span className="px-2" data-testid="pagination-indicator">Page {page} of {totalPages}</span>
          <button className={btn} disabled={page >= totalPages} onClick={() => go(page + 1)} data-testid="pagination-next">Next ›</button>
          <button className={btn} disabled={page >= totalPages} onClick={() => go(totalPages)} data-testid="pagination-last">Last »</button>
        </div>
      </div>
    </div>
  );
}
