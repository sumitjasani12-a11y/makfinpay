import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtMoney, formatErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";

import { 
  Loader2, TrendingUp, Activity, ArrowUpRight, Wallet, 
  Coins, FileText, ArrowUpFromLine, Clock, ShieldCheck, 
  Users, UserCog, Crown, ArrowRight, ClipboardList 
} from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

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

function FinancialCard({ label, value, hint, breakdowns, icon: Icon, testid, badge, bgClass = "bg-white border-black/5" }) {
  return (
    <div className={`${bgClass} rounded-[28px] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between`} data-testid={testid}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase font-black tracking-wider text-white/80">{label}</span>
          <div className="flex items-center gap-2">
            {badge && (
              <span className="text-[9.5px] font-black bg-white/20 border border-white/10 px-2 py-0.5 rounded-full text-white tracking-wide">
                {badge}
              </span>
            )}
            {Icon && (
              <div className="p-2 rounded-xl shrink-0 bg-white/10 text-white/90 border border-white/10">
                <Icon className="h-4 w-4" />
              </div>
            )}
          </div>
        </div>
        <div className="text-2xl font-black tracking-tight mt-3 text-white">{value}</div>
        {hint && <p className="text-[11px] text-white/70 font-semibold mt-1">{hint}</p>}
      </div>

      {breakdowns && breakdowns.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-white/10 space-y-2 text-[11px] text-white/70 font-semibold">
          {breakdowns.map((b, idx) => (
            <div key={idx} className="flex justify-between items-center" data-testid={b.testid}>
              <span>{b.label}</span>
              <span className="text-white font-black">{b.value}</span>
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

  const combinedData = [
    { name: "P. Recharge", value: stats.pending_recharges ?? 0, fill: "url(#barEmerald)" },
    { name: "P. Withdraw", value: stats.pending_withdrawals ?? 0, fill: "url(#barRose)" },
    { name: "P. Txn", value: stats.pending_transactions ?? 0, fill: "url(#barAmber)" },
    { name: "P. KYC", value: financial.pending_kyc_count ?? 0, fill: "url(#barBlue)" },
    { name: "MDs", value: stats.total_master_distributors ?? 0, fill: "url(#barPurple)" },
    { name: "Dists", value: stats.total_distributors ?? 0, fill: "url(#barPink)" },
    { name: "Agents", value: stats.total_agents ?? 0, fill: "url(#barIndigo)" },
  ];

  const lifetimeData = [
    { name: "Wallet Balance", value: financial.total_wallet ?? 0, fill: "url(#walletGrad)" },
    { name: "MD Earnings", value: financial.total_md_earnings ?? 0, fill: "url(#mdGrad)" },
    { name: "Distributor Earnings", value: financial.total_distributor_earnings ?? 0, fill: "url(#distGrad)" },
  ];

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

      {/* SECTION 1 — Business Performance (Daily Basis) */}
      <section data-testid="section-financial">
        <div className="mb-6">
          <h2 className="text-base font-bold tracking-tight text-neutral-800">Business Performance</h2>
          <p className="text-xs text-neutral-400">Data filtered by selected date range (Daily Basis)</p>
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
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5 transition-opacity duration-300 ${loadingFin ? "opacity-60" : "opacity-100"}`}>
          
          <FinancialCard
            label="Total Revenue (Commission)"
            value={fmtMoney(financial.total_revenue)}
            bgClass="bg-gradient-to-br from-[#664D03] to-[#FD7E14] border border-orange-500/20 text-white"
            icon={TrendingUp}
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
            bgClass="bg-gradient-to-br from-[#1E203B] to-[#4F46E5] border border-indigo-500/20 text-white"
            icon={Activity}
            breakdowns={[
              { label: "CC Bill Charge", value: fmtMoney(financial.cc_bill_revenue ?? 0) },
              { label: "Live Bill Profit", value: fmtMoney(financial.live_bill_profit ?? 0) }
            ]}
          />

          <FinancialCard
            label="Recharge Approved"
            value={fmtMoney(financial.recharge_approved)}
            hint="Gross approved in range"
            bgClass="bg-gradient-to-br from-[#0F5132] to-[#198754] border border-emerald-500/20 text-white"
            icon={ArrowUpRight}
          />

          <FinancialCard
            label="Bill Payments"
            value={fmtMoney(financial.total_txn_amount)}
            hint="Total volume approved"
            bgClass="bg-gradient-to-br from-[#0A3641] to-[#0D6EFD] border border-blue-500/20 text-white"
            icon={FileText}
            badge={`${financial.total_txn_count ?? 0} txns`}
            breakdowns={[
              { label: "CC Bill Volume", value: fmtMoney(financial.cc_bill_volume ?? 0) },
              { label: "Live Bill Volume", value: fmtMoney(financial.live_bill_volume ?? 0) }
            ]}
          />

          <FinancialCard
            label="Withdrawals"
            value={fmtMoney(financial.total_withdrawals_approved)}
            bgClass="bg-gradient-to-br from-[#3B0066] to-[#6F42C1] border border-purple-500/20 text-white"
            icon={ArrowUpFromLine}
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

      {/* SECTION 2 — Lifetime Overview (All Time) */}
      <section data-testid="section-lifetime" className="space-y-5">
        <div>
          <h2 className="text-base font-bold tracking-tight text-neutral-800">Lifetime Overview</h2>
          <p className="text-xs text-neutral-400">Static lifetime balances (All Time)</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Side: Lifetime Pie/Donut Chart */}
          <div className="lg:col-span-6 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col h-[340px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Lifetime Balances Distribution</h3>
            <div className="flex-1 w-full relative min-h-0 mt-2">
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                <span className="text-[10px] uppercase font-extrabold text-neutral-450 tracking-wider">Total Funds</span>
                <span className="text-xl font-black text-neutral-850 mt-0.5">
                  {fmtMoney(
                    (financial.total_wallet ?? 0) + 
                    (financial.total_md_earnings ?? 0) + 
                    (financial.total_distributor_earnings ?? 0)
                  )}
                </span>
              </div>
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <defs>
                    <linearGradient id="walletGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#0891b2" />
                    </linearGradient>
                    <linearGradient id="mdGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                    <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f472b6" />
                      <stop offset="100%" stopColor="#db2777" />
                    </linearGradient>
                  </defs>
                  <Pie
                    data={lifetimeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={88}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {lifetimeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [fmtMoney(value), "Amount"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Custom Premium HTML Legend */}
            <div className="flex justify-center items-center gap-6 text-[11px] font-bold text-neutral-600 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#06b6d4] to-[#0891b2] shrink-0" />
                <span>Wallet Balance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] shrink-0" />
                <span>MD Earnings</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#f472b6] to-[#db2777] shrink-0" />
                <span>Distributor Earnings</span>
              </div>
            </div>
          </div>

          {/* Right Side: Lifetime Cards in a single unified card matching h-[340px] */}
          <div className="lg:col-span-6 bg-white border border-black/5 rounded-[28px] p-5 shadow-sm flex flex-col justify-between h-[340px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Live Balances & Earnings</h3>
            
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {/* Wallet Balance */}
              <div className="p-4 bg-slate-50/30 hover:bg-white border border-slate-100/80 rounded-2xl flex items-center justify-between hover:-translate-y-0.5 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.01)] hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.05)] group">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-cyan-50 text-cyan-600 border border-cyan-100/50 rounded-full">
                    Wallet Balance
                  </span>
                  <p className="text-xl font-black text-neutral-800 mt-2">{fmtMoney(financial.total_wallet)}</p>
                  <p className="text-[9px] text-neutral-400 font-semibold mt-0.5">Live system-wide user funds</p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100/40 group-hover:scale-110 transition-transform">
                  <Wallet className="h-5 w-5" />
                </div>
              </div>

              {/* MD Earnings */}
              <div className="p-4 bg-slate-50/30 hover:bg-white border border-slate-100/80 rounded-2xl flex items-center justify-between hover:-translate-y-0.5 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.01)] hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.05)] group" data-testid="kpi-total-md-earnings">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-violet-50 text-violet-600 border border-violet-100/50 rounded-full">
                    MD Earnings
                  </span>
                  <p className="text-xl font-black text-neutral-800 mt-2">{fmtMoney(financial.total_md_earnings ?? 0)}</p>
                  <p className="text-[9px] text-neutral-400 font-semibold mt-0.5">Accumulated Master Distributor earnings</p>
                </div>
                <div className="p-3 rounded-xl bg-violet-50 text-violet-600 border border-violet-100/40 group-hover:scale-110 transition-transform">
                  <Coins className="h-5 w-5" />
                </div>
              </div>

              {/* Distributor Earnings */}
              <div className="p-4 bg-slate-50/30 hover:bg-white border border-slate-100/80 rounded-2xl flex items-center justify-between hover:-translate-y-0.5 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.01)] hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.05)] group" data-testid="kpi-total-distributor-earnings">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100/50 rounded-full">
                    Distributor Earnings
                  </span>
                  <p className="text-xl font-black text-neutral-800 mt-2">{fmtMoney(financial.total_distributor_earnings)}</p>
                  <p className="text-[9px] text-neutral-400 font-semibold mt-0.5">Accumulated Distributor earnings</p>
                </div>
                <div className="p-3 rounded-xl bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100/40 group-hover:scale-110 transition-transform">
                  <Coins className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 — Unified Platform Statistics & Analytics */}
      <section data-testid="section-statistics" className="space-y-5">
        <div>
          <h2 className="text-base font-bold tracking-tight text-neutral-800">Platform Analytics</h2>
          <p className="text-xs text-neutral-400">Unified view of platform users demographic and pending action queues</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Side: Combined metrics panel card */}
          <div className="lg:col-span-5 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col justify-between min-h-[380px]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-450 mb-3.5">Pending Action Items</h3>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => nav("/admin/recharges")} 
                  className="text-left p-3.5 bg-slate-50/30 hover:bg-emerald-50/40 border border-slate-100 hover:border-emerald-200/80 rounded-2xl flex items-center justify-between transition-all duration-300 hover:-translate-y-0.5"
                  data-testid="kpi-pending-recharges"
                >
                  <div>
                    <p className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wide">Recharges</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{stats.pending_recharges ?? 0}</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-emerald-100/50 text-emerald-700">
                    <Clock className="h-4 w-4" />
                  </div>
                </button>

                <button 
                  onClick={() => nav("/admin/withdrawals")} 
                  className="text-left p-3.5 bg-slate-50/30 hover:bg-rose-50/40 border border-slate-100 hover:border-rose-200/80 rounded-2xl flex items-center justify-between transition-all duration-300 hover:-translate-y-0.5"
                  data-testid="kpi-pending-withdrawals"
                >
                  <div>
                    <p className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wide">Withdrawals</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{stats.pending_withdrawals ?? 0}</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-rose-100/50 text-rose-700">
                    <Clock className="h-4 w-4" />
                  </div>
                </button>

                <button 
                  onClick={() => nav("/admin/transactions")} 
                  className="text-left p-3.5 bg-slate-50/30 hover:bg-amber-50/40 border border-slate-100 hover:border-amber-200/80 rounded-2xl flex items-center justify-between transition-all duration-300 hover:-translate-y-0.5"
                  data-testid="kpi-pending-tx"
                >
                  <div>
                    <p className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wide">Transactions</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{stats.pending_transactions ?? 0}</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-amber-100/50 text-amber-800">
                    <Clock className="h-4 w-4" />
                  </div>
                </button>

                <button 
                  onClick={() => nav("/admin/kyc")} 
                  className="text-left p-3.5 bg-slate-50/30 hover:bg-blue-50/40 border border-slate-100 hover:border-blue-200/80 rounded-2xl flex items-center justify-between transition-all duration-300 hover:-translate-y-0.5"
                  data-testid="kpi-pending-kyc"
                >
                  <div>
                    <p className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wide">KYC Requests</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{financial.pending_kyc_count ?? 0}</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-blue-100/50 text-blue-700">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </button>
              </div>
            </div>

            <div className="border-t border-black/5 my-4" />

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3.5">Registered Accounts</h3>
              <div className="grid grid-cols-3 gap-3">
                <div 
                  className="p-3 bg-slate-50/30 hover:bg-amber-50/40 border border-slate-100 hover:border-amber-200/80 rounded-2xl flex items-center justify-between transition-all duration-300"
                  data-testid="kpi-total-master-distributors"
                >
                  <div>
                    <p className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-tight">Master Dist</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{stats.total_master_distributors ?? 0}</p>
                  </div>
                  <div className="p-1 rounded-lg bg-amber-50 text-amber-500">
                    <Crown className="h-4 w-4" />
                  </div>
                </div>

                <div className="p-3 bg-slate-50/30 hover:bg-indigo-50/40 border border-slate-100 hover:border-indigo-200/80 rounded-2xl flex items-center justify-between transition-all duration-300">
                  <div>
                    <p className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-tight">Distributor</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{stats.total_distributors ?? 0}</p>
                  </div>
                  <div className="p-1 rounded-lg bg-indigo-50 text-indigo-500">
                    <Users className="h-4 w-4" />
                  </div>
                </div>

                <div className="p-3 bg-slate-50/30 hover:bg-rose-50/40 border border-slate-100 hover:border-rose-200/80 rounded-2xl flex items-center justify-between transition-all duration-300">
                  <div>
                    <p className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-tight">Agent</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{stats.total_agents ?? 0}</p>
                  </div>
                  <div className="p-1 rounded-lg bg-rose-50 text-rose-500">
                    <UserCog className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Combined metrics composed visual bar chart */}
          <div className="lg:col-span-7 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col h-[380px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">Operations & Demographic Analysis</h3>
            <div className="flex-1 w-full h-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={combinedData} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barEmerald" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="barRose" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" />
                      <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                    <linearGradient id="barAmber" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <linearGradient id="barBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                    <linearGradient id="barPurple" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c084fc" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                    <linearGradient id="barPink" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f472b6" />
                      <stop offset="100%" stopColor="#db2777" />
                    </linearGradient>
                    <linearGradient id="barIndigo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#888888" fontSize={9.5} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={9.5} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => [`${value}`, "Count"]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {combinedData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Removed Danger Zone */}
    </div>
  );
}
