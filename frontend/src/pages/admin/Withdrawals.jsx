import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { RotateCcw, Search, X } from "lucide-react";

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
  const [withdrawalEnabled, setWithdrawalEnabled] = useState(true);

  const fetchToggles = useCallback(() => {
    api.get("/admin/settings/recharge-limits").then((r) => {
      setWithdrawalEnabled(r.data.withdrawal_enabled ?? true);
    });
  }, []);

  const handleToggleWithdrawal = async (val) => {
    setWithdrawalEnabled(val);
    try {
      const res = await api.get("/admin/settings/recharge-limits");
      await api.put("/admin/settings/recharge-toggles", {
        qr_enabled: res.data.qr_enabled ?? true,
        recharge_enabled: res.data.recharge_enabled ?? true,
        withdrawal_enabled: val
      });
      toast.success(`Agent Withdrawal requests ${val ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update toggle");
      setWithdrawalEnabled(!val);
    }
  };

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);
  const [status, setStatus] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [range, setRange] = useState("lifetime");
  const [from, setFrom] = useState(todayStr(-7));
  const [to, setTo] = useState(todayStr());
  const [customApplied, setCustomApplied] = useState(false);
  const [amtQuery, setAmtQuery] = useState("");
  const debouncedAmt = useDebounced(amtQuery, 350);

  // Stats calculation
  const [stats, setStats] = useState({ approved: 0, approvedCount: 0, pending: 0, pendingCount: 0, rejected: 0, rejectedCount: 0 });

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
    if (debouncedAmt.trim()) p.amount = debouncedAmt.trim();
    return p;
  }, [status, roleFilter, range, from, to, customApplied, debouncedQ, debouncedAmt, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    // paginated list
    const pagePromise = api.get("/admin/withdrawals", { params });

    // unpaginated list for correct totals
    const statsParams = { ...params };
    delete statsParams.paginated;
    delete statsParams.page;
    delete statsParams.page_size;
    const statsPromise = api.get("/admin/withdrawals", { params: statsParams });

    return Promise.all([pagePromise, statsPromise])
      .then(([pageRes, statsRes]) => {
        setItems(pageRes.data.items || []);
        setTotal(pageRes.data.total || 0);

        let approved = 0, approvedCount = 0;
        let pending = 0, pendingCount = 0;
        let rejected = 0, rejectedCount = 0;

        const allMatched = statsRes.data || [];
        allMatched.forEach((item) => {
          const amt = item.amount || 0;
          if (item.status === "approved") {
            approved += amt;
            approvedCount++;
          } else if (item.status === "pending") {
            pending += amt;
            pendingCount++;
          } else if (item.status === "rejected") {
            rejected += amt;
            rejectedCount++;
          }
        });
        setStats({ approved, approvedCount, pending, pendingCount, rejected, rejectedCount });
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load withdrawals"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); fetchToggles(); }, [reload, fetchToggles]);
  useEffect(() => { setPage(1); }, [status, roleFilter, range, from, to, customApplied, debouncedQ, debouncedAmt, pageSize]);

  const clearAll = () => {
    setQ(""); setStatus("all"); setRoleFilter("all"); setRange("lifetime"); setAmtQuery("");
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
    { key: "role", label: "Role", render: (r) => <span className="capitalize">{r.role?.replace("_", " ")}</span> },
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
      <PageHeader
        title="Withdrawal Approvals"
        subtitle="Review withdrawal requests from agents and distributors."
        actions={
          <div className="flex flex-wrap items-center gap-6 bg-white px-5 py-2.5 rounded-2xl border border-black/5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Withdrawal Service</span>
              <button
                onClick={() => handleToggleWithdrawal(!withdrawalEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  withdrawalEnabled ? "bg-[#2D6A4F]" : "bg-neutral-200"
                }`}
                type="button"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    withdrawalEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        }
      />

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div className="bg-emerald-50/60 border border-emerald-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block mb-1">Approved Withdrawals</span>
            <h3 className="text-2xl font-bold text-emerald-900">{fmtMoney(stats.approved)}</h3>
          </div>
          <div className="text-xs text-emerald-700 mt-2 font-medium">
            {stats.approvedCount} Successful Payouts
          </div>
        </div>

        <div className="bg-amber-50/60 border border-amber-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider block mb-1">Pending Withdrawals</span>
            <h3 className="text-2xl font-bold text-amber-900">{fmtMoney(stats.pending)}</h3>
          </div>
          <div className="text-xs text-amber-700 mt-2 font-medium">
            {stats.pendingCount} Awaiting Review
          </div>
        </div>

        <div className="bg-rose-50/60 border border-rose-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider block mb-1">Rejected Withdrawals</span>
            <h3 className="text-2xl font-bold text-rose-900">{fmtMoney(stats.rejected)}</h3>
          </div>
          <div className="text-xs text-rose-700 mt-2 font-medium">
            {stats.rejectedCount} Declined Requests
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="withdrawal-filter-bar">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Requester, Account, Bank..."
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

          <div>
            <input
              type="text"
              value={amtQuery}
              onChange={(e) => setAmtQuery(e.target.value)}
              placeholder="Search Amount ₹"
              className="mfp-input"
              data-testid="withdrawal-amount-search"
            />
          </div>

          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mfp-input w-full"
              data-testid="withdrawal-status-filter"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="mfp-input w-full"
              data-testid="withdrawal-role-filter"
            >
              {ROLES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={range}
              onChange={(e) => {
                setRange(e.target.value);
                if (e.target.value !== "custom") setCustomApplied(false);
              }}
              className="mfp-input w-full"
              data-testid="withdrawal-date-filter"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {range === "custom" && (
          <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-black/5">
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
