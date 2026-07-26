import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney, fileUrl } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Eye, Check, X, Search, RotateCcw } from "lucide-react";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminRecharges() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [detail, setDetail] = useState(null);

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
    return p;
  }, [status, agentFilter, qrFilter, range, from, to, customApplied, debouncedQ, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    return api.get("/admin/recharges", { params })
      .then((r) => { setItems(r.data.items || []); setTotal(r.data.total || 0); })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load recharges"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); }, [reload]);

  // Reset page to 1 when any filter (other than page/pageSize) changes.
  useEffect(() => { setPage(1); }, [status, agentFilter, qrFilter, range, from, to, customApplied, debouncedQ, pageSize]);

  const clearAll = () => {
    setQ(""); setStatus("all"); setRange("today"); setAgentFilter("all"); setQrFilter("all");
    setFrom(todayStr(-7)); setTo(todayStr()); setCustomApplied(false); setPage(1);
  };

  const applyCustom = () => {
    if (!from || !to) return toast.error("Pick both From and To dates");
    if (from > to) return toast.error("From date cannot be after To date");
    setCustomApplied(true);
  };

  const act = useCallback(async (id, type) => {
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

      {/* Filter / Search bar */}
      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="recharge-filter-bar">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by Agent Name, UTR, Card Last 4 Digits…"
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
          <div className="flex gap-3">
            <select
              value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
              className="mfp-input lg:w-56" data-testid="recharge-agent-filter"
            >
              <option value="all">All Agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
            <select
              value={qrFilter} onChange={(e) => setQrFilter(e.target.value)}
              className="mfp-input lg:w-56" data-testid="recharge-qr-filter"
            >
              <option value="all">All QR Codes</option>
              {qrCodes.map((qr) => <option key={qr.id} value={qr.id}>{qr.label}</option>)}
            </select>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          <span className="mfp-overline mr-1 self-center">Status:</span>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${status === s.key ? "bg-[#1B4332] text-white" : "bg-[#F4F3ED] text-neutral-700 hover:bg-[#E8E5D7]"}`}
              data-testid={`recharge-status-${s.key}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Date range pills */}
        <div className="flex flex-wrap gap-2">
          <span className="mfp-overline mr-1 self-center">Date:</span>
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => { setRange(r.key); if (r.key !== "custom") setCustomApplied(false); }}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${range === r.key ? "bg-[#1B4332] text-white" : "bg-[#F4F3ED] text-neutral-700 hover:bg-[#E8E5D7]"}`}
              data-testid={`recharge-range-${r.key}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === "custom" && (
          <div className="flex flex-wrap items-end gap-3 pt-1">
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
                  <img src={fileUrl(detail.screenshot_path)} alt="screenshot" className="rounded-xl max-h-[480px] w-full object-contain bg-[#F4F3ED] border border-black/5" />
                ) : (
                  <div className="text-sm text-neutral-500 italic">No screenshot uploaded</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
