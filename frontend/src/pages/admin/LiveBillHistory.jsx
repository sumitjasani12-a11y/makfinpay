import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Check, RotateCcw, Search, X, FileDown, FileSpreadsheet, Loader2, Eye, RefreshCw, HelpCircle } from "lucide-react";

const getShortTxnId = (id) => {
  if (!id) return "—";
  if (id.startsWith("Txn")) return id;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const padded = String(hash).padStart(10, "0");
  return `Txn${padded}`;
};


export default function AdminLiveBillHistory() {
  const { user } = useAuth();
  const [actionId, setActionId] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState([]);
  // filter state
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState(todayStr(-7));
  const [to, setTo] = useState(todayStr());
  const [customApplied, setCustomApplied] = useState(false);
  const [agentFilter, setAgentFilter] = useState("all");
  const [amtQuery, setAmtQuery] = useState("");
  const debouncedAmt = useDebounced(amtQuery, 350);
  const [txnIdQuery, setTxnIdQuery] = useState("");
  const debouncedTxnId = useDebounced(txnIdQuery, 350);
  const [apiTxnIdQuery, setApiTxnIdQuery] = useState("");
  const debouncedApiTxnId = useDebounced(apiTxnIdQuery, 350);

  // Stats calculation
  const [stats, setStats] = useState({ success: 0, successCount: 0, pending: 0, pendingCount: 0, reversed: 0, reversedCount: 0, totalProfit: 0 });

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState(null);
  const [rejectTargetId, setRejectTargetId] = useState(null);

  const [liveBillEnabled, setLiveBillEnabled] = useState(() => {
    try {
      const v = localStorage.getItem("set_live_bill_enabled");
      return v !== null ? JSON.parse(v) : true;
    } catch (e) { return true; }
  });

  const fetchToggles = useCallback(() => {
    api.get("/admin/settings/recharge-limits").then((r) => {
      const lbe = r.data.live_bill_enabled ?? true;
      setLiveBillEnabled(lbe);
      try { localStorage.setItem("set_live_bill_enabled", JSON.stringify(lbe)); } catch (e) {}
    });
  }, []);

  useEffect(() => {
    fetchToggles();
  }, [fetchToggles]);

  const params = useMemo(() => {
    const { from_ts, to_ts } = range === "custom" && !customApplied
      ? { from_ts: null, to_ts: null }
      : rangeWindowIso(range, from, to);
    const p = { paginated: true, page, page_size: pageSize, type: "live_bill" };
    if (status !== "all") p.status = status;
    if (agentFilter !== "all") p.agent_id = agentFilter;
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    if (debouncedAmt.trim()) p.amount = debouncedAmt.trim();
    if (debouncedTxnId.trim()) p.txn_id = debouncedTxnId.trim();
    if (debouncedApiTxnId.trim()) p.api_txn_id = debouncedApiTxnId.trim();
    return p;
  }, [status, agentFilter, range, from, to, customApplied, debouncedQ, debouncedAmt, debouncedTxnId, debouncedApiTxnId, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    const pagePromise = api.get("/admin/transactions", { params });

    const statsParams = { ...params };
    delete statsParams.paginated;
    delete statsParams.page;
    delete statsParams.page_size;
    const statsPromise = api.get("/admin/transactions", { params: statsParams });

    return Promise.all([pagePromise, statsPromise])
      .then(([pageRes, statsRes]) => {
        setItems(pageRes.data.items || []);
        setTotal(pageRes.data.total || 0);

        let success = 0, successCount = 0;
        let pending = 0, pendingCount = 0;
        let reversed = 0, reversedCount = 0;
        let totalProfit = 0;

        const allMatched = Array.isArray(statsRes.data) ? statsRes.data : (statsRes.data?.items || []);
        allMatched.forEach((item) => {
          const amt = item.bill_amount ?? item.amount ?? 0;
          if (item.status === "success") {
            success += amt;
            successCount++;
            totalProfit += (item.service_charge ?? 0) - (item.api_charge ?? 0);
          } else if (item.status === "pending") {
            pending += amt;
            pendingCount++;
          } else if (item.status === "reversed" || item.status === "failed") {
            reversed += amt;
            reversedCount++;
          }
        });
        setStats({ success, successCount, pending, pendingCount, reversed, reversedCount, totalProfit });
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleApprove = useCallback(async (id) => {
    if (!window.confirm("Are you sure you want to manually SUCCESS this live bill payment?")) return;
    setActionId(id);
    try {
      await api.post(`/admin/live-billpay/${id}/approve`, { note: "Manually approved by Super Admin" });
      toast.success("Transaction approved successfully!");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to approve transaction");
    } finally {
      setActionId(null);
    }
  }, [reload]);

  const handleReject = useCallback(async (id) => {
    if (!window.confirm("Are you sure you want to REVERSE this live bill payment and REFUND the agent's wallet?")) return;
    setActionId(id);
    try {
      await api.post(`/admin/live-billpay/${id}/reject`, { note: "Manually reversed/refunded by Super Admin" });
      toast.success("Transaction reversed and refunded successfully!");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to reverse transaction");
    } finally {
      setActionId(null);
    }
  }, [reload]);

  const handleCheckStatus = useCallback(async (id) => {
    setActionId(id);
    try {
      const res = await api.post(`/admin/live-billpay/${id}/check-status`);
      toast.success(res.data?.message || "Status checked successfully!");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to check transaction status");
    } finally {
      setActionId(null);
    }
  }, [reload]);

  const handleToggleLiveBill = async (val) => {
    setLiveBillEnabled(val);
    try {
      const res = await api.get("/admin/settings/recharge-limits");
      await api.put("/admin/settings/recharge-toggles", {
        qr_enabled: res.data.qr_enabled ?? true,
        recharge_enabled: res.data.recharge_enabled ?? true,
        withdrawal_enabled: res.data.withdrawal_enabled ?? true,
        bill_pay_enabled: res.data.bill_pay_enabled ?? true,
        live_bill_enabled: val
      });
      toast.success(`Live Bill service ${val ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update toggle");
      setLiveBillEnabled(!val);
    }
  };

  const applyCustom = () => {
    setCustomApplied(true);
    setPage(1);
  };

  const clearAll = () => {
    setQ("");
    setStatus("all");
    setRange("today");
    setAgentFilter("all");
    setAmtQuery("");
    setTxnIdQuery("");
    setApiTxnIdQuery("");
    setCustomApplied(false);
    setPage(1);
  };

  const columns = useMemo(() => [
    { 
      key: "user_name", 
      label: "Agent / Created",
      render: (r) => {
        const d = r.created_at ? new Date(r.created_at) : null;
        const dateStr = d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
        const timeStr = d ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase() : "";
        return (
          <div className="flex flex-col items-center justify-center text-center leading-tight py-0.5">
            <span className="font-extrabold text-neutral-900 text-sm truncate max-w-[160px] block mx-auto" title={r.user_name}>
              {r.user_name || "—"}
            </span>
            {d && (
              <span className="text-[11px] text-neutral-500 font-semibold whitespace-nowrap mt-0.5">
                {dateStr}, {timeStr}
              </span>
            )}
          </div>
        );
      }
    },
    {
      key: "id",
      label: "Tx ID",
      render: (r) => (
        <span 
          className="bg-neutral-100 text-neutral-800 font-bold font-mono text-xs px-2 py-0.5 rounded-md uppercase select-all tracking-wider border border-neutral-200/80 cursor-pointer hover:bg-neutral-200 transition-colors whitespace-nowrap block mx-auto text-center"
          title={`Original ID: ${r.id}`}
        >
          {getShortTxnId(r.id)}
        </span>
      )
    },
    { key: "customer_phone", label: "Mobile", render: (r) => <span className="font-mono font-semibold text-xs text-center block mx-auto">{r.customer_phone || "—"}</span> },
    { key: "operator", label: "Operator", render: (r) => <span className="max-w-[130px] truncate block mx-auto font-semibold text-xs text-center" title={r.operator}>{r.operator || "—"}</span> },
    { key: "operator_txn_id", label: "API TXN ID", render: (r) => (
      <span className="font-mono text-xs text-neutral-800 font-bold whitespace-nowrap bg-neutral-100/80 px-2 py-0.5 rounded border border-neutral-200/60 block mx-auto text-center select-all">
        {r.operator_txn_id || "—"}
      </span>
    ) },
    { key: "bill_amount", label: "Bill Amount", render: (r) => (
      <div className="font-bold text-xs text-center">{fmtMoney(r.bill_amount ?? r.amount)}</div>
    ) },
    { key: "service_charge", label: "Charge", render: (r) => (
      <div className="font-semibold text-xs text-center text-rose-600">{fmtMoney(r.service_charge ?? 0)}</div>
    ) },
    { key: "api_charge", label: "API Charge", render: (r) => (
      <div className="font-semibold text-xs text-center text-rose-600">{fmtMoney(r.api_charge ?? 0)}</div>
    ) },
    { key: "profit_charge", label: "Profit", render: (r) => {
      const profit = (r.service_charge ?? 0) - (r.api_charge ?? 0);
      return (
        <div className={`font-bold text-xs text-center ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {fmtMoney(profit)}
        </div>
      );
    } },
    { key: "status", label: "Status", render: (r) => <div className="flex justify-center"><StatusBadge status={r.status} /></div> },
    { 
      key: "reason", 
      label: "Reason", 
      render: (r, { isExpanded, toggleExpand }) => {
        const isRejected = r.status === "reversed" || r.status === "rejected" || r.status === "failed";
        const note = r.note || r.rejection_reason || r.reason;
        if (isRejected && note) {
          return (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={toggleExpand}
                className={`px-2 py-1 text-xs font-bold rounded-lg border transition-all inline-flex items-center gap-1 cursor-pointer ${
                  isExpanded
                    ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                    : "bg-rose-50 text-rose-700 border-rose-200/80 hover:bg-rose-100/80 hover:border-rose-300"
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
                {isExpanded ? "Hide Reason" : "View Reason"}
              </button>
            </div>
          );
        }
        return <span className="text-neutral-400 font-medium">—</span>;
      } 
    },
    { 
      key: "view", 
      label: "View", 
      render: (r) => (
        <div className="flex justify-center">
          <button 
            className="p-1 border border-neutral-200 text-neutral-600 hover:bg-neutral-100 rounded transition-all inline-flex items-center justify-center bg-white shadow-2xs shrink-0" 
            onClick={() => setDetail(r)} 
            title="View Details" 
            data-testid={`live-view-${r.id}`}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      ) 
    },
    {
      key: "action",
      label: "Action",
      render: (r) => {
        const isSuperAdmin = user?.email === "jigs.vanani@gmail.com";
        const isBusy = actionId === r.id;
        if (r.status === "pending" && isSuperAdmin) {
          return (
            <div className="flex items-center gap-1.5 justify-center">
              <button
                disabled={isBusy}
                onClick={() => handleApprove(r.id)}
                title="Approve Transaction"
                className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
              <button
                disabled={isBusy}
                onClick={() => handleReject(r.id)}
                title="Reject Transaction"
                className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
              <button
                disabled={isBusy}
                onClick={() => handleCheckStatus(r.id)}
                title="Check Live Status"
                className="p-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 stroke-[2.5] ${isBusy ? "animate-spin" : ""}`} />
              </button>
            </div>
          );
        }
        if (r.status === "success" && isSuperAdmin) {
          return (
            <div className="flex items-center gap-1.5 justify-center">
              <button
                disabled={isBusy}
                onClick={() => handleReject(r.id)}
                className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0 disabled:opacity-50"
                title="Reverse transaction and refund agent wallet"
              >
                <RotateCcw className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
            </div>
          );
        }
        return <div className="text-neutral-400 text-center text-xs">—</div>;
      }
    }
  ], [user, actionId, handleApprove, handleReject, handleCheckStatus]);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const statsParams = { ...params };
      delete statsParams.paginated;
      delete statsParams.page;
      delete statsParams.page_size;
      const r = await api.get("/admin/transactions/export/pdf", { params: statsParams, responseType: "blob" });
      const blob = new Blob([r.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MAK_FIN_PAY_Live_Bills_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Live Bill Payments PDF downloaded");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to download PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const statsParams = { ...params };
      delete statsParams.paginated;
      delete statsParams.page;
      delete statsParams.page_size;
      const r = await api.get("/admin/transactions/export/csv", { params: statsParams, responseType: "blob" });
      const blob = new Blob([r.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MAK_FIN_PAY_Live_Bills_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Live Bill Payments Excel downloaded");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to download Excel");
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Live Bill History"
        subtitle="Monitor, verify status, and manage refunds for live utility bill payments."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="mfp-btn-outline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              data-testid="tx-export-pdf"
            >
              {exportingPdf
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing PDF…</>
                : <><FileDown className="h-4 w-4" /> Export PDF</>
              }
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="mfp-btn-outline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              data-testid="tx-export-excel"
            >
              {exportingExcel
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing Excel…</>
                : <><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Excel</>
              }
            </button>
            <div className="flex flex-wrap items-center gap-6 bg-white px-5 py-2.5 rounded-2xl border border-black/5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Live Bill service</span>
                <button
                  onClick={() => handleToggleLiveBill(!liveBillEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    liveBillEnabled ? "bg-[#2D6A4F]" : "bg-neutral-200"
                  }`}
                  type="button"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      liveBillEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        }
      />

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <div className="bg-emerald-50/60 border border-emerald-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block mb-1">Successful Payments</span>
            <h3 className="text-2xl font-bold text-emerald-900">{fmtMoney(stats.success)}</h3>
          </div>
          <div className="text-xs text-emerald-700 mt-2 font-medium">
            {stats.successCount} Completed Bills
          </div>
        </div>

        <div className="bg-amber-50/60 border border-amber-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider block mb-1">Pending Payments</span>
            <h3 className="text-2xl font-bold text-amber-900">{fmtMoney(stats.pending)}</h3>
          </div>
          <div className="text-xs text-amber-700 mt-2 font-medium">
            {stats.pendingCount} Processing Bills
          </div>
        </div>

        <div className="bg-rose-50/60 border border-rose-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider block mb-1">Reversed Payments</span>
            <h3 className="text-2xl font-bold text-rose-900">{fmtMoney(stats.reversed)}</h3>
          </div>
          <div className="text-xs text-rose-700 mt-2 font-medium">
            {stats.reversedCount} Refunded Bills
          </div>
        </div>

        <div className="bg-blue-50/60 border border-blue-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider block mb-1">Total Profit</span>
            <h3 className="text-2xl font-bold text-blue-900">{fmtMoney(stats.totalProfit)}</h3>
          </div>
          <div className="text-xs text-blue-700 mt-2 font-medium">
            From Successful Bills
          </div>
        </div>
      </div>

      {/* Filter / Search bar */}
      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="tx-filter-bar">
        {/* Filter Row: Consolidated 6 filters in 1 row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Agent, Mobile..."
              className="mfp-input !pl-11 !pr-10"
              data-testid="tx-search"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              value={txnIdQuery}
              onChange={(e) => setTxnIdQuery(e.target.value)}
              placeholder="Search Tx ID (Txn...)"
              className="mfp-input !pr-10"
            />
            {txnIdQuery && (
              <button
                type="button"
                onClick={() => setTxnIdQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              value={apiTxnIdQuery}
              onChange={(e) => setApiTxnIdQuery(e.target.value)}
              placeholder="Search API TXN ID"
              className="mfp-input !pr-10"
            />
            {apiTxnIdQuery && (
              <button
                type="button"
                onClick={() => setApiTxnIdQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
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
              data-testid="tx-amount-search"
            />
          </div>

          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mfp-input w-full"
              data-testid="tx-status-filter"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="reversed">Reversed</option>
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
              data-testid="tx-date-filter"
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
              <input type="date" max={to} className="mfp-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="tx-custom-from" />
            </div>
            <div>
              <label className="mfp-label">To</label>
              <input type="date" min={from} className="mfp-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="tx-custom-to" />
            </div>
            <button onClick={applyCustom} className="mfp-btn-primary" data-testid="tx-custom-apply">Apply</button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-black/5">
          <div className="text-sm text-neutral-600" data-testid="tx-results-count">
            {loading ? <span className="inline-flex items-center gap-1.5 text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#1B4332]" /></span> : <>Matched <span className="font-semibold">{total.toLocaleString("en-IN")}</span> transactions</>}
          </div>
          <button onClick={clearAll} className="mfp-btn-ghost" data-testid="tx-clear-all">
            <RotateCcw className="h-3.5 w-3.5" /> Clear All Filters
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        empty={loading ? <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 font-medium"><Loader2 className="h-5 w-5 animate-spin text-[#1B4332]" /></div> : "No transactions found for selected filters"}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
        }}
      />
      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scaleUp" onClick={(e) => e.stopPropagation()} data-testid="live-detail-modal">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <div className="mfp-overline">Live Bill Details</div>
                <div className="text-base font-bold text-neutral-800">{detail.user_name}</div>
              </div>
              <button onClick={() => setDetail(null)} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ["Agent Name", detail.user_name],
                ["Transaction ID", detail.id],
                ["Customer Mobile", detail.customer_phone || "—"],
                ["Biller / Operator", detail.operator],
                ["API Txn ID", detail.operator_txn_id || "—"],
                ["Bill Amount", fmtMoney(detail.bill_amount ?? detail.amount)],
                ["Service Charge", fmtMoney(detail.service_charge ?? 0)],
                ["API Charge", fmtMoney(detail.api_charge ?? 0)],
                ["Admin Profit", fmtMoney((detail.service_charge ?? 0) - (detail.api_charge ?? 0))],
                ["Created Date", fmtDate(detail.created_at)],
                ["Current Status", detail.status]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-black/5">
                  <span className="text-neutral-500 font-medium">{k}</span>
                  <span className="font-bold text-neutral-800">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
