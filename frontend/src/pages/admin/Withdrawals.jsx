import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { RotateCcw, Search, X } from "lucide-react";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const ROLES = [
  { key: "all", label: "All Roles" },
  { key: "agent", label: "Agents" },
  { key: "distributor", label: "Distributors" },
  { key: "master_distributor", label: "Master Distributors" },
];

export default function AdminWithdrawals() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);
  const [status, setStatus] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [range, setRange] = useState("lifetime");
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
    if (status !== "all") p.status = status;
    if (roleFilter !== "all") p.role_filter = roleFilter;
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    return p;
  }, [status, roleFilter, range, from, to, customApplied, debouncedQ, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    return api.get("/admin/withdrawals", { params })
      .then((r) => { setItems(r.data.items || []); setTotal(r.data.total || 0); })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load withdrawals"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [status, roleFilter, range, from, to, customApplied, debouncedQ, pageSize]);

  const clearAll = () => {
    setQ(""); setStatus("all"); setRoleFilter("all"); setRange("lifetime");
    setFrom(todayStr(-7)); setTo(todayStr()); setCustomApplied(false); setPage(1);
  };

  const applyCustom = () => {
    if (!from || !to) return toast.error("Pick both From and To dates");
    if (from > to) return toast.error("From date cannot be after To date");
    setCustomApplied(true);
  };

  const act = useCallback(async (id, type) => {
    try { await api.post(`/admin/withdrawals/${id}/${type}`, { note: "" }); toast.success(`Withdrawal ${type}d`); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  }, [reload]);

  const columns = useMemo(() => [
    { key: "user_name", label: "Requester" },
    { key: "role", label: "Role" },
    { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount) },
    { key: "account_holder", label: "Account Holder", render: (r) => r.bank?.account_holder || "—" },
    { key: "account_number", label: "Account Number", render: (r) => r.bank?.account_number || "—" },
    { key: "ifsc", label: "IFSC", render: (r) => r.bank?.ifsc || "—" },
    { key: "bank_name", label: "Bank Name", render: (r) => r.bank?.bank_name || "—" },
    { key: "phone_number", label: "Phone", render: (r) => r.bank?.phone_number || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Requested", render: (r) => fmtDate(r.created_at) },
    { key: "actions", label: "Action", render: (r) => r.status === "pending" ? (
      <div className="flex gap-2">
        <button className="rounded-lg bg-[#2D6A4F]/10 text-[#2D6A4F] hover:bg-[#2D6A4F]/20 px-3 py-1.5 text-xs font-semibold" onClick={() => act(r.id, "approve")} data-testid={`w-approve-${r.id}`}>Approve</button>
        <button className="rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-1.5 text-xs font-semibold" onClick={() => act(r.id, "reject")} data-testid={`w-reject-${r.id}`}>Reject</button>
      </div>
    ) : <span className="text-xs text-neutral-500">—</span> },
  ], [act]);

  return (
    <div>
      <PageHeader title="Withdrawal Approvals" subtitle="Review withdrawal requests from agents and distributors." />

      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="withdrawal-filter-bar">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by Requester, Account Holder, Account No, IFSC, Bank, Phone…"
              className="mfp-input !pl-11 !pr-10"
              data-testid="withdrawal-search"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                data-testid="withdrawal-search-clear"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="mfp-input lg:w-56" data-testid="withdrawal-role-filter"
          >
            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="mfp-overline mr-1 self-center">Status:</span>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${status === s.key ? "bg-[#1B4332] text-white" : "bg-[#F4F3ED] text-neutral-700 hover:bg-[#E8E5D7]"}`}
              data-testid={`withdrawal-status-${s.key}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="mfp-overline mr-1 self-center">Date:</span>
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => { setRange(r.key); if (r.key !== "custom") setCustomApplied(false); }}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${range === r.key ? "bg-[#1B4332] text-white" : "bg-[#F4F3ED] text-neutral-700 hover:bg-[#E8E5D7]"}`}
              data-testid={`withdrawal-range-${r.key}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === "custom" && (
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div>
              <label className="mfp-label">From</label>
              <input type="date" max={to} className="mfp-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="withdrawal-custom-from" />
            </div>
            <div>
              <label className="mfp-label">To</label>
              <input type="date" min={from} className="mfp-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="withdrawal-custom-to" />
            </div>
            <button onClick={applyCustom} className="mfp-btn-primary" data-testid="withdrawal-custom-apply">Apply</button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-black/5">
          <div className="text-sm text-neutral-600" data-testid="withdrawal-results-count">
            {loading ? "Loading…" : <>Matched <span className="font-semibold">{total.toLocaleString("en-IN")}</span> requests</>}
          </div>
          <button onClick={clearAll} className="mfp-btn-ghost" data-testid="withdrawal-clear-all">
            <RotateCcw className="h-3.5 w-3.5" /> Clear All Filters
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        empty={loading ? "Loading…" : "No withdrawal requests found for selected filters"}
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
