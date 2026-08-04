import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney, fileUrl } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import ZoomableImage from "@/components/ZoomableImage";
import { toast } from "sonner";
import { Eye, Check, X, Search, RotateCcw, FileDown, FileSpreadsheet, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useWebSocketListener } from "@/lib/ws";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function RejectModal({ onClose, onConfirm, predefined = [] }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!reason.trim()) return toast.error("Please provide a rejection reason");
    setBusy(true);
    try { await onConfirm(reason.trim()); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full border border-black/5 shadow-2xl animate-scaleUp" onClick={(e) => e.stopPropagation()} data-testid="recharge-reject-modal">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <div className="text-base font-semibold">Reject Recharge Request</div>
          <button onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {predefined.length > 0 ? (
            <div>
              <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block mb-1">
                Select Rejection Reason
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
              No rejection reasons configured. Please add reasons for QR Payment Page in Reason Entry menu first.
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button type="button" onClick={confirm} disabled={busy || !reason} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold flex-1 disabled:opacity-50 disabled:cursor-not-allowed" data-testid="recharge-reject-confirm">
              {busy ? "Rejecting…" : "Confirm Reject"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminRecharges() {
  const [items, setItems] = useState(() => {
    try {
      const v = localStorage.getItem("mfp_cache_admin_recharges");
      return v ? JSON.parse(v) : [];
    } catch { return []; }
  });
  const [total, setTotal] = useState(() => items.length);
  const [loading, setLoading] = useState(() => items.length === 0);
  const [detail, setDetail] = useState(null);
  const [adminOcrBypass, setAdminOcrBypass] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [predefinedReasons, setPredefinedReasons] = useState([]);

  useEffect(() => {
    api.get("/rejection-reasons/active?target=qr")
      .then((res) => setPredefinedReasons(res.data || []))
      .catch((e) => console.log("Failed to fetch recharge rejection reasons:", e));
  }, []);

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
  const [qrQuery, setQrQuery] = useState("");
  const debouncedQr = useDebounced(qrQuery, 350);
  const [amtQuery, setAmtQuery] = useState("");
  const debouncedAmt = useDebounced(amtQuery, 350);

  // Stats calculation
  const [stats, setStats] = useState(() => {
    try {
      const v = localStorage.getItem("mfp_cache_admin_recharges_stats");
      return v ? JSON.parse(v) : { approved: 0, approvedCount: 0, pending: 0, pendingCount: 0, rejected: 0, rejectedCount: 0 };
    } catch { return { approved: 0, approvedCount: 0, pending: 0, pendingCount: 0, rejected: 0, rejectedCount: 0 }; }
  });

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Build query params (server-side filtering + pagination).
  const params = useMemo(() => {
    const { from_ts, to_ts } = range === "custom" && !customApplied
      ? { from_ts: null, to_ts: null }
      : rangeWindowIso(range, from, to);
    const p = { paginated: true, page, page_size: pageSize };
    if (status !== "all") p.status = status;
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    if (debouncedAmt.trim()) p.amount = debouncedAmt.trim();
    if (debouncedAgent.trim()) p.agent_search = debouncedAgent.trim();
    if (debouncedQr.trim()) p.qr_search = debouncedQr.trim();
    return p;
  }, [status, range, from, to, customApplied, debouncedQ, debouncedAmt, debouncedAgent, debouncedQr, page, pageSize]);

  const reload = useCallback((silent = false) => {
    if (!silent && items.length === 0) setLoading(true);
    // paginated list
    const pagePromise = api.get("/admin/recharges", { params });

    // fetch optimized stats
    const statsParams = { ...params };
    delete statsParams.paginated;
    delete statsParams.page;
    delete statsParams.page_size;
    const statsPromise = api.get("/admin/recharges/stats", { params: statsParams });

    return Promise.all([pagePromise, statsPromise])
      .then(([pageRes, statsRes]) => {
        const fetchedItems = pageRes.data.items || [];
        setItems(fetchedItems);
        setTotal(pageRes.data.total || 0);

        const sd = statsRes.data || {};
        const parsedStats = {
          approved: sd.approved?.amount || 0,
          approvedCount: sd.approved?.count || 0,
          pending: sd.pending?.amount || 0,
          pendingCount: sd.pending?.count || 0,
          rejected: sd.rejected?.amount || 0,
          rejectedCount: sd.rejected?.count || 0
        };
        setStats(parsedStats);

        if (page === 1 && status === "all" && range === "today" && !debouncedQ && !debouncedAgent && !debouncedQr && !debouncedAmt) {
          try {
            localStorage.setItem("mfp_cache_admin_recharges", JSON.stringify(fetchedItems));
            localStorage.setItem("mfp_cache_admin_recharges_stats", JSON.stringify(parsedStats));
          } catch (e) {}
        }
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load recharges"))
      .finally(() => setLoading(false));
  }, [params, items.length, page, status, range, debouncedQ, debouncedAgent, debouncedQr, debouncedAmt]);

  useEffect(() => { reload(); }, [reload]);

  useWebSocketListener("recharge_created", () => {
    reload(true);
  });

  useWebSocketListener("recharge_updated", () => {
    reload(true);
  });

  // Reset page to 1 when any filter (other than page/pageSize) changes.
  useEffect(() => { setPage(1); }, [status, debouncedAgent, debouncedQr, range, from, to, customApplied, debouncedQ, debouncedAmt, pageSize]);

  const clearAll = () => {
    setQ(""); setStatus("all"); setRange("today"); setAgentQuery(""); setQrQuery(""); setAmtQuery("");
    setFrom(todayStr(-7)); setTo(todayStr()); setCustomApplied(false); setPage(1);
  };

  const applyCustom = () => {
    if (!from || !to) return toast.error("Pick both From and To dates");
    if (from > to) return toast.error("From date cannot be after To date");
    setCustomApplied(true);
  };

  const handleRejectConfirm = async (note) => {
    try {
      await api.post(`/admin/recharges/${rejectTargetId}/reject`, { note: note || "" });
      toast.success("Recharge rejected");
      setRejectTargetId(null);
      setDetail(null);
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || e.message);
    }
  };

  const act = useCallback(async (id, type) => {
    if (type === "reject") {
      setRejectTargetId(id);
      return;
    }
    try {
      await api.post(`/admin/recharges/${id}/approve`, { note: "" });
      toast.success(`Recharge approved`);
      setDetail(null);
      reload();
    }
    catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || e.message);
    }
  }, [reload]);

  const columns = useMemo(() => [
    { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
    { key: "user_name", label: "Agent" },
    { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount) },
    { key: "utr", label: "UTR" },
    { key: "qr_code_label", label: "QR Code", render: (r) => r.qr_code_label || "N/A" },
    { key: "card_last4", label: "Card / Acc (Last 4)", render: (r) => r.card_last4 ? `XXXX ${r.card_last4}` : "N/A" },
    { key: "commission_percent", label: "Comm %", render: (r) => `${r.commission_percent}%` },
    { key: "commission_charge", label: "Commission Charge", render: (r) => r.status === "approved" ? fmtMoney(r.commission_amount) : fmtMoney(r.amount * r.commission_percent / 100) },
    { key: "admin_revenue_amount", label: "Admin Comm", render: (r) => r.status === "approved" ? fmtMoney(r.admin_revenue_amount) : "—" },
    { key: "md_earnings_amount", label: "S.Dist Comm", render: (r) => r.status === "approved" ? fmtMoney(r.md_earnings_amount) : "—" },
    { key: "distributor_earnings_amount", label: "Dist Comm", render: (r) => r.status === "approved" ? fmtMoney(r.distributor_earnings_amount) : "—" },
    { key: "credit_amount", label: "Net Credit", render: (r) => r.status === "approved" ? fmtMoney(r.credit_amount) : "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "actions", label: "Action", render: (r) => (
      <div className="flex items-center gap-2">
        <button className="p-1.5 border border-neutral-200 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-all inline-flex items-center justify-center bg-white shadow-xs shrink-0" onClick={() => setDetail(r)} title="View Details" data-testid={`view-${r.id}`}><Eye className="h-3.5 w-3.5" /></button>
        {r.status === "pending" && (<>
          <button className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 font-bold text-xs px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-all shrink-0 shadow-xs" onClick={() => act(r.id, "approve")} data-testid={`approve-${r.id}`}><Check className="h-3.5 w-3.5 stroke-[2.5]" /> Approve</button>
          <button className="bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 font-bold text-xs px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-all shrink-0 shadow-xs" onClick={() => act(r.id, "reject")} data-testid={`reject-${r.id}`}><X className="h-3.5 w-3.5 stroke-[2.5]" /> Reject</button>
        </>)}
      </div>
    ) },
  ], [act]);

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
      const r = await api.get("/admin/recharges/export/pdf", { params: statsParams, responseType: "blob" });
      const blob = new Blob([r.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MAK_FIN_PAY_Recharge_Approvals_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Recharge Approvals PDF downloaded");
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
      const r = await api.get("/admin/recharges/export/csv", { params: statsParams, responseType: "blob" });
      const blob = new Blob([r.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MAK_FIN_PAY_Recharge_Approvals_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Recharge Approvals Excel downloaded");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to download Excel");
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Recharge Approvals"
        subtitle="Verify UPI payments, approve to credit agent wallet (after commission)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="mfp-btn-outline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              data-testid="recharges-export-pdf"
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
              data-testid="recharges-export-excel"
            >
              {exportingExcel
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing Excel…</>
                : <><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Excel</>
              }
            </button>
          </div>
        }
      />

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div className="bg-emerald-50/60 border border-emerald-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block mb-1">Approved Recharges</span>
            <h3 className="text-2xl font-bold text-emerald-900">{fmtMoney(stats.approved)}</h3>
          </div>
          <div className="text-xs text-emerald-700 mt-2 font-medium">
            {stats.approvedCount} Successful Requests
          </div>
        </div>

        <div className="bg-amber-50/60 border border-amber-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider block mb-1">Pending Recharges</span>
            <h3 className="text-2xl font-bold text-amber-900">{fmtMoney(stats.pending)}</h3>
          </div>
          <div className="text-xs text-amber-700 mt-2 font-medium">
            {stats.pendingCount} Under Review
          </div>
        </div>

        <div className="bg-rose-50/60 border border-rose-500/10 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider block mb-1">Rejected Recharges</span>
            <h3 className="text-2xl font-bold text-rose-900">{fmtMoney(stats.rejected)}</h3>
          </div>
          <div className="text-xs text-rose-700 mt-2 font-medium">
            {stats.rejectedCount} Declined Requests
          </div>
        </div>
      </div>

      {/* Filter / Search bar */}
      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="recharge-filter-bar">
        {/* Filter Row: Consolidated 6 filters in 1 row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search UTR, Card..."
              className="mfp-input !pl-11 !pr-10"
              data-testid="recharge-search"
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
              value={qrQuery}
              onChange={(e) => setQrQuery(e.target.value)}
              placeholder="Search QR Code"
              className="mfp-input !pr-10"
            />
            {qrQuery && (
              <button
                type="button"
                onClick={() => setQrQuery("")}
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
              data-testid="recharge-amount-search"
            />
          </div>

          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mfp-input w-full"
              data-testid="recharge-status-filter"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
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
              data-testid="recharge-date-filter"
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
              <input type="date" max={to} className="mfp-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="recharge-custom-from" />
            </div>
            <div>
              <label className="mfp-label">To</label>
              <input type="date" min={from} className="mfp-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="recharge-custom-to" />
            </div>
            <button onClick={applyCustom} className="mfp-btn-primary" data-testid="recharge-custom-apply">Apply</button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-black/5">
          <div className="text-sm text-neutral-600" data-testid="recharge-results-count">
            {loading ? <span className="inline-flex items-center gap-1.5 text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#1B4332]" /></span> : <>Matched <span className="font-semibold">{total.toLocaleString("en-IN")}</span> requests</>}
          </div>
          <button onClick={clearAll} className="mfp-btn-ghost" data-testid="recharge-clear-all">
            <RotateCcw className="h-3.5 w-3.5" /> Clear All Filters
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        empty={loading ? <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 font-medium"><Loader2 className="h-5 w-5 animate-spin text-[#1B4332]" /></div> : "No recharge requests found for selected filters"}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
        }}
      />

      {/* Detail modal */}
      {detail && (() => {
        const hasOcr = typeof detail.ocr_match === "boolean";
        const ocrMismatch = hasOcr && !detail.ocr_match;
        const isApproveDisabled = detail.status === "pending" && ocrMismatch && !adminOcrBypass;
        
        return (
          <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={() => { setDetail(null); setAdminOcrBypass(false); }}>
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="recharge-detail-modal">
              <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
                <div>
                  <div className="mfp-overline">Recharge Request</div>
                  <div className="text-lg font-medium">{detail.user_name}</div>
                </div>
                <button onClick={() => { setDetail(null); setAdminOcrBypass(false); }} className="mfp-btn-ghost p-2" data-testid="recharge-detail-close"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid md:grid-cols-2 gap-6 p-6">
                <div className="space-y-3 text-sm">
                  {[
                    ["Amount", fmtMoney(detail.amount)],
                    ["UTR / Reference", detail.utr || "—"],
                    ["QR Code Used", detail.qr_code_label || "N/A"],
                    ["Created", fmtDate(detail.created_at)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-black/5 pb-2">
                      <span className="text-neutral-500">{k}</span>
                      <span className="font-medium text-right">{v}</span>
                    </div>
                  ))}

                  {/* OCR Analysis Details Card */}
                  {hasOcr ? (
                    <div className="mt-4 border border-black/5 rounded-2xl p-4 bg-slate-50/50 space-y-3.5">
                      <div className="flex items-center justify-between border-b border-black/5 pb-2">
                        <span className="text-xs font-bold text-neutral-700 tracking-wide uppercase">OCR Validation Details</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${detail.ocr_match ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                          {detail.ocr_match ? "Auto-Verified ✓" : "Mismatch Warning ✗"}
                        </span>
                      </div>
                      
                      {detail.ocr_bypass && !detail.ocr_match && (
                        <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-2.5 flex items-start gap-2">
                          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <span className="text-[10px] text-amber-800 leading-normal font-semibold">
                            Agent bypassed a validation mismatch to submit this request.
                          </span>
                        </div>
                      )}

                      <div className="space-y-2 text-xs">
                        {/* UTR Compare */}
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-neutral-500">Extracted UTR</span>
                          <div className="text-right">
                            <span className="font-semibold text-neutral-800 block">{detail.ocr_utr || "Not Found"}</span>
                            <span className={`text-[10px] font-bold ${detail.utr === detail.ocr_utr ? "text-emerald-600" : "text-rose-600"}`}>
                              {detail.utr === detail.ocr_utr ? "✓ Matches Input" : `✗ Input was: ${detail.utr}`}
                            </span>
                          </div>
                        </div>

                        {/* Amount Compare */}
                        <div className="flex justify-between items-center py-0.5 border-t border-black/5 pt-1.5">
                          <span className="text-neutral-500">Extracted Amount</span>
                          <div className="text-right">
                            <span className="font-semibold text-neutral-800 block">
                              {detail.ocr_amount ? fmtMoney(detail.ocr_amount) : "Not Found"}
                            </span>
                            {(() => {
                              const amtMatch = detail.ocr_amount === detail.amount;
                              return (
                                <span className={`text-[10px] font-bold ${amtMatch ? "text-emerald-600" : "text-rose-600"}`}>
                                  {amtMatch ? "✓ Matches Input" : `✗ Input was: ${fmtMoney(detail.amount)}`}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* QR Code Label Compare */}
                        <div className="flex justify-between items-center py-0.5 border-t border-black/5 pt-1.5">
                          <span className="text-neutral-500">QR Name Recognition</span>
                          <div className="text-right">
                            <span className="font-semibold text-neutral-800 block">
                              {detail.ocr_qr_name ? `"${detail.ocr_qr_name}"` : "Not Found"}
                            </span>
                            <span className={`text-[10px] font-bold ${detail.ocr_qr_name ? "text-emerald-600" : "text-rose-600"}`}>
                              {detail.ocr_qr_name ? "✓ Label Verified in Receipt" : `✗ Expected label: "${detail.qr_code_label || "N/A"}"`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Admin Bypass Warning Checkbox */}
                      {detail.status === "pending" && ocrMismatch && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 text-amber-800">
                          <div className="flex items-start gap-2">
                            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-[11px] leading-relaxed">
                              <span className="font-bold block">OCR Validation Mismatch Warning</span>
                              The screenshot details do not match the agent's entries. Please verify the image manually before approving.
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                            <input
                              type="checkbox"
                              checked={adminOcrBypass}
                              onChange={(e) => setAdminOcrBypass(e.target.checked)}
                              className="rounded border-amber-300 text-amber-600 focus:ring-amber-500/20 h-4 w-4 cursor-pointer"
                            />
                            <span className="text-[11px] font-extrabold text-amber-900">
                              Bypass OCR warning to allow approval
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 border border-black/5 rounded-2xl p-4 bg-slate-50/50 text-center text-xs text-neutral-500 font-medium">
                      OCR Verification: Not Available (Legacy Request)
                    </div>
                  )}

                  {detail.status === "pending" && (
                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={() => act(detail.id, "approve")} 
                        disabled={isApproveDisabled}
                        className="flex-1 rounded-xl bg-[#2D6A4F] hover:bg-[#1B4332] text-white px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" 
                        data-testid="detail-approve"
                      >
                        <Check className="h-4 w-4" /> Approve
                      </button>
                      <button onClick={() => act(detail.id, "reject")} className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2" data-testid="detail-reject"><X className="h-4 w-4" /> Reject</button>
                    </div>
                  )}
                </div>
                <div>
                  <div className="mfp-overline mb-2">Payment Screenshot</div>
                  {detail.screenshot_path ? (
                    <ZoomableImage src={fileUrl(detail.screenshot_path)} alt="screenshot" />
                  ) : (
                    <div className="text-sm text-neutral-500 italic">No screenshot uploaded</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {rejectTargetId && (
        <RejectModal
          onClose={() => setRejectTargetId(null)}
          onConfirm={handleRejectConfirm}
          predefined={predefinedReasons}
        />
      )}
    </div>
  );
}
