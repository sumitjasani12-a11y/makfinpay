import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable } from "@/components/Shared";
import { toast } from "sonner";
import { RotateCcw, Search, X, Calendar, ChevronDown, Loader2 } from "lucide-react";

function DateRangeDropdown({ range, setRange, from, setFrom, to, setTo, customApplied, setCustomApplied, applyCustom }) {
  const [isOpen, setIsOpen] = useState(false);

  const activeLabel = useMemo(() => {
    if (range === "custom" && customApplied) {
      return `${from} to ${to}`;
    }
    const match = DATE_RANGES.find(r => r.key === range);
    return match ? match.label : "Select Date";
  }, [range, customApplied, from, to]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 bg-white border border-neutral-200/80 hover:border-[#1B4332]/30 px-4 py-2.5 rounded-xl text-xs font-bold text-neutral-700 shadow-sm transition-all"
      >
        <Calendar className="h-4 w-4 text-[#1B4332]" />
        <span>{activeLabel}</span>
        <ChevronDown className="h-3 w-3 text-neutral-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-white border border-neutral-200 rounded-2xl shadow-xl p-3 z-50 animate-fadeIn space-y-3">
            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">
              Select Timeframe
            </div>
            <div className="space-y-1">
              {DATE_RANGES.map((r) => {
                const active = range === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => {
                      setRange(r.key);
                      if (r.key !== "custom") {
                        setCustomApplied(false);
                        setIsOpen(false);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? "bg-[#E8F5E9] text-[#1B4332]"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {range === "custom" && (
              <div className="border-t border-neutral-100 pt-3 space-y-2 px-1">
                <div>
                  <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">From</label>
                  <input
                    type="date"
                    max={to}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs outline-none focus:border-[#1B4332]/40"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">To</label>
                  <input
                    type="date"
                    min={from}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs outline-none focus:border-[#1B4332]/40"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => {
                    applyCustom();
                    setIsOpen(false);
                  }}
                  className="w-full py-1.5 bg-[#1B4332] text-white rounded-lg text-xs font-bold hover:bg-[#153527] transition-all"
                >
                  Apply Custom Range
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

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
  const [pageSize, setPageSize] = useState(20);

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

  // Moving "When" (created_at) column to the FIRST position as requested
  const columns = [
    { key: "created_at", label: "When", render: (r) => <span className="font-bold text-neutral-800">{fmtDate(r.created_at)}</span> },
    { key: "actor", label: "Actor", render: (r) => r.actor ? `${r.actor.full_name} (${r.actor.role})` : r.user_id },
    { key: "action", label: "Action" },
    { key: "target", label: "Target" },
    { key: "ip", label: "IP" },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader 
        title="Audit Logs" 
        subtitle="Every sensitive action is recorded for compliance." 
        actions={
          <DateRangeDropdown 
            range={range}
            setRange={setRange}
            from={from}
            setFrom={setFrom}
            to={to}
            setTo={setTo}
            customApplied={customApplied}
            setCustomApplied={setCustomApplied}
            applyCustom={applyCustom}
          />
        }
      />

      <div className="mfp-card p-5 mb-6 flex flex-col md:flex-row items-center justify-between gap-4" data-testid="audit-filter-bar">
        <div className="relative flex-1 w-full">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
            <Search className="h-4 w-4 text-neutral-400" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by Action, Target ID, IP…"
            className="mfp-input !pl-11 !pr-10 w-full"
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

        <div className="flex items-center justify-between gap-4 w-full md:w-auto shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-black/5">
          <div className="text-xs text-neutral-500 font-semibold" data-testid="audit-results-count">
            {loading ? <span className="inline-flex items-center gap-1.5 text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#1B4332]" /></span> : <>Matched <span className="text-[#1B4332] font-extrabold bg-[#E8F5E9] px-2 py-0.5 rounded-md border border-[#C8E6C9]/40">{total.toLocaleString("en-IN")}</span> events</>}
          </div>
          <button onClick={clearAll} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-neutral-600 hover:text-red-600 bg-neutral-100 hover:bg-red-50 rounded-xl transition-all" data-testid="audit-clear-all">
            <RotateCcw className="h-3.5 w-3.5" /> Clear Filters
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        empty={loading ? <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 font-medium"><Loader2 className="h-5 w-5 animate-spin text-[#1B4332]" /></div> : "No audit events found for selected filters"}
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
