import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Check, RotateCcw, Search, X } from "lucide-react";
import { CREDIT_CARD_OPERATORS } from "@/lib/billing";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "success", label: "Success" },
  { key: "reversed", label: "Reversed" },
];

export default function AdminTransactions() {
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
  const [bankFilter, setBankFilter] = useState("all");

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    api.get("/admin/users", { params: { role: "agent" } })
      .then((r) => setAgents(Array.isArray(r.data) ? r.data : (r.data?.items || [])));
  }, []);

  const params = useMemo(() => {
    const { from_ts, to_ts } = range === "custom" && !customApplied
      ? { from_ts: null, to_ts: null }
      : rangeWindowIso(range, from, to);
    const p = { paginated: true, page, page_size: pageSize };
    if (status !== "all") p.status = status;
    if (agentFilter !== "all") p.agent_id = agentFilter;
    if (bankFilter !== "all") p.operator = bankFilter;
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    return p;
  }, [status, agentFilter, bankFilter, range, from, to, customApplied, debouncedQ, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    return api.get("/admin/transactions", { params })
      .then((r) => { setItems(r.data.items || []); setTotal(r.data.total || 0); })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [status, agentFilter, bankFilter, range, from, to, customApplied, debouncedQ, pageSize]);

  const clearAll = () => {
    setQ(""); setStatus("all"); setRange("today"); setAgentFilter("all"); setBankFilter("all");
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

  const reverse = useCallback(async (id) => {
    if (!window.confirm("Reverse this transaction and refund the agent's wallet?")) return;
    try { await api.post(`/admin/transactions/${id}/reject`, { note: "reversed by admin" }); toast.success("Transaction reversed; wallet refunded"); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  }, [reload]);

  // Bank dropdown = full operator catalogue (server filters exact match, so union with current items is unnecessary).
  const banks = useMemo(() => [...CREDIT_CARD_OPERATORS].sort(), []);

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

  return (
    <div>
      <PageHeader title="Bill Payments" subtitle="Approve or reverse credit card bill payments submitted by agents." />

      {/* Filter / Search bar */}
      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="tx-filter-bar">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by Agent Name, Customer Name, Bank, Card Last 4 Digits, Customer Phone…"
              className="mfp-input !pl-11 !pr-10"
              data-testid="tx-search"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                data-testid="tx-search-clear"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <select
              value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
              className="mfp-input lg:w-56" data-testid="tx-agent-filter"
            >
              <option value="all">All Agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
            <select
              value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}
              className="mfp-input lg:w-56" data-testid="tx-bank-filter"
            >
              <option value="all">All Banks</option>
              {banks.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="mfp-overline mr-1 self-center">Status:</span>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${status === s.key ? "bg-[#1B4332] text-white" : "bg-[#F4F3ED] text-neutral-700 hover:bg-[#E8E5D7]"}`}
              data-testid={`tx-status-${s.key}`}
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
              data-testid={`tx-range-${r.key}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === "custom" && (
          <div className="flex flex-wrap items-end gap-3 pt-1">
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
