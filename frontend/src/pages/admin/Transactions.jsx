import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Check, RotateCcw, Search, X, FileDown, FileSpreadsheet, Loader2, Eye, HelpCircle } from "lucide-react";
import { useWebSocketListener } from "@/lib/ws";

function RejectModal({ onClose, onConfirm, predefined = [] }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!reason.trim()) return toast.error("Please provide a reason for reversal");
    setBusy(true);
    try { await onConfirm(reason.trim()); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full border border-black/5 shadow-2xl animate-scaleUp" onClick={(e) => e.stopPropagation()} data-testid="tx-reject-modal">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <div className="text-base font-semibold">Reverse Transaction</div>
          <button onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {predefined.length > 0 ? (
            <div>
              <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block mb-1">
                Select Reversal Reason
              </label>
              <select
                className="w-full bg-[#F8F9FA] border border-black/5 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#4F46E5] transition-all"
                onChange={(e) => setReason(e.target.value)}
                value={reason}
              >
                <option value="">-- Choose Preconfigured Reason --</option>
                {predefined.map((r, idx) => (
                  <option key={idx} value={r}>{r}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-rose-500 font-bold bg-rose-50 p-3.5 rounded-xl border border-rose-100">
              No reversal reasons configured. Please add reasons for Bill Payment Page in Reason Entry menu first.
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button type="button" onClick={confirm} disabled={busy || !reason} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold flex-1 disabled:opacity-50 disabled:cursor-not-allowed" data-testid="tx-reject-confirm">
              {busy ? "Reversing…" : "Confirm Reverse"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminTransactions() {
  const [items, setItems] = useState(() => {
    try {
      const v = localStorage.getItem("mfp_cache_admin_transactions");
      return v ? JSON.parse(v) : [];
    } catch { return []; }
  });
  const [total, setTotal] = useState(() => items.length);
  const [loading, setLoading] = useState(() => items.length === 0);
  const [detail, setDetail] = useState(null);
  const [agents, setAgents] = useState([]);
  const [banks, setBanks] = useState([]);
  const [billPayEnabled, setBillPayEnabled] = useState(() => {
    try {
      const v = localStorage.getItem("set_bill_pay_enabled");
      return v !== null ? JSON.parse(v) : true;
    } catch (e) { return true; }
  });

  const fetchToggles = useCallback(() => {
    api.get("/admin/settings/recharge-limits").then((r) => {
      const bpe = r.data.bill_pay_enabled ?? true;
      setBillPayEnabled(bpe);
      try { localStorage.setItem("set_bill_pay_enabled", JSON.stringify(bpe)); } catch (e) {}
    });
  }, []);

  const handleToggleBillPay = async (val) => {
    setBillPayEnabled(val);
    try { localStorage.setItem("set_bill_pay_enabled", JSON.stringify(val)); } catch (e) {}
    try {
      const res = await api.get("/admin/settings/recharge-limits");
      await api.put("/admin/settings/recharge-toggles", {
        qr_enabled: res.data.qr_enabled ?? true,
        recharge_enabled: res.data.recharge_enabled ?? true,
        withdrawal_enabled: res.data.withdrawal_enabled ?? true,
        bill_pay_enabled: val
      });
      toast.success(`Agent Bill Payment requests ${val ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update toggle");
      setBillPayEnabled(!val);
      try { localStorage.setItem("set_bill_pay_enabled", JSON.stringify(!val)); } catch (err) {}
    }
  };

  // filter state
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState(todayStr(-7));
  const [to, setTo] = useState(todayStr());
  const [customApplied, setCustomApplied] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const debouncedAgent = useDebounced(agentQuery, 350);
  const [bankQuery, setBankQuery] = useState("");
  const debouncedBank = useDebounced(bankQuery, 350);
  const [cardQuery, setCardQuery] = useState("");
  const debouncedCard = useDebounced(cardQuery, 350);
  const [amtQuery, setAmtQuery] = useState("");
  const debouncedAmt = useDebounced(amtQuery, 350);

  // Stats calculation
  const [stats, setStats] = useState(() => {
    try {
      const v = localStorage.getItem("mfp_cache_admin_transactions_stats");
      return v ? JSON.parse(v) : { success: 0, successCount: 0, pending: 0, pendingCount: 0, reversed: 0, reversedCount: 0 };
    } catch { return { success: 0, successCount: 0, pending: 0, pendingCount: 0, reversed: 0, reversedCount: 0 }; }
  });

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [predefinedReasons, setPredefinedReasons] = useState([]);

  useEffect(() => {
    fetchToggles();
  }, [fetchToggles]);

  useEffect(() => {
    api.get("/rejection-reasons/active?target=bill")
      .then((res) => setPredefinedReasons(res.data || []))
      .catch((e) => console.log("Failed to fetch bill reversal reasons:", e));
  }, []);

  const params = useMemo(() => {
    const { from_ts, to_ts } = range === "custom" && !customApplied
      ? { from_ts: null, to_ts: null }
      : rangeWindowIso(range, from, to);
    const p = { paginated: true, page, page_size: pageSize, type: "credit_card" };
    if (status !== "all") p.status = status;
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    if (debouncedAmt.trim()) p.amount = debouncedAmt.trim();
    if (debouncedAgent.trim()) p.agent_search = debouncedAgent.trim();
    if (debouncedBank.trim()) p.bank_search = debouncedBank.trim();
    if (debouncedCard.trim()) p.card_search = debouncedCard.trim();
    return p;
  }, [status, range, from, to, customApplied, debouncedQ, debouncedAmt, debouncedAgent, debouncedBank, debouncedCard, page, pageSize]);

  const reload = useCallback((silent = false) => {
    if (!silent && items.length === 0) setLoading(true);
    // paginated list
    const pagePromise = api.get("/admin/transactions", { params });

    // fetch optimized stats
    const statsParams = { ...params };
    delete statsParams.paginated;
    delete statsParams.page;
    delete statsParams.page_size;
    const statsPromise = api.get("/admin/transactions/stats", { params: statsParams });

    return Promise.all([pagePromise, statsPromise])
      .then(([pageRes, statsRes]) => {
        const fetchedItems = pageRes.data.items || [];
        setItems(fetchedItems);
        setTotal(pageRes.data.total || 0);

        const sd = statsRes.data || {};
        const parsedStats = {
          success: sd.success?.amount || 0,
          successCount: sd.success?.count || 0,
          pending: sd.pending?.amount || 0,
          pendingCount: sd.pending?.count || 0,
          reversed: sd.reversed?.amount || sd.failed?.amount || 0,
          reversedCount: sd.reversed?.count || sd.failed?.count || 0
        };
        setStats(parsedStats);

        if (page === 1 && status === "all" && range === "today" && !debouncedQ && !debouncedAgent && !debouncedBank && !debouncedAmt && !debouncedCard) {
          try {
            localStorage.setItem("mfp_cache_admin_transactions", JSON.stringify(fetchedItems));
            localStorage.setItem("mfp_cache_admin_transactions_stats", JSON.stringify(parsedStats));
          } catch (e) {}
        }
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [params, items.length, page, status, range, debouncedQ, debouncedAgent, debouncedBank, debouncedAmt, debouncedCard]);

  useEffect(() => { reload(); }, [reload]);

  useWebSocketListener("cc_bill_created", () => {
    reload(true);
  });

  useWebSocketListener("cc_bill_updated", () => {
    reload(true);
  });
  useEffect(() => { setPage(1); }, [status, debouncedAgent, debouncedBank, debouncedCard, range, from, to, customApplied, debouncedQ, debouncedAmt, pageSize]);

  const clearAll = () => {
    setQ(""); setStatus("all"); setRange("today"); setAgentQuery(""); setBankQuery(""); setCardQuery(""); setAmtQuery("");
    setFrom(todayStr(-7)); setTo(todayStr()); setCustomApplied(false); setPage(1);
  };

  const applyCustom = () => {
    if (!from || !to) return toast.error("Pick both From and To dates");
    if (from > to) return toast.error("From date cannot be after To date");
    setCustomApplied(true);
  };

  const approve = useCallback(async (id) => {
    try { await api.post(`/admin/transactions/${id}/approve`, { note: "" }); toast.success("Transaction marked as Success"); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  }, [reload]);

  const handleRejectConfirm = async (note) => {
    try {
      await api.post(`/admin/transactions/${rejectTargetId}/reject`, { note });
      toast.success("Transaction reversed; wallet refunded");
      setRejectTargetId(null);
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const reverse = useCallback(async (id) => {
    setRejectTargetId(id);
  }, []);

  const columns = useMemo(() => [
    { 
      key: "user_name", 
      label: "Agent / Created",
      render: (r) => {
        const d = r.created_at ? new Date(r.created_at) : null;
        const dateStr = d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
        const timeStr = d ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase() : "";
        let procName = r.reviewed_by_name || "Admin";
        if (procName === "Super Admin") procName = "Jignesh Vanani";

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
            {r.status !== "pending" && (
              <span className="text-[10px] font-bold text-slate-500 mt-0.5 block truncate max-w-[160px]" title={`Processed By: ${procName}`}>
                By: {procName}
              </span>
            )}
          </div>
        );
      }
    },
    { 
      key: "customer_name", 
      label: "Customer / Phone", 
      render: (r) => (
        <div className="flex flex-col items-center justify-center text-center leading-tight">
          <span className="font-semibold text-neutral-800 text-xs truncate max-w-[130px] block mx-auto" title={r.customer_name}>{r.customer_name || "—"}</span>
          <span className="text-[11px] text-neutral-500 font-mono mt-0.5">{r.customer_phone || "—"}</span>
        </div>
      ) 
    },
    { key: "operator", label: "Bank", render: (r) => <span className="max-w-[130px] truncate block mx-auto font-semibold text-xs text-center" title={r.operator}>{r.operator || "—"}</span> },
    { key: "card_last4", label: "Card", render: (r) => <span className="font-mono font-bold text-xs text-center block mx-auto">{r.card_last4 || "—"}</span> },
    { key: "bill_amount", label: "Bill Amount", render: (r) => (
      <div className="text-center">
        <div className="font-bold text-xs">{fmtMoney(r.bill_amount ?? r.amount)}</div>
        {r.total_amount != null && (
          <div className="text-[10px] text-neutral-500 font-medium">Total: {fmtMoney(r.total_amount)}</div>
        )}
      </div>
    ) },
    { key: "service_charge", label: "Charge", render: (r) => (
      <span className="font-semibold text-xs text-center block mx-auto">{fmtMoney(r.service_charge ?? 0)}</span>
    ) },
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
            data-testid={`tx-view-${r.id}`}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      ) 
    },
    { 
      key: "actions", 
      label: "Action", 
      render: (r) => {
        if (r.status === "pending") {
          return (
            <div className="flex items-center justify-center gap-1.5">
              <button 
                className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0" 
                onClick={() => approve(r.id)} 
                title="Approve Request"
                data-testid={`tx-approve-${r.id}`}
              >
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
              <button 
                className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0" 
                onClick={() => reverse(r.id)} 
                title="Reverse Transaction"
                data-testid={`tx-reverse-${r.id}`}
              >
                <RotateCcw className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
            </div>
          );
        }
        if (r.status === "success") {
          return (
            <div className="flex justify-center">
              <button 
                className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0" 
                onClick={() => reverse(r.id)} 
                title="Reverse Transaction"
                data-testid={`tx-reverse-${r.id}`}
              >
                <RotateCcw className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
            </div>
          );
        }
        return "—";
      } 
    },
  ], [approve, reverse]);

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
      a.download = `MAK_FIN_PAY_Bill_Payments_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Bill Payments PDF downloaded");
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
      a.download = `MAK_FIN_PAY_Bill_Payments_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Bill Payments Excel downloaded");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to download Excel");
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Bill Payments"
        subtitle="Approve or reverse credit card bill payments submitted by agents."
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
                <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Bill Pay Service</span>
                <button
                  onClick={() => handleToggleBillPay(!billPayEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    billPayEnabled ? "bg-[#2D6A4F]" : "bg-neutral-200"
                  }`}
                  type="button"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      billPayEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        }
      />

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
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
            {stats.pendingCount} Awaiting Status
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
      </div>

      {/* Filter / Search bar */}
      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="tx-filter-bar">
        {/* Filter Row: Consolidated 7 filters in 1 row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Customer, Mobile..."
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
              value={agentQuery}
              onChange={(e) => setAgentQuery(e.target.value)}
              placeholder="Search Agent Name"
              className="mfp-input !pr-10"
            />
            {agentQuery && (
              <button
                type="button"
                onClick={() => setAgentQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              value={bankQuery}
              onChange={(e) => setBankQuery(e.target.value)}
              placeholder="Search Bank Name"
              className="mfp-input !pr-10"
            />
            {bankQuery && (
              <button
                type="button"
                onClick={() => setBankQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              value={cardQuery}
              onChange={(e) => setCardQuery(e.target.value)}
              placeholder="Search Card Number"
              className="mfp-input !pr-10"
              data-testid="tx-card-search"
            />
            {cardQuery && (
              <button
                type="button"
                onClick={() => setCardQuery("")}
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
      {rejectTargetId && (
        <RejectModal
          onClose={() => setRejectTargetId(null)}
          onConfirm={handleRejectConfirm}
          predefined={predefinedReasons}
        />
      )}
      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scaleUp" onClick={(e) => e.stopPropagation()} data-testid="tx-detail-modal">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <div className="mfp-overline">Bill Payment Details</div>
                <div className="text-base font-bold text-neutral-800">{detail.user_name}</div>
              </div>
              <button onClick={() => setDetail(null)} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ["Agent Name", detail.user_name],
                ["Customer Name", detail.customer_name],
                ["Customer Phone", detail.customer_phone || "—"],
                ["Bank Operator", detail.operator],
                ["Card Last 4", detail.card_last4],
                ["Bill Amount", fmtMoney(detail.bill_amount ?? detail.amount)],
                ["Service Charge", fmtMoney(detail.service_charge ?? 0)],
                ["Total Amount Paid", fmtMoney(detail.total_amount ?? detail.amount)],
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


