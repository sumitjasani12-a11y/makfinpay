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

function FinancialCard({ label, value, hint, breakdowns, icon: Icon, colorClass = "text-neutral-850", iconBg = "bg-neutral-50 text-neutral-500", borderClass = "border-black/5", testid, badge, bgClass = "bg-white" }) {
  return (
    <div className={`${bgClass} border ${borderClass} rounded-[28px] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between`} data-testid={testid}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9.5px] uppercase font-bold tracking-widest text-neutral-400">{label}</span>
          <div className="flex items-center gap-2">
            {badge && (
              <span className="text-[10px] font-bold bg-white/80 border border-black/5 px-2 py-0.5 rounded-full whitespace-nowrap tracking-wide">
                {badge}
              </span>
            )}
            {Icon && (
              <div className={`p-2 rounded-xl shrink-0 ${iconBg}`}>
                <Icon className="h-4 w-4" />
              </div>
            )}
          </div>
        </div>
        <div className={`text-[21px] font-black tracking-tight mt-3 ${colorClass}`}>{value}</div>
        {hint && <p className="text-[10.5px] text-neutral-400 font-medium mt-1">{hint}</p>}
      </div>

      {breakdowns && breakdowns.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-black/5 space-y-2 text-[10.5px] text-neutral-400 font-medium">
          {breakdowns.map((b, idx) => (
            <div key={idx} className="flex justify-between items-center" data-testid={b.testid}>
              <span>{b.label}</span>
              <span className="text-neutral-800 font-bold">{b.value}</span>
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

  const userData = [
    { name: "Agents", value: stats.total_agents ?? 0, color: "#ec4899" },
    { name: "Distributors", value: stats.total_distributors ?? 0, color: "#6366f1" },
    { name: "Master Distributors", value: stats.total_master_distributors ?? 0, color: "#f59e0b" },
  ];

  const pendingData = [
    { name: "Recharges", value: stats.pending_recharges ?? 0, fill: "#10b981" },
    { name: "Withdrawals", value: stats.pending_withdrawals ?? 0, fill: "#ef4444" },
    { name: "Transactions", value: stats.pending_transactions ?? 0, fill: "#f59e0b" },
    { name: "KYC Requests", value: financial.pending_kyc_count ?? 0, fill: "#3b82f6" },
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
            colorClass="text-amber-800"
            borderClass="border-amber-100"
            bgClass="bg-gradient-to-br from-amber-50/60 to-amber-100/20"
            icon={TrendingUp}
            iconBg="bg-amber-100/50 text-amber-700"
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
            colorClass="text-indigo-800"
            borderClass="border-indigo-100"
            bgClass="bg-gradient-to-br from-indigo-50/60 to-indigo-100/20"
            icon={Activity}
            iconBg="bg-indigo-100/50 text-indigo-700"
            breakdowns={[
              { label: "CC Bill Charge", value: fmtMoney(financial.cc_bill_revenue ?? 0) },
              { label: "Live Bill Profit", value: fmtMoney(financial.live_bill_profit ?? 0) }
            ]}
          />

          <FinancialCard
            label="Recharge Approved"
            value={fmtMoney(financial.recharge_approved)}
            hint="Gross approved in range"
            colorClass="text-emerald-800"
            borderClass="border-emerald-100"
            bgClass="bg-gradient-to-br from-emerald-50/60 to-emerald-100/20"
            icon={ArrowUpRight}
            iconBg="bg-emerald-100/50 text-emerald-700"
          />

          <FinancialCard
            label="Bill Payments"
            value={fmtMoney(financial.total_txn_amount)}
            hint="Total volume approved"
            colorClass="text-blue-800"
            borderClass="border-blue-100"
            bgClass="bg-gradient-to-br from-blue-50/60 to-blue-100/20"
            icon={FileText}
            iconBg="bg-blue-100/50 text-blue-700"
            badge={`${financial.total_txn_count ?? 0} txns`}
            breakdowns={[
              { label: "CC Bill Volume", value: fmtMoney(financial.cc_bill_volume ?? 0) },
              { label: "Live Bill Volume", value: fmtMoney(financial.live_bill_volume ?? 0) }
            ]}
          />

          <FinancialCard
            label="Withdrawals"
            value={fmtMoney(financial.total_withdrawals_approved)}
            colorClass="text-rose-800"
            borderClass="border-rose-100"
            bgClass="bg-gradient-to-br from-rose-50/60 to-rose-100/20"
            icon={ArrowUpFromLine}
            iconBg="bg-rose-100/50 text-rose-700"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <FinancialCard
            label="Total Wallet Balance"
            value={fmtMoney(financial.total_wallet)}
            hint="All time • Live balance"
            colorClass="text-cyan-800"
            borderClass="border-cyan-100"
            bgClass="bg-gradient-to-br from-cyan-50/60 to-cyan-100/20"
            icon={Wallet}
            iconBg="bg-cyan-100/50 text-cyan-700"
          />

          <FinancialCard
            label="Total MD Earnings"
            value={fmtMoney(financial.total_md_earnings ?? 0)}
            hint="All time • Live balance"
            colorClass="text-violet-850"
            borderClass="border-violet-100"
            bgClass="bg-gradient-to-br from-violet-50/60 to-violet-100/20"
            icon={Coins}
            iconBg="bg-violet-100/50 text-violet-700"
            testid="kpi-total-md-earnings"
          />

          <FinancialCard
            label="Total Distributor Earnings"
            value={fmtMoney(financial.total_distributor_earnings)}
            hint="All time • Live balance"
            colorClass="text-purple-850"
            borderClass="border-purple-100"
            bgClass="bg-gradient-to-br from-purple-50/60 to-purple-100/20"
            icon={Coins}
            iconBg="bg-purple-100/50 text-purple-700"
            testid="kpi-total-distributor-earnings"
          />
        </div>
      </section>

      {/* SECTION 2 — Pending Queue Overview (Compact Cards & Bar Chart Side-by-Side) */}
      <section data-testid="section-statistics" className="space-y-5">
        <div>
          <h2 className="text-base font-bold tracking-tight text-neutral-800">Platform Statistics</h2>
          <p className="text-xs text-neutral-400">Overall platform activity and pending queue</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Pending items cards: 2x2 grid */}
          <div className="lg:col-span-6 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col justify-between min-h-[340px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">Pending Review Items</h3>
            
            <div className="grid grid-cols-2 gap-4 flex-1">
              <button 
                onClick={() => nav("/admin/recharges")} 
                className="text-left bg-slate-50/50 hover:bg-slate-50/90 border border-black/5 hover:border-black/10 rounded-2xl p-4 flex items-center justify-between transition-all hover:-translate-y-0.5"
                data-testid="kpi-pending-recharges"
              >
                <div className="space-y-1">
                  <span className="text-[9.5px] uppercase font-bold tracking-wider text-neutral-400">Pending Recharges</span>
                  <div className="text-2xl font-black text-neutral-800">{stats.pending_recharges ?? 0}</div>
                </div>
                <div className="p-2 rounded-xl bg-emerald-100/60 text-emerald-700">
                  <Clock className="h-4 w-4" />
                </div>
              </button>

              <button 
                onClick={() => nav("/admin/withdrawals")} 
                className="text-left bg-slate-50/50 hover:bg-slate-50/90 border border-black/5 hover:border-black/10 rounded-2xl p-4 flex items-center justify-between transition-all hover:-translate-y-0.5"
                data-testid="kpi-pending-withdrawals"
              >
                <div className="space-y-1">
                  <span className="text-[9.5px] uppercase font-bold tracking-wider text-neutral-400">Pending Withdrawals</span>
                  <div className="text-2xl font-black text-neutral-800">{stats.pending_withdrawals ?? 0}</div>
                </div>
                <div className="p-2 rounded-xl bg-rose-100/60 text-rose-700">
                  <Clock className="h-4 w-4" />
                </div>
              </button>

              <button 
                onClick={() => nav("/admin/transactions")} 
                className="text-left bg-amber-50/30 hover:bg-amber-50/70 border border-amber-200/50 rounded-2xl p-4 flex items-center justify-between transition-all hover:-translate-y-0.5"
                data-testid="kpi-pending-tx"
              >
                <div className="space-y-1">
                  <span className="text-[9.5px] uppercase font-bold tracking-wider text-amber-800/80">Pending Txns</span>
                  <div className="text-2xl font-black text-amber-900">{stats.pending_transactions ?? 0}</div>
                </div>
                <div className="p-2 rounded-xl bg-amber-100/75 text-amber-800">
                  <Clock className="h-4 w-4" />
                </div>
              </button>

              <button 
                onClick={() => nav("/admin/kyc")} 
                className="text-left bg-amber-50/30 hover:bg-amber-50/70 border border-amber-200/50 rounded-2xl p-4 flex items-center justify-between transition-all hover:-translate-y-0.5"
                data-testid="kpi-pending-kyc"
              >
                <div className="space-y-1">
                  <span className="text-[9.5px] uppercase font-bold tracking-wider text-amber-800/80">Pending KYC</span>
                  <div className="text-2xl font-black text-amber-900">{financial.pending_kyc_count ?? 0}</div>
                </div>
                <div className="p-2 rounded-xl bg-amber-100/75 text-amber-800">
                  <ShieldCheck className="h-4 w-4" />
                </div>
              </button>
            </div>
          </div>

          {/* Pending Queue Metrics Bar Chart */}
          <div className="lg:col-span-6 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col h-[340px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">Pending Queue Distribution</h3>
            <div className="flex-1 w-full h-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pendingData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => [`${value} Pending`, "Items"]} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {pendingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-black/5" />

      {/* SECTION 3 — User Stats & Distribution Donut (Side-by-Side at Bottom) */}
      <section className="space-y-5">
        <div>
          <h2 className="text-base font-bold tracking-tight text-neutral-800">Platform Users Insights</h2>
          <p className="text-xs text-neutral-400">Total users demographic and graphical representation</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* User counts (3 cards stack) */}
          <div className="lg:col-span-6 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col justify-between min-h-[340px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">Registered User Roles</h3>
            
            <div className="flex flex-col gap-4 flex-1 justify-center">
              <div 
                className="bg-slate-50/50 border border-black/5 rounded-2xl p-4.5 flex items-center justify-between transition-all hover:bg-slate-50/80 hover:-translate-y-0.5"
                data-testid="kpi-total-master-distributors"
              >
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Master Distributors</span>
                  <div className="text-2xl font-black text-neutral-800">{stats.total_master_distributors ?? 0}</div>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50 text-amber-500">
                  <Crown className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-slate-50/50 border border-black/5 rounded-2xl p-4.5 flex items-center justify-between transition-all hover:bg-slate-50/80 hover:-translate-y-0.5">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Distributors</span>
                  <div className="text-2xl font-black text-neutral-800">{stats.total_distributors ?? 0}</div>
                </div>
                <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-500">
                  <Users className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-slate-50/50 border border-black/5 rounded-2xl p-4.5 flex items-center justify-between transition-all hover:bg-slate-50/80 hover:-translate-y-0.5">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Agents</span>
                  <div className="text-2xl font-black text-neutral-800">{stats.total_agents ?? 0}</div>
                </div>
                <div className="p-3 rounded-2xl bg-rose-50 text-rose-500">
                  <UserCog className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          {/* User Distribution Pie/Donut Chart */}
          <div className="lg:col-span-6 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col h-[340px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">User Distribution</h3>
            <div className="flex-1 w-full h-full relative min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={userData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {userData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} Users`, "Count"]} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {isSuperAdmin && <DangerZone adminEmail={SUPER_ADMIN_EMAIL} />}
    </div>
  );
}
