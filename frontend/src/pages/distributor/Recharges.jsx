import React, { useEffect, useState, useCallback } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { rangeWindowIso, todayStr } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { useWebSocketListener } from "@/lib/ws";
import { Search, RotateCcw, ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const DATE_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "this_month", label: "This Month" },
  { key: "all_time", label: "All Time" },
  { key: "custom", label: "Custom Range" },
];

const STATUS_OPTIONS = [
  { key: "all", label: "All Statuses" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function DistRecharges() {
  // Filter States - DEFAULT = "today"
  const [rangeKey, setRangeKey] = useState("today");
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");

  // Pagination States
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState(0);

  // Data & Loading States
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const debouncedSearch = useDebounced(search, 350);
  const debouncedAmount = useDebounced(amount, 350);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [rangeKey, fromDate, toDate, status, debouncedSearch, debouncedAmount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { from_ts, to_ts } = rangeWindowIso(rangeKey, fromDate, toDate);
      const params = {
        paginated: true,
        page,
        page_size: pageSize,
      };
      if (status && status !== "all") params.status = status;
      if (from_ts) params.from_ts = from_ts;
      if (to_ts) params.to_ts = to_ts;
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      if (debouncedAmount.trim()) params.amount = debouncedAmount.trim();

      const res = await api.get("/distributor/recharges", { params });
      if (res.data && Array.isArray(res.data.items)) {
        setItems(res.data.items);
        setTotal(res.data.total || 0);
      } else if (Array.isArray(res.data)) {
        setItems(res.data);
        setTotal(res.data.length);
      }
    } catch (e) {
      console.log("Failed to load distributor agent recharges:", e);
    } finally {
      setLoading(false);
    }
  }, [rangeKey, fromDate, toDate, status, debouncedSearch, debouncedAmount, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time WebSocket updates
  useWebSocketListener("recharge_created", loadData);
  useWebSocketListener("recharge_updated", loadData);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resetFilters = () => {
    setRangeKey("today");
    setFromDate(todayStr());
    setToDate(todayStr());
    setStatus("all");
    setSearch("");
    setAmount("");
    setPage(1);
  };

  const columns = [
    { key: "user_name", label: "Agent" },
    { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount) },
    { key: "credit_amount", label: "Net Credit", render: (r) => r.status === "approved" ? fmtMoney(r.credit_amount) : "—" },
    { key: "commission_percent", label: "Comm %", render: (r) => `${r.commission_percent ?? 0}%` },
    { key: "distributor_earnings_amount", label: "My Earnings", render: (r) => r.status === "approved" ? fmtMoney(r.distributor_earnings_amount ?? 0) : "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Recharge Activity"
        subtitle="See recharge requests and their status across your agents."
      />

      {/* FILTER TOOLBAR */}
      <div className="bg-white rounded-2xl border border-black/5 p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Agent / UTR */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search Agent, UTR..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-black/10 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Amount Search */}
          <div className="w-36">
            <input
              type="text"
              placeholder="Filter Amount..."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 border border-black/10 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Date Range Selector (DEFAULT TODAY) */}
          <div className="flex items-center gap-2 bg-neutral-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="h-4 w-4 text-emerald-600 shrink-0" />
            <select
              value={rangeKey}
              onChange={(e) => setRangeKey(e.target.value)}
              className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
            >
              {DATE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Date Inputs if Custom Selected */}
          {rangeKey === "custom" && (
            <div className="flex items-center gap-2 animate-fadeIn">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-2.5 py-1.5 bg-neutral-50 border border-black/10 rounded-xl text-xs focus:bg-white"
              />
              <span className="text-xs text-neutral-400">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2.5 py-1.5 bg-neutral-50 border border-black/10 rounded-xl text-xs focus:bg-white"
              />
            </div>
          )}

          {/* Status Selector */}
          <div className="w-36">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 border border-black/10 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none cursor-pointer"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold transition-colors"
            title="Reset Filters"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* DATA TABLE */}
      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        empty="No agent recharges found."
      />

      {/* PAGINATION FOOTER (20 per page) */}
      <div className="bg-white rounded-2xl border border-black/5 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-neutral-600 shadow-sm">
        <div>
          Showing {total > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, total)} of {total} entries
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-black/10 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>

          <span className="px-3 py-1 font-bold text-neutral-800 bg-neutral-100 rounded-xl">
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-black/10 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
