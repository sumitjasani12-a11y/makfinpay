import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtMoney, formatErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Kpi, PageHeader } from "@/components/Shared";
import DangerZone from "@/components/DangerZone";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const SUPER_ADMIN_EMAIL = "makfinpay@gmail.com";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "lifetime", label: "Lifetime" },
  { key: "custom", label: "Custom" },
];

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function AdminOverview() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user && user.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  const [stats, setStats] = useState({});
  const [financial, setFinancial] = useState({});
  const [loadingFin, setLoadingFin] = useState(false);
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState(todayStr(-7));
  const [to, setTo] = useState(todayStr());
  const [customApplied, setCustomApplied] = useState(false);

  // Static counts (never filtered)
  useEffect(() => { api.get("/admin/stats").then((r) => setStats(r.data)); }, []);

  const loadFinancial = useCallback(async (r, f, t) => {
    setLoadingFin(true);
    try {
      const params = { range: r };
      if (r === "custom") { params.from = f; params.to = t; }
      const { data } = await api.get("/admin/stats/financial", { params });
      setFinancial(data);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || e.message);
    } finally {
      setLoadingFin(false);
    }
  }, []);

  // Initial + on range change (skip custom until applied)
  useEffect(() => {
    if (range !== "custom") loadFinancial(range);
  }, [range, loadFinancial]);

  const applyCustom = () => {
    if (!from || !to) return toast.error("Pick both From and To dates");
    if (from > to) return toast.error("From date cannot be after To date");
    setCustomApplied(true);
    loadFinancial("custom", from, to);
  };

  return (
    <div>
      <PageHeader title="Platform overview" subtitle="Real-time fintech operations at a glance." />

      {/* SECTION 1 — Financial Overview (filtered) */}
      <section className="mb-12" data-testid="section-financial">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Financial Overview</h2>
            <p className="text-sm text-neutral-500">Data filtered by selected date range</p>
          </div>
          {loadingFin && <span className="inline-flex items-center gap-2 text-xs text-neutral-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</span>}
        </div>

        {/* Filter bar */}
        <div className="mb-4 -mx-1 overflow-x-auto">
          <div className="inline-flex gap-2 px-1 pb-2 min-w-full" data-testid="range-filter-bar">
            {RANGES.map((r) => {
              const active = range === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${active ? "bg-[#1B4332] text-white shadow-sm" : "bg-[#F4F3ED] text-neutral-700 hover:bg-[#E8E5D7]"}`}
                  data-testid={`range-${r.key}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom date inputs */}
        {range === "custom" && (
          <div className="mb-5 mfp-card p-4 flex flex-wrap items-end gap-3" data-testid="custom-range-panel">
            <div>
              <label className="mfp-label">From</label>
              <input type="date" className="mfp-input" max={to} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="custom-from" />
            </div>
            <div>
              <label className="mfp-label">To</label>
              <input type="date" className="mfp-input" min={from} value={to} onChange={(e) => setTo(e.target.value)} data-testid="custom-to" />
            </div>
            <button className="mfp-btn-primary" onClick={applyCustom} data-testid="custom-apply">Apply</button>
            {customApplied && <span className="text-xs text-neutral-500">Showing {from} → {to}</span>}
          </div>
        )}

        {/* Filtered cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5 transition-opacity ${loadingFin ? "opacity-60" : "opacity-100"}`}>
          <div className="mfp-kpi">
            <div className="mfp-overline">Total Revenue (Commission)</div>
            <div className="mt-3 text-3xl font-medium tracking-tight text-[#CC5500]">{fmtMoney(financial.total_revenue)}</div>
            <div className="mt-3 space-y-1 text-xs text-neutral-500">
              <div className="flex justify-between"><span>Admin Revenue</span><span className="font-medium text-neutral-700">{fmtMoney(financial.admin_revenue)}</span></div>
              <div className="flex justify-between"><span>Master Distributor Earnings</span><span className="font-medium text-neutral-700" data-testid="revenue-md-earnings">{fmtMoney(financial.md_earnings ?? 0)}</span></div>
              <div className="flex justify-between"><span>Distributor Earnings</span><span className="font-medium text-neutral-700">{fmtMoney(financial.distributor_earnings)}</span></div>
            </div>
          </div>
          <Kpi label="Transaction Revenue" value={fmtMoney(financial.transaction_revenue)} hint="From service charges" accent="text-[#CC5500]" />
          <Kpi label="Recharge Approved" value={fmtMoney(financial.recharge_approved)} hint="Gross approved in range" />
          <Kpi label="Total Wallet Balance" value={fmtMoney(financial.total_wallet)} hint="All time • Live balance" />
          <Kpi label="Total MD Earnings" value={fmtMoney(financial.total_md_earnings ?? 0)} hint="All time • Live balance" data-testid="kpi-total-md-earnings" />
          <Kpi label="Total Distributor Earnings" value={fmtMoney(financial.total_distributor_earnings)} hint="All time • Live balance" data-testid="kpi-total-distributor-earnings" />
          <Kpi label="Bill Payments" value={financial.total_txn_count ?? 0} hint={`Volume ${fmtMoney(financial.total_txn_amount)}`} />
          <div className="mfp-kpi" data-testid="kpi-withdrawals">
            <div className="mfp-overline">Withdrawals</div>
            <div className="mt-3 text-3xl font-medium tracking-tight text-[#CC5500]">{fmtMoney(financial.total_withdrawals_approved)}</div>
            <div className="mt-3 space-y-1 text-xs text-neutral-500">
              <div className="flex justify-between"><span>Agent Withdrawals</span><span className="font-medium text-neutral-700" data-testid="kpi-withdrawals-agent">{fmtMoney(financial.agent_withdrawals_approved)}</span></div>
              <div className="flex justify-between"><span>Distributor Withdrawals</span><span className="font-medium text-neutral-700" data-testid="kpi-withdrawals-distributor">{fmtMoney(financial.distributor_withdrawals_approved)}</span></div>
              <div className="flex justify-between"><span>Master Distributor Withdrawals</span><span className="font-medium text-neutral-700" data-testid="kpi-withdrawals-md">{fmtMoney(financial.md_withdrawals_approved ?? 0)}</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-black/5 mb-10" />

      {/* SECTION 2 — Platform Statistics (static) */}
      <section data-testid="section-statistics">
        <div className="mb-4">
          <h2 className="text-lg font-medium tracking-tight">Platform Statistics</h2>
          <p className="text-sm text-neutral-500">Overall platform activity</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          <button
            onClick={() => nav("/admin/recharges")}
            className="mfp-kpi text-left hover:bg-neutral-50 transition-colors"
            data-testid="kpi-pending-recharges"
          >
            <div className="mfp-overline">Pending Recharges</div>
            <div className="mt-3 text-3xl font-medium tracking-tight">{stats.pending_recharges ?? 0}</div>
            <div className="mt-2 text-xs text-[#CC5500]">Click to review →</div>
          </button>
          <button
            onClick={() => nav("/admin/withdrawals")}
            className="mfp-kpi text-left hover:bg-neutral-50 transition-colors"
            data-testid="kpi-pending-withdrawals"
          >
            <div className="mfp-overline">Pending Withdrawals</div>
            <div className="mt-3 text-3xl font-medium tracking-tight">{stats.pending_withdrawals ?? 0}</div>
            <div className="mt-2 text-xs text-[#CC5500]">Click to review →</div>
          </button>
          <button
            onClick={() => nav("/admin/transactions")}
            className="mfp-kpi text-left bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors"
            data-testid="kpi-pending-tx"
          >
            <div className="mfp-overline text-amber-800">Pending Transactions</div>
            <div className="mt-3 text-3xl font-medium tracking-tight text-amber-700">{stats.pending_transactions ?? 0}</div>
            <div className="mt-2 text-xs text-amber-700/80">Click to review →</div>
          </button>
          <button
            onClick={() => nav("/admin/kyc")}
            className="mfp-kpi text-left bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors"
            data-testid="kpi-pending-kyc"
          >
            <div className="mfp-overline text-amber-800">Pending KYC</div>
            <div className="mt-3 text-3xl font-medium tracking-tight text-amber-700">{financial.pending_kyc_count ?? 0}</div>
            <div className="mt-2 text-xs text-amber-700/80">Click to review →</div>
          </button>
          <Kpi label="Master Distributors" value={stats.total_master_distributors ?? 0} data-testid="kpi-total-master-distributors" />
          <Kpi label="Distributors" value={stats.total_distributors ?? 0} />
          <Kpi label="Agents" value={stats.total_agents ?? 0} />
        </div>
      </section>

      {isSuperAdmin && <DangerZone adminEmail={SUPER_ADMIN_EMAIL} />}
    </div>
  );
}
