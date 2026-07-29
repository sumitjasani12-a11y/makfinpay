import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Check, RotateCcw, Search, X, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";

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
  const [stats, setStats] = useState({ success: 0, successCount: 0, pending: 0, pendingCount: 0, reversed: 0, reversedCount: 0 });

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [rejectTargetId, setRejectTargetId] = useState(null);

  const [liveBillEnabled, setLiveBillEnabled] = useState(true);

  const fetchToggles = useCallback(() => {
    api.get("/admin/settings/recharge-limits").then((r) => {
      setLiveBillEnabled(r.data.live_bill_enabled ?? true);
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

        const allMatched = statsRes.data || [];
        allMatched.forEach((item) => {
          const amt = item.bill_amount ?? item.amount ?? 0;
          if (item.status === "success") {
            success += amt;
            successCount++;
          } else if (item.status === "pending") {
            pending += amt;
            pendingCount++;
          } else if (item.status === "reversed" || item.status === "failed") {
            reversed += amt;
            reversedCount++;
          }
        });
        setStats({ success, successCount, pending, pendingCount, reversed, reversedCount });
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    reload();
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
      key: "id",
      label: "Tx ID",
      render: (r) => (
        <span 
          className="bg-neutral-100 text-neutral-600 font-mono text-[10px] px-2.5 py-1 rounded-md uppercase select-all tracking-wider border border-neutral-200/50 cursor-pointer hover:bg-neutral-200 transition-colors whitespace-nowrap"
          title={`Original ID: ${r.id}`}
        >
          {getShortTxnId(r.id)}
        </span>
      )
    },
    { key: "user_name", label: "Agent" },
    { key: "customer_phone", label: "Mobile", render: (r) => r.customer_phone || "—" },
    { key: "operator", label: "Biller / Operator" },
    { key: "operator_txn_id", label: "API TXN ID", render: (r) => (
      <span className="font-mono text-[10px] text-neutral-600 font-bold whitespace-nowrap bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200/40">
        {r.operator_txn_id || "—"}
      </span>
    ) },
    { key: "bill_amount", label: "Bill Amount", render: (r) => (
      <div className="font-semibold text-right">{fmtMoney(r.bill_amount ?? r.amount)}</div>
    ) },
    { key: "service_charge", label: "Charge", render: (r) => (
      <div className="font-semibold text-right text-rose-600">{fmtMoney(r.service_charge ?? 0)}</div>
    ) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", label: "Date", render: (r) => fmtDate(r.created_at) },
    { key: "note", label: "API Response / Note", render: (r) => (
      <div className="max-w-[200px] truncate text-xs text-neutral-500" title={r.note || ""}>
        {r.note || "—"}
      </div>
    ) },
  ], []);

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
    </div>
  );
}
