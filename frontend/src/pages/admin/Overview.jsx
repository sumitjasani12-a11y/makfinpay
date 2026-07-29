import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtMoney, formatErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import DangerZone from "@/components/DangerZone";
import { 
  Loader2, TrendingUp, Activity, ArrowUpRight, Wallet, 
  Coins, FileText, ArrowUpFromLine, Clock, ShieldCheck, 
  Users, UserCog, Crown, ArrowRight, ClipboardList 
} from "lucide-react";
import { toast } from "sonner";

const SUPER_ADMIN_EMAIL = "makfinpay@gmail.com";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "this_month", label: "This Month" },
  { key: "lifetime", label: "Lifetime" },
  { key: "custom", label: "Custom" },
];

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function FinancialCard({ label, value, hint, breakdowns, icon: Icon, colorClass = "text-neutral-800", iconBg = "bg-neutral-50 text-neutral-500", borderClass = "border-black/5", testid }) {
  return (
    <div className={`bg-white border ${borderClass} rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between`} data-testid={testid}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase font-black tracking-widest text-neutral-400">{label}</span>
          {Icon && (
            <div className={`p-2 rounded-xl shrink-0 ${iconBg}`}>
              <Icon className="h-4.5 w-4.5" />
            </div>
          )}
        </div>
        <div className={`text-2xl font-black tracking-tight mt-3 ${colorClass}`}>{value}</div>
        {hint && <p className="text-[11px] text-neutral-400 font-semibold mt-1">{hint}</p>}
      </div>

      {breakdowns && breakdowns.length > 0 && (
        <div className="mt-5 pt-4 border-t border-black/5 space-y-2 text-[11px] text-neutral-400 font-semibold">
          {breakdowns.map((b, idx) => (
            <div key={idx} className="flex justify-between items-center" data-testid={b.testid}>
              <span>{b.label}</span>
              <span className="text-neutral-700 font-black">{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsCard({ label, value, onClick, actionLabel, icon: Icon, theme = "neutral", testid }) {
  const themes = {
    neutral: {
      card: "bg-white border-black/5 hover:border-neutral-200",
      label: "text-neutral-400",
      value: "text-neutral-800",
      iconBg: "bg-neutral-50 text-neutral-500"
    },
    amber: {
      card: "bg-amber-50/50 border-amber-200/60 hover:bg-amber-50 hover:border-amber-300",
      label: "text-amber-800/80",
      value: "text-amber-900",
      iconBg: "bg-amber-100 text-amber-700"
    }
  };
  const t = themes[theme] || themes.neutral;

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-3xl border p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full hover:-translate-y-0.5 active:scale-98 ${t.card}`}
      data-testid={testid}
    >
      <div className="w-full">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] uppercase font-black tracking-widest ${t.label}`}>{label}</span>
          {Icon && (
            <div className={`p-2 rounded-xl shrink-0 ${t.iconBg}`}>
              <Icon className="h-4.5 w-4.5" />
            </div>
          )}
        </div>
        <div className={`text-3xl font-black tracking-tight mt-4.5 ${t.value}`}>{value}</div>
      </div>
      {actionLabel && (
        <div className="w-full mt-5 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 group-hover:text-neutral-600">{actionLabel}</span>
          <div className="p-1 rounded-lg bg-black/5 text-neutral-700">
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
    </button>
  );
}

function InfoCard({ label, value, icon: Icon, iconBg = "bg-neutral-50 text-neutral-500", testid }) {
  return (
    <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm flex items-center justify-between gap-4" data-testid={testid}>
      <div className="space-y-1">
        <span className="text-[10px] uppercase font-black tracking-widest text-neutral-400">{label}</span>
        <div className="text-2xl font-black tracking-tight text-neutral-800">{value}</div>
      </div>
      {Icon && (
        <div className={`p-3 rounded-2xl shrink-0 ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
    </div>
  );
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
    <div className="space-y-8">
      <PageHeader
        title="Platform overview"
        subtitle="Real-time fintech operations at a glance."
        actions={
          <div className="flex items-center gap-3 pr-4 md:pr-6">
            {loadingFin && (
              <span className="inline-flex items-center gap-2 text-xs text-neutral-400 animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </span>
            )}
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="bg-white border border-black/10 rounded-2xl px-4 py-2.5 text-xs font-bold text-neutral-700 focus:outline-none focus:ring-1 focus:ring-[#1b4332] transition-all shadow-sm select-none"
              data-testid="range-filter-bar"
            >
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
        }
      />

      {/* SECTION 1 — Financial Overview (filtered) */}
      <section data-testid="section-financial">
        <div className="mb-6">
          <h2 className="text-base font-bold tracking-tight text-neutral-800">Financial Overview</h2>
          <p className="text-xs text-neutral-400">Data filtered by selected date range</p>
        </div>

        {/* Custom date inputs */}
        {range === "custom" && (
          <div className="mb-6 bg-white border border-black/5 rounded-3xl p-5 flex flex-wrap items-end gap-3.5 shadow-sm animate-scaleUp" data-testid="custom-range-panel">
            <div className="space-y-1">
              <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider block">From</label>
              <input type="date" className="mfp-input" max={to} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="custom-from" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider block">To</label>
              <input type="date" className="mfp-input" min={from} value={to} onChange={(e) => setTo(e.target.value)} data-testid="custom-to" />
            </div>
            <button className="mfp-btn-primary" onClick={applyCustom} data-testid="custom-apply">Apply</button>
            {customApplied && <span className="text-xs text-neutral-400 font-semibold mb-3">Showing {from} → {to}</span>}
          </div>
        )}

        {/* Filtered cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6 transition-opacity duration-300 ${loadingFin ? "opacity-60" : "opacity-100"}`}>
          
          <FinancialCard
            label="Total Revenue (Commission)"
            value={fmtMoney(financial.total_revenue)}
            colorClass="text-[#CC5500]"
            borderClass="border-amber-100"
            icon={TrendingUp}
            iconBg="bg-amber-50 text-amber-600"
            breakdowns={[
              { label: "Admin Revenue", value: fmtMoney(financial.admin_revenue) },
              { label: "Master Distributor Earnings", value: fmtMoney(financial.md_earnings ?? 0), testid: "revenue-md-earnings" },
              { label: "Distributor Earnings", value: fmtMoney(financial.distributor_earnings) }
            ]}
          />

          <FinancialCard
            label="Transaction Revenue"
            value={fmtMoney(financial.transaction_revenue)}
            hint="From service charges"
            colorClass="text-indigo-600"
            icon={Activity}
            iconBg="bg-indigo-50 text-indigo-600"
            breakdowns={[
              { label: "CC Bill Charge", value: fmtMoney(financial.cc_bill_revenue ?? 0) },
              { label: "Live Bill Profit", value: fmtMoney(financial.live_bill_profit ?? 0) }
            ]}
          />

          <FinancialCard
            label="Recharge Approved"
            value={fmtMoney(financial.recharge_approved)}
            hint="Gross approved in range"
            colorClass="text-emerald-600"
            icon={ArrowUpRight}
            iconBg="bg-emerald-50 text-emerald-600"
          />

          <FinancialCard
            label="Total Wallet Balance"
            value={fmtMoney(financial.total_wallet)}
            hint="All time • Live balance"
            colorClass="text-cyan-700"
            icon={Wallet}
            iconBg="bg-cyan-50 text-cyan-600"
          />

          <FinancialCard
            label="Total MD Earnings"
            value={fmtMoney(financial.total_md_earnings ?? 0)}
            hint="All time • Live balance"
            colorClass="text-violet-700"
            icon={Coins}
            iconBg="bg-violet-50 text-violet-600"
            testid="kpi-total-md-earnings"
          />

          <FinancialCard
            label="Total Distributor Earnings"
            value={fmtMoney(financial.total_distributor_earnings)}
            hint="All time • Live balance"
            colorClass="text-purple-700"
            icon={Coins}
            iconBg="bg-purple-50 text-purple-600"
            testid="kpi-total-distributor-earnings"
          />

          <FinancialCard
            label="Bill Payments"
            value={financial.total_txn_count ?? 0}
            hint={`Volume: ${fmtMoney(financial.total_txn_amount)}`}
            colorClass="text-blue-700"
            icon={FileText}
            iconBg="bg-blue-50 text-blue-600"
          />

          <FinancialCard
            label="Withdrawals"
            value={fmtMoney(financial.total_withdrawals_approved)}
            colorClass="text-rose-600"
            borderClass="border-rose-100"
            icon={ArrowUpFromLine}
            iconBg="bg-rose-50 text-rose-600"
            testid="kpi-withdrawals"
            breakdowns={[
              { label: "Agent Withdrawals", value: fmtMoney(financial.agent_withdrawals_approved), testid: "kpi-withdrawals-agent" },
              { label: "Distributor Withdrawals", value: fmtMoney(financial.distributor_withdrawals_approved), testid: "kpi-withdrawals-distributor" },
              { label: "Master Distributor Withdrawals", value: fmtMoney(financial.md_withdrawals_approved ?? 0), testid: "kpi-withdrawals-md" }
            ]}
          />
        </div>
      </section>

      <div className="border-t border-black/5" />

      {/* SECTION 2 — Platform Statistics (static) */}
      <section data-testid="section-statistics" className="space-y-5">
        <div>
          <h2 className="text-base font-bold tracking-tight text-neutral-800">Platform Statistics</h2>
          <p className="text-xs text-neutral-400">Overall platform activity and pending queue</p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <StatsCard
            label="Pending Recharges"
            value={stats.pending_recharges ?? 0}
            onClick={() => nav("/admin/recharges")}
            actionLabel="Click to review"
            icon={Clock}
            testid="kpi-pending-recharges"
          />

          <StatsCard
            label="Pending Withdrawals"
            value={stats.pending_withdrawals ?? 0}
            onClick={() => nav("/admin/withdrawals")}
            actionLabel="Click to review"
            icon={Clock}
            testid="kpi-pending-withdrawals"
          />

          <StatsCard
            label="Pending Transactions"
            value={stats.pending_transactions ?? 0}
            onClick={() => nav("/admin/transactions")}
            actionLabel="Click to review"
            icon={Clock}
            theme="amber"
            testid="kpi-pending-tx"
          />

          <StatsCard
            label="Pending KYC"
            value={financial.pending_kyc_count ?? 0}
            onClick={() => nav("/admin/kyc")}
            actionLabel="Click to review"
            icon={ShieldCheck}
            theme="amber"
            testid="kpi-pending-kyc"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
          <InfoCard
            label="Master Distributors"
            value={stats.total_master_distributors ?? 0}
            icon={Crown}
            iconBg="bg-amber-50 text-amber-500"
            testid="kpi-total-master-distributors"
          />
          <InfoCard
            label="Distributors"
            value={stats.total_distributors ?? 0}
            icon={Users}
            iconBg="bg-indigo-50 text-indigo-500"
          />
          <InfoCard
            label="Agents"
            value={stats.total_agents ?? 0}
            icon={UserCog}
            iconBg="bg-rose-50 text-rose-500"
          />
        </div>
      </section>

      {isSuperAdmin && <DangerZone adminEmail={SUPER_ADMIN_EMAIL} />}
    </div>
  );
}
