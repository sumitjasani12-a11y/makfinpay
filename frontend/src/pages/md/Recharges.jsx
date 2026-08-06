import React, { useEffect, useState, useCallback } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { rangeWindowIso, todayStr } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { useWebSocketListener } from "@/lib/ws";
import { Search, RotateCcw, ChevronLeft, ChevronRight, Calendar, CheckCircle2, Clock, XCircle, Coins, HelpCircle } from "lucide-react";

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

export default function MdRecharges() {
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

  // Summary Stats State
  const [stats, setStats] = useState({
    approved_amount: 0, approved_count: 0,
    pending_amount: 0, pending_count: 0,
    rejected_amount: 0, rejected_count: 0,
    earnings: 0
  });

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

      const res = await api.get("/master-distributor/recharges", { params });
      if (res.data && res.data.items) {
        setItems(res.data.items);
        setTotal(res.data.total || 0);
        if (res.data.stats) setStats(res.data.stats);
      } else if (Array.isArray(res.data)) {
        setItems(res.data);
        setTotal(res.data.length);
      }
    } catch (e) {
      console.log("Failed to load downline recharges:", e);
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
    { key: "md_earnings_amount", label: "My Earnings", render: (r) => r.status === "approved" ? fmtMoney(r.md_earnings_amount ?? 0) : "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { 
      key: "reason", 
      label: "Reason", 
      render: (r, { isExpanded, toggleExpand }) => (
        r.status === "rejected" && (r.note || r.rejection_reason || r.reason) ? (
          <button
            type="button"
            onClick={toggleExpand}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              isExpanded
                ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                : "bg-rose-50 text-rose-700 border-rose-200/80 hover:bg-rose-100/80 hover:border-rose-300"
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {isExpanded ? "Hide Reason" : "View Reason"}
          </button>
        ) : <span className="text-neutral-400 font-medium">—</span>
      )
    },
    { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Downline Recharge Activity"
        subtitle="Recharges from every agent in your downline (direct + via distributors)."
      />

      {/* SUMMARY STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved Stats Card */}
        <div className="bg-gradient-to-br from-[#0F5132] to-[#198754] text-white border border-emerald-500/20 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-100/80">Approved Recharges</span>
            <div className="text-xl font-black text-white mt-1">{fmtMoney(stats.approved_amount || 0)}</div>
            <p className="text-[9.5px] text-emerald-100/80 font-semibold mt-0.5">{stats.approved_count || 0} Successful Requests</p>
          </div>
          <div className="p-2.5 bg-white/10 text-emerald-200 border border-white/10 rounded-xl shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Pending Stats Card */}
        <div className="bg-gradient-to-br from-[#664D03] to-[#FD7E14] text-white border border-orange-500/20 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-orange-100/80">Pending Recharges</span>
            <div className="text-xl font-black text-white mt-1">{fmtMoney(stats.pending_amount || 0)}</div>
            <p className="text-[9.5px] text-orange-100/80 font-semibold mt-0.5">{stats.pending_count || 0} Awaiting Review</p>
          </div>
          <div className="p-2.5 bg-white/10 text-orange-200 border border-white/10 rounded-xl shrink-0">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        {/* Rejected Stats Card */}
        <div className="bg-gradient-to-br from-[#842029] to-[#DC3545] text-white border border-rose-500/20 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-rose-100/80">Rejected Recharges</span>
            <div className="text-xl font-black text-white mt-1">{fmtMoney(stats.rejected_amount || 0)}</div>
            <p className="text-[9.5px] text-rose-100/80 font-semibold mt-0.5">{stats.rejected_count || 0} Declined Requests</p>
          </div>
          <div className="p-2.5 bg-white/10 text-rose-200 border border-white/10 rounded-xl shrink-0">
            <XCircle className="h-5 w-5" />
          </div>
        </div>

        {/* My Earnings Card */}
        <div className="bg-gradient-to-br from-[#0A3641] to-[#0D6EFD] text-white border border-blue-500/20 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-blue-100/80">My Earnings</span>
            <div className="text-xl font-black text-white mt-1">{fmtMoney(stats.earnings || 0)}</div>
            <p className="text-[9.5px] text-blue-100/80 font-semibold mt-0.5">Filter Period Commission</p>
          </div>
          <div className="p-2.5 bg-white/10 text-blue-200 border border-white/10 rounded-xl shrink-0">
            <Coins className="h-5 w-5" />
          </div>
        </div>
      </div>

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
        empty="No downline recharges found."
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
