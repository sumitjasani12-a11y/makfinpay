import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Check, RotateCcw, Search, X, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { useWebSocketListener } from "@/lib/ws";

function RejectModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [predefined, setPredefined] = useState([]);

  useEffect(() => {
    api.get("/rejection-reasons/active?target=bill")
      .then((res) => setPredefined(res.data || []))
      .catch((e) => console.log("Failed to fetch bill reversal reasons:", e));
  }, []);

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
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState([]);
  const [banks, setBanks] = useState([]);
  const [billPayEnabled, setBillPayEnabled] = useState(true);

  const fetchToggles = useCallback(() => {
    api.get("/admin/settings/recharge-limits").then((r) => {
      setBillPayEnabled(r.data.bill_pay_enabled ?? true);
    });
  }, []);

  const handleToggleBillPay = async (val) => {
    setBillPayEnabled(val);
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
  const [amtQuery, setAmtQuery] = useState("");
  const debouncedAmt = useDebounced(amtQuery, 350);

  // Stats calculation
  const [stats, setStats] = useState({ success: 0, successCount: 0, pending: 0, pendingCount: 0, reversed: 0, reversedCount: 0 });

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [rejectTargetId, setRejectTargetId] = useState(null);

  useEffect(() => {
    fetchToggles();
  }, [fetchToggles]);

  const params = useMemo(() => {
    const { from_ts, to_ts } = range === "custom" && !customApplied
      ? { from_ts: null, to_ts: null }
      : rangeWindowIso(range, from, to);
    const p = { paginated: true, page, page_size: pageSize, type: "bill" };
    if (status !== "all") p.status = status;
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    if (debouncedAmt.trim()) p.amount = debouncedAmt.trim();
    if (debouncedAgent.trim()) p.agent_search = debouncedAgent.trim();
    if (debouncedBank.trim()) p.bank_search = debouncedBank.trim();
    return p;
  }, [status, range, from, to, customApplied, debouncedQ, debouncedAmt, debouncedAgent, debouncedBank, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    // paginated list
    const pagePromise = api.get("/admin/transactions", { params });

    // unpaginated list for correct totals
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

        const allMatched = statsRes.data || [];
        allMatched.forEach((item) => {
          const amt = item.bill_amount ?? item.amount ?? 0;
          if (item.status === "success") {
            success += amt;
            successCount++;
          } else if (item.status === "pending") {
            pending += amt;
            pendingCount++;
          } else if (item.status === "reversed") {
            reversed += amt;
            reversedCount++;
          }
        });
        setStats({ success, successCount, pending, pendingCount, reversed, reversedCount });
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); }, [reload]);

  useWebSocketListener("cc_bill_created", () => {
    reload();
    toast.info("New Credit Card Bill payment request received!");
  });

  useWebSocketListener("cc_bill_updated", () => {
    reload();
  });
  useEffect(() => { setPage(1); }, [status, debouncedAgent, debouncedBank, range, from, to, customApplied, debouncedQ, debouncedAmt, pageSize]);

  const clearAll = () => {
    setQ(""); setStatus("all"); setRange("today"); setAgentQuery(""); setBankQuery(""); setAmtQuery("");
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
    { key: "user_name", label: "Agent" },
    { key: "customer_name", label: "Customer" },
    { key: "customer_phone", label: "Customer Phone", render: (r) => r.customer_phone || "—" },
    { key: "operator", label: "Bank" },
    { key: "card_last4", label: "Card", render: (r) => `**** ${r.card_last4}` },
    { key: "bill_amount", label: "Bill Amount", render: (r) => (
      <div className="text-right">
        <div className="font-semibold">{fmtMoney(r.bill_amount ?? r.amount)}</div>
        {r.total_amount != null && (
          <div className="text-[10px] text-neutral-500">Total: {fmtMoney(r.total_amount)}</div>
        )}
      </div>
    ) },
    { key: "service_charge", label: "Charge", render: (r) => (
      <span className="font-medium">{fmtMoney(r.service_charge ?? 0)}</span>
    ) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Date", render: (r) => fmtDate(r.created_at) },
    { key: "actions", label: "Action", render: (r) => {
      if (r.status === "pending") {
        return (
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-[#2D6A4F]/10 text-[#2D6A4F] hover:bg-[#2D6A4F]/20 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
              onClick={() => approve(r.id)}
              data-testid={`tx-approve-${r.id}`}
            ><Check className="h-3 w-3" /> Mark Success</button>
            <button
              className="rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
              onClick={() => reverse(r.id)}
              data-testid={`tx-reverse-${r.id}`}
            ><RotateCcw className="h-3 w-3" /> Reverse</button>
          </div>
        );
      }
      if (r.status === "success") {
        return (
          <button
            className="rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
            onClick={() => reverse(r.id)}
            data-testid={`tx-reverse-${r.id}`}
          ><RotateCcw className="h-3 w-3" /> Reverse</button>
        );
      }
      return <span className="text-xs text-neutral-500">—</span>;
    } },
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
        {/* Filter Row: Consolidated 6 filters in 1 row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
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
            {loading ? "Loading…" : <>Matched <span className="font-semibold">{total.toLocaleString("en-IN")}</span> transactions</>}
          </div>
          <button onClick={clearAll} className="mfp-btn-ghost" data-testid="tx-clear-all">
            <RotateCcw className="h-3.5 w-3.5" /> Clear All Filters
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        empty={loading ? "Loading…" : "No transactions found for selected filters"}
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
        />
      )}
    </div>
  );
}


