import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import ZoomableImage from "@/components/ZoomableImage";
import { toast } from "sonner";
import { Eye, Check, X, Search, RotateCcw, FileDown, FileSpreadsheet, Loader2, ShieldAlert, CheckCircle2, Pencil, HelpCircle } from "lucide-react";
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

function CompactQrSearchSelect({ currentLabel, qrEntries, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const popoverRef = React.useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const filtered = qrEntries.filter((e) =>
    (e.name || "").toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div ref={popoverRef} className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-64 bg-white rounded-xl shadow-2xl border border-neutral-200 p-2 z-[999] text-left">
      <div className="relative mb-1.5">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-neutral-400" />
        <input
          type="text"
          placeholder="Search QR..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-2 py-1.5 text-xs font-semibold border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-neutral-50"
          autoFocus
        />
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="p-2 text-[11px] text-neutral-400 text-center font-medium">No QR found</div>
        ) : (
          filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => onSelect(e.name)}
              className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex flex-col transition-colors border ${
                e.name === currentLabel
                  ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                  : "bg-white border-neutral-100 hover:bg-neutral-50 text-neutral-800"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-extrabold truncate pr-1">{e.name}</span>
                {e.is_t1 && (
                  <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-black shrink-0">T+1</span>
                )}
              </div>
              {e.activated_at && (
                <span className="text-[10px] text-neutral-400 font-medium mt-0.5 block">
                  🕒 {fmtDate(e.activated_at)}
                </span>
              )}
            </button>
          ))
        )}
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

  const { user } = useAuth();
  const isSuperAdmin = user?.email?.toLowerCase() === "jigs.vanani@gmail.com";
  const canEditApprovalQr = isSuperAdmin || user?.permissions?.includes("edit-approval-qr");
  const [qrEntries, setQrEntries] = useState([]);
  const [editingQrRid, setEditingQrRid] = useState(null);
  const [selectedQrLabel, setSelectedQrLabel] = useState("");
  const [qrEditLoading, setQrEditLoading] = useState(false);

  useEffect(() => {
    api.get("/admin/qr-name-entries").then((r) => {
      setQrEntries(r.data || []);
    }).catch(() => {});
  }, []);

  const handleSaveRechargeQr = async (rid, newLabel) => {
    const labelToSave = newLabel || selectedQrLabel;
    if (!labelToSave) return toast.error("Please select a QR code name");
    setQrEditLoading(true);
    try {
      await api.put(`/admin/recharges/${rid}/qr-code`, { qr_code_label: labelToSave });
      toast.success("QR Code updated! Tracking history refreshed.");
      setEditingQrRid(null);
      setDetail((prev) => (prev && prev.id === rid ? { ...prev, qr_code_label: labelToSave } : prev));
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update QR code");
    } finally {
      setQrEditLoading(false);
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
            <span className="font-extrabold text-neutral-900 text-sm truncate max-w-[160px] block" title={r.user_name}>
              {r.user_name || "—"}
            </span>
            <div className="flex items-center justify-center gap-1.5 mt-0.5 whitespace-nowrap">
              {d && (
                <span className="text-[11px] text-neutral-500 font-semibold whitespace-nowrap">
                  {dateStr}, {timeStr}
                </span>
              )}
              {r.is_t1 && (
                <span className="inline-flex items-center gap-0.5 bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB] text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                  T+1
                </span>
              )}
            </div>
            {r.status !== "pending" && (
              <span className="text-[10px] font-bold text-slate-500 mt-0.5 block truncate max-w-[160px]" title={`Processed By: ${procName}`}>
                By: {procName}
              </span>
            )}
          </div>
        );
      }
    },
    { key: "amount", label: "Amount", render: (r) => <span className="font-bold text-xs">{fmtMoney(r.amount)}</span> },
    { key: "utr", label: "UTR", render: (r) => <span className="font-mono text-xs font-semibold text-center block mx-auto">{r.utr || "—"}</span> },
    { 
      key: "qr_code_label", 
      label: "QR Code", 
      render: (r) => {
        return (
          <div className="relative inline-flex items-center justify-center gap-1">
            <span className="max-w-[110px] truncate block font-semibold text-xs text-neutral-800 text-center" title={r.qr_code_label}>
              {r.qr_code_label || "N/A"}
            </span>
            {canEditApprovalQr && (
              <button
                onClick={() => {
                  if (editingQrRid === r.id) {
                    setEditingQrRid(null);
                  } else {
                    setEditingQrRid(r.id);
                    setSelectedQrLabel(r.qr_code_label || "");
                  }
                }}
                className="p-1 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all shrink-0"
                title="Edit QR Code for this request"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {editingQrRid === r.id && (
              <CompactQrSearchSelect
                currentLabel={r.qr_code_label}
                qrEntries={qrEntries}
                onSelect={(newLabel) => handleSaveRechargeQr(r.id, newLabel)}
                onClose={() => setEditingQrRid(null)}
              />
            )}
          </div>
        );
      }
    },
    { key: "card_last4", label: "Acc/Card", render: (r) => r.card_last4 ? r.card_last4 : "N/A" },
    { key: "commission_percent", label: "Comm %", render: (r) => `${r.commission_percent}%` },
    { key: "commission_charge", label: "Comm Charge", render: (r) => r.status === "approved" ? fmtMoney(r.commission_amount) : fmtMoney(r.amount * r.commission_percent / 100) },
    { key: "admin_revenue_amount", label: "Admin", render: (r) => r.status === "approved" ? fmtMoney(r.admin_revenue_amount) : "—" },
    { key: "md_earnings_amount", label: "S.Dist", render: (r) => r.status === "approved" ? fmtMoney(r.md_earnings_amount) : "—" },
    { key: "distributor_earnings_amount", label: "Dist", render: (r) => r.status === "approved" ? fmtMoney(r.distributor_earnings_amount) : "—" },
    { key: "credit_amount", label: "Net Credit", render: (r) => r.status === "approved" ? fmtMoney(r.credit_amount) : "—" },
    { key: "status", label: "Status", render: (r) => <div className="flex justify-center"><StatusBadge status={r.status} /></div> },
    { 
      key: "reason", 
      label: "Reason", 
      render: (r, { isExpanded, toggleExpand }) => {
        const isRejected = r.status === "rejected" || r.status === "failed";
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
            data-testid={`view-${r.id}`}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      ) 
    },
    { 
      key: "actions", 
      label: "Action", 
      render: (r) => r.status === "pending" ? (
        <div className="flex items-center justify-center gap-1.5">
          <button 
            className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0" 
            onClick={() => act(r.id, "approve")} 
            title="Approve Request" 
            data-testid={`approve-${r.id}`}
          >
            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
          <button 
            className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 rounded transition-all inline-flex items-center justify-center shadow-2xs shrink-0" 
            onClick={() => act(r.id, "reject")} 
            title="Reject Request" 
            data-testid={`reject-${r.id}`}
          >
            <X className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        </div>
      ) : "—" 
    },
  ], [act, editingQrRid, selectedQrLabel, qrEntries, qrEditLoading, user]);

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
                  <div className="flex justify-between border-b border-black/5 pb-2">
                    <span className="text-neutral-500">Service Type</span>
                    <span className="font-medium text-right">{detail.is_t1 ? "⚡ T+1 Service (Immediate Settlement)" : "Normal Wallet Service"}</span>
                  </div>

                  <div className="flex justify-between border-b border-black/5 pb-2">
                    <span className="text-neutral-500">Amount</span>
                    <span className="font-medium text-right">{fmtMoney(detail.amount)}</span>
                  </div>

                  <div className="flex justify-between border-b border-black/5 pb-2">
                    <span className="text-neutral-500">UTR / Reference</span>
                    <span className="font-medium text-right">{detail.utr || "—"}</span>
                  </div>

                  <div className="flex justify-between border-b border-black/5 pb-2 items-center relative">
                    <span className="text-neutral-500">QR Code Used</span>
                    <div className="flex items-center gap-1.5 relative">
                      <span className="font-bold text-neutral-800 text-right">{detail.qr_code_label || "N/A"}</span>
                      {canEditApprovalQr && (
                        <button
                          type="button"
                          onClick={() => {
                            if (editingQrRid === detail.id) {
                              setEditingQrRid(null);
                            } else {
                              setEditingQrRid(detail.id);
                              setSelectedQrLabel(detail.qr_code_label || "");
                            }
                          }}
                          className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-all shrink-0 cursor-pointer border border-indigo-200/60 shadow-2xs"
                          title="Edit QR Code for this request"
                          data-testid="edit-qr-code-modal-btn"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {editingQrRid === detail.id && (
                        <CompactQrSearchSelect
                          currentLabel={detail.qr_code_label}
                          qrEntries={qrEntries}
                          onSelect={(newLabel) => handleSaveRechargeQr(detail.id, newLabel)}
                          onClose={() => setEditingQrRid(null)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between border-b border-black/5 pb-2">
                    <span className="text-neutral-500">Created</span>
                    <span className="font-medium text-right">{fmtDate(detail.created_at)}</span>
                  </div>

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
