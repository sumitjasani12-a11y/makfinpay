import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable } from "@/components/Shared";
import { toast } from "sonner";
import { RotateCcw, Search, X } from "lucide-react";

export default function AdminAudit() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);
  const [range, setRange] = useState("last7");
  const [from, setFrom] = useState(todayStr(-7));
  const [to, setTo] = useState(todayStr());
  const [customApplied, setCustomApplied] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const params = useMemo(() => {
    const { from_ts, to_ts } = range === "custom" && !customApplied
      ? { from_ts: null, to_ts: null }
      : rangeWindowIso(range, from, to);
    const p = { paginated: true, page, page_size: pageSize };
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    return p;
  }, [range, from, to, customApplied, debouncedQ, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    return api.get("/admin/audit-logs", { params })
      .then((r) => { setItems(r.data.items || []); setTotal(r.data.total || 0); })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load audit logs"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [range, from, to, customApplied, debouncedQ, pageSize]);

  const clearAll = () => {
    setQ(""); setRange("last7"); setFrom(todayStr(-7)); setTo(todayStr());
    setCustomApplied(false); setPage(1);
  };

  const applyCustom = () => {
    if (!from || !to) return toast.error("Pick both From and To dates");
    if (from > to) return toast.error("From date cannot be after To date");
    setCustomApplied(true);
  };

  const columns = [
    { key: "actor", label: "Actor", render: (r) => r.actor ? `${r.actor.full_name} (${r.actor.role})` : r.user_id },
    { key: "action", label: "Action" },
    { key: "target", label: "Target" },
    { key: "ip", label: "IP" },
    { key: "created_at", label: "When", render: (r) => fmtDate(r.created_at) },
  ];

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Every sensitive action is recorded for compliance." />

      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="audit-filter-bar">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by Action, Target ID, IP…"
              className="mfp-input !pl-11 !pr-10"
              data-testid="audit-search"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                data-testid="audit-search-clear"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="mfp-overline mr-1 self-center">Date:</span>
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => { setRange(r.key); if (r.key !== "custom") setCustomApplied(false); }}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${range === r.key ? "bg-[#1B4332] text-white" : "bg-[#F4F3ED] text-neutral-700 hover:bg-[#E8E5D7]"}`}
              data-testid={`audit-range-${r.key}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === "custom" && (
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div>
              <label className="mfp-label">From</label>
              <input type="date" max={to} className="mfp-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="audit-custom-from" />
            </div>
            <div>
              <label className="mfp-label">To</label>
              <input type="date" min={from} className="mfp-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="audit-custom-to" />
            </div>
            <button onClick={applyCustom} className="mfp-btn-primary" data-testid="audit-custom-apply">Apply</button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-black/5">
          <div className="text-sm text-neutral-600" data-testid="audit-results-count">
            {loading ? "Loading…" : <>Matched <span className="font-semibold">{total.toLocaleString("en-IN")}</span> events</>}
          </div>
          <button onClick={clearAll} className="mfp-btn-ghost" data-testid="audit-clear-all">
            <RotateCcw className="h-3.5 w-3.5" /> Clear All Filters
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        empty={loading ? "Loading…" : "No audit events found for selected filters"}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
        }}
      />
    </div>
  );
}
