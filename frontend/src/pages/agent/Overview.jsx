import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import { Wallet, ArrowRight, FilePlus2, CreditCard, ArrowUpFromLine } from "lucide-react";

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function AgentOverview() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState([]);
  const now = useNow();

  useEffect(() => {
    api.get("/wallet").then((r) => setBalance(Number(r.data?.balance ?? 0)));
    api.get("/wallet/ledger").then((r) => setLedger((r.data || []).slice(0, 6)));
  }, []);

  const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });

  return (
    <div className="overflow-x-hidden">
      <PageHeader title={`Welcome, ${user.full_name}`} subtitle="Your wallet is the north star of operations." />

      {/* Two-column hero: wallet (70%) + date/time (30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 mb-5">
        <div className="mfp-card p-8 !bg-[#1B4332] text-white relative overflow-hidden lg:col-span-7" data-testid="wallet-hero">
          <div className="text-xs uppercase tracking-[0.2em] text-white/80">Wallet Balance</div>
          <div className="mt-4 text-4xl sm:text-5xl font-medium tracking-tight text-white" data-testid="wallet-balance">
            {fmtMoney(balance)}
          </div>
          <Wallet className="absolute -right-8 -bottom-8 h-44 w-44 text-white/5" />
        </div>
        <div className="mfp-card p-6 lg:col-span-3 flex flex-col justify-center" data-testid="datetime-card">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Today</div>
          <div className="mt-3 text-2xl sm:text-3xl font-medium tracking-tight text-[#1B4332]" data-testid="now-date">{dateStr}</div>
          <div className="mt-1 text-sm text-neutral-700 tabular-nums" data-testid="now-time">{timeStr}</div>
          <div className="mt-3 text-xs text-neutral-500">Live data updates instantly</div>
        </div>
      </div>

      {/* 3 stacked action buttons */}
      <div className="grid grid-cols-1 gap-3 mb-8">
        <Link to="/agent/recharge" className="rounded-xl bg-[#CC5500] hover:bg-[#A64500] text-white px-4 py-3 text-sm font-semibold inline-flex items-center justify-center gap-2" data-testid="quick-recharge">
          <FilePlus2 className="h-4 w-4" /> Recharge
        </Link>
        <Link to="/agent/billpay" className="rounded-xl border-2 border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332] hover:text-white px-4 py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors" data-testid="quick-billpay">
          <CreditCard className="h-4 w-4" /> Pay Credit Card Bill
        </Link>
        <Link to="/agent/withdrawal" className="rounded-xl border-2 border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332] hover:text-white px-4 py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors" data-testid="quick-withdraw">
          <ArrowUpFromLine className="h-4 w-4" /> Withdraw
        </Link>
      </div>

      <div className="mfp-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Recent ledger</h3>
          <Link to="/agent/ledger" className="text-sm text-[#1B4332] hover:underline inline-flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full mfp-table">
            <thead><tr><th>Kind</th><th>Amount</th><th>Balance</th><th>Note</th><th>Time</th></tr></thead>
            <tbody>
              {ledger.length === 0 && <tr><td colSpan="5" className="text-center text-neutral-500 py-8">No activity yet. Start with a recharge.</td></tr>}
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="capitalize">{l.kind}</td>
                  <td className={l.kind === "debit" ? "text-rose-700" : "text-emerald-700"}>{l.kind === "debit" ? "-" : "+"}{fmtMoney(l.amount)}</td>
                  <td>{fmtMoney(l.balance_after)}</td>
                  <td className="text-neutral-600 max-w-[240px] truncate">{l.note}</td>
                  <td className="text-xs text-neutral-500">{fmtDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
