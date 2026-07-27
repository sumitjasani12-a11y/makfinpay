import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney, fileUrl } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import ZoomableImage from "@/components/ZoomableImage";
import { toast } from "sonner";
import { Eye, Check, X, Search, RotateCcw } from "lucide-react";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function RejectModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [predefined, setPredefined] = useState([]);

  useEffect(() => {
    api.get("/rejection-reasons/active?target=qr")
      .then((res) => setPredefined(res.data || []))
      .catch((e) => console.log("Failed to fetch recharge rejection reasons:", e));
  }, []);

  const confirm = async () => {
    if (!reason.trim()) return toast.error("Please provide a rejection reason");
    setBusy(true);
    try { await onConfirm(reason.trim()); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-[#FDFCF8] rounded-2xl max-w-md w-full border border-black/5 shadow-2xl animate-scaleUp" onClick={(e) => e.stopPropagation()} data-testid="recharge-reject-modal">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <div className="text-base font-semibold">Reject Recharge Request</div>
          <button onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {predefined.length > 0 && (
            <div>
              <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block mb-1">
                Quick Select Reason
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
          )}
          <div>
            <label className="mfp-label">Reason for Rejection</label>
            <textarea
              className="mfp-input min-h-[96px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Reference number or UTR does not match bank record"
              data-testid="recharge-reject-reason"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button type="button" onClick={confirm} disabled={busy} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold flex-1" data-testid="recharge-reject-confirm">
              {busy ? "Rejecting…" : "Confirm Reject"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminRecharges() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [detail, setDetail] = useState(null);
  const [rejectTargetId, setRejectTargetId] = useState(null);

  // filter state
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState(todayStr(-7));
  const [to, setTo] = useState(todayStr());
  const [customApplied, setCustomApplied] = useState(false);
  const [agentFilter, setAgentFilter] = useState("all");
  const [qrFilter, setQrFilter] = useState("all");
  const [amtQuery, setAmtQuery] = useState("");
  const debouncedAmt = useDebounced(amtQuery, 350);

  // Stats calculation
  const [stats, setStats] = useState({ approved: 0, approvedCount: 0, pending: 0, pendingCount: 0, rejected: 0, rejectedCount: 0 });

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    api.get("/admin/users", { params: { role: "agent" } })
      .then((r) => setAgents(Array.isArray(r.data) ? r.data : (r.data?.items || [])));
    api.get("/admin/qrcodes").then((r) => setQrCodes(r.data));
  }, []);

  // Build query params (server-side filtering + pagination).
  const params = useMemo(() => {
    const { from_ts, to_ts } = range === "custom" && !customApplied
      ? { from_ts: null, to_ts: null }
      : rangeWindowIso(range, from, to);
    const p = { paginated: true, page, page_size: pageSize };
    if (status !== "all") p.status = status;
    if (agentFilter !== "all") p.agent_id = agentFilter;
    if (qrFilter !== "all") p.qr_code_id = qrFilter;
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    if (debouncedAmt.trim()) p.amount = debouncedAmt.trim();
    return p;
  }, [status, agentFilter, qrFilter, range, from, to, customApplied, debouncedQ, debouncedAmt, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    // paginated list
    const pagePromise = api.get("/admin/recharges", { params });

    // unpaginated list for correct totals
    const statsParams = { ...params };
    delete statsParams.paginated;
    delete statsParams.page;
    delete statsParams.page_size;
    const statsPromise = api.get("/admin/recharges", { params: statsParams });

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
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load recharges"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); }, [reload]);

  // Reset page to 1 when any filter (other than page/pageSize) changes.
  useEffect(() => { setPage(1); }, [status, agentFilter, qrFilter, range, from, to, customApplied, debouncedQ, debouncedAmt, pageSize]);

  const clearAll = () => {
    setQ(""); setStatus("all"); setRange("today"); setAgentFilter("all"); setQrFilter("all"); setAmtQuery("");
    setFrom(todayStr(-7)); setTo(todayStr()); setCustomApplied(false); setPage(1);
  };

  const applyCustom = () => {
    if (!from || !to) return toast.error("Pick both From and To dates");
    if (from > to) return toast.error("From date cannot be after To date");
    setCustomApplied(true);
  };

  const handleRejectConfirm = async (note) => {
    try {
      await api.post(`/admin/recharges/${rejectTargetId}/reject`, { note });
      toast.success("Recharge rejected");
      setRejectTargetId(null);
      setDetail(null);
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const act = useCallback(async (id, type) => {
    if (type === "reject") {
      setRejectTargetId(id);
      return;
    }
    try { await api.post(`/admin/recharges/${id}/${type}`, { note: "" }); toast.success(`Recharge ${type}d`); setDetail(null); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  }, [reload]);

  const columns = useMemo(() => [
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
    { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
    { key: "actions", label: "Action", render: (r) => (
      <div className="flex gap-2">
        <button className="mfp-btn-ghost p-2" onClick={() => setDetail(r)} data-testid={`view-${r.id}`}><Eye className="h-4 w-4" /></button>
        {r.status === "pending" && (<>
          <button className="rounded-lg bg-[#2D6A4F]/10 text-[#2D6A4F] hover:bg-[#2D6A4F]/20 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1" onClick={() => act(r.id, "approve")} data-testid={`approve-${r.id}`}><Check className="h-3 w-3" /> Approve</button>
          <button className="rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1" onClick={() => act(r.id, "reject")} data-testid={`reject-${r.id}`}><X className="h-3 w-3" /> Reject</button>
        </>)}
      </div>
    ) },
  ], [act]);

  return (
    <div>
      <PageHeader
        title="Recharge Approvals"
        subtitle="Verify UPI payments, approve to credit agent wallet (after commission)."
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
        {/* Row 1: Search & Dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Name, UTR, Card..."
              className="mfp-input !pl-11 !pr-10"
              data-testid="recharge-search"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                data-testid="recharge-search-clear"
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

        {/* Row 2: Secondary Dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="mfp-input w-full"
              data-testid="recharge-agent-filter"
            >
              <option value="all">All Agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={qrFilter}
              onChange={(e) => setQrFilter(e.target.value)}
              className="mfp-input w-full"
              data-testid="recharge-qr-filter"
            >
              <option value="all">All QR Codes</option>
              {qrCodes.map((qr) => (
                <option key={qr.id} value={qr.id}>{qr.label}</option>
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
            {loading ? "Loading…" : <>Matched <span className="font-semibold">{total.toLocaleString("en-IN")}</span> requests</>}
          </div>
          <button onClick={clearAll} className="mfp-btn-ghost" data-testid="recharge-clear-all">
            <RotateCcw className="h-3.5 w-3.5" /> Clear All Filters
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        empty={loading ? "Loading…" : "No recharge requests found for selected filters"}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
        }}
      />

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-[#FDFCF8] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="recharge-detail-modal">
            <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
              <div>
                <div className="mfp-overline">Recharge Request</div>
                <div className="text-lg font-medium">{detail.user_name}</div>
              </div>
              <button onClick={() => setDetail(null)} className="mfp-btn-ghost p-2" data-testid="recharge-detail-close"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid md:grid-cols-2 gap-6 p-6">
              <div className="space-y-3 text-sm">
                {[
                  ["Amount", fmtMoney(detail.amount)],
                  ["UTR / Reference", detail.utr || "—"],
                  ["QR Code Used", detail.qr_code_label || "N/A"],
                  ["Card / Account Last 4 Digits", detail.card_last4 ? `XXXX ${detail.card_last4}` : "N/A"],
                  ["Commission %", `${detail.commission_percent}%`],
                  ["Commission Amount", detail.status === "approved" ? fmtMoney(detail.commission_amount) : "—"],
                  ["Net Credit", detail.status === "approved" ? fmtMoney(detail.credit_amount) : "—"],
                  ["Status", null],
                  ["Created", fmtDate(detail.created_at)],
                  ["Reviewed", fmtDate(detail.reviewed_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-black/5 pb-2">
                    <span className="text-neutral-500">{k}</span>
                    <span className="font-medium text-right">{k === "Status" ? <StatusBadge status={detail.status} /> : v}</span>
                  </div>
                ))}
                {detail.status === "pending" && (
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => act(detail.id, "approve")} className="flex-1 rounded-xl bg-[#2D6A4F] hover:bg-[#1B4332] text-white px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2" data-testid="detail-approve"><Check className="h-4 w-4" /> Approve</button>
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
      )}
      {rejectTargetId && (
        <RejectModal
          onClose={() => setRejectTargetId(null)}
          onConfirm={handleRejectConfirm}
        />
      )}
    </div>
  );
}
