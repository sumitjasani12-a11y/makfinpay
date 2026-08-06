import React, { useEffect, useState, useCallback } from "react";
import { api, fmtMoney } from "@/lib/api";
import { getSupabase, supabaseRpc } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import KycPasswordGate from "@/components/KycPasswordGate";
import { useWebSocketListener } from "@/lib/ws";
import { Users, Clock, ShieldCheck, Coins } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

export default function DistOverview() {
  const { user } = useAuth();
  const [s, setS] = useState({});

  const fetchStats = useCallback(() => {
    if (user && user.id && user.kyc_status === "approved" && !user.first_login) {
      supabaseRpc("rpc_get_distributor_stats", { p_dist_id: user.id })
        .then(({ data, error }) => {
          if (data && !error) {
            setS(data);
          } else {
            api.get("/distributor/stats").then((r) => setS(r.data)).catch(() => {});
          }
        })
        .catch(() => {
          api.get("/distributor/stats").then((r) => setS(r.data)).catch(() => {});
        });
    }
  }, [user]);

  useEffect(() => {
    fetchStats();
    const supabase = getSupabase();
    if (user && user.id && supabase) {
      const channel = supabase
        .channel(`dist_stats_${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "recharges" }, () => fetchStats())
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchStats]);

  useWebSocketListener("recharge_created", fetchStats);
  useWebSocketListener("recharge_updated", fetchStats);
  useWebSocketListener("wallet_updated", fetchStats);

  const chartData = [
    { name: "Agents", value: s.agents ?? 0, fill: "#d946ef" },
    { name: "Pending", value: s.pending_recharges ?? 0, fill: "#f59e0b" },
    { name: "Approved", value: s.approved_recharges ?? 0, fill: "#10b981" },
    { name: "Earnings", value: s.earnings ?? 0, fill: "#06b6d4" },
  ];

  return (
    <KycPasswordGate>
      <div className="space-y-6">
        <PageHeader title="Distributor overview" subtitle="Manage agents and grow your network." />
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Side: 2x2 grid of premium cards */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: My Agents */}
            <div className="bg-gradient-to-br from-[#3B0066] to-[#6F42C1] text-white border border-purple-500/20 rounded-[28px] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-purple-100/80">My Agents</span>
                <div className="p-2.5 bg-white/10 text-purple-300 border border-white/10 rounded-xl shrink-0">
                  <Users className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-white mt-4">{s.agents ?? 0}</div>
                <p className="text-[10px] text-purple-200/80 font-semibold mt-1">Active agents in network</p>
              </div>
            </div>

            {/* Card 2: Pending Recharges */}
            <div className="bg-gradient-to-br from-[#664D03] to-[#FD7E14] text-white border border-orange-500/20 rounded-[28px] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-orange-100/80">Pending Recharges</span>
                <div className="p-2.5 bg-white/10 text-orange-300 border border-white/10 rounded-xl shrink-0">
                  <Clock className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-white mt-4">{s.pending_recharges ?? 0}</div>
                <p className="text-[10px] text-orange-200/80 font-semibold mt-1">Awaiting admin review</p>
              </div>
            </div>

            {/* Card 3: Approved Recharges */}
            <div className="bg-gradient-to-br from-[#0F5132] to-[#198754] text-white border border-emerald-500/20 rounded-[28px] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-emerald-100/80">Approved Recharges</span>
                <div className="p-2.5 bg-white/10 text-emerald-300 border border-white/10 rounded-xl shrink-0">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-white mt-4">{s.approved_recharges ?? 0}</div>
                <p className="text-[10px] text-emerald-200/80 font-semibold mt-1">Processed successfully</p>
              </div>
            </div>

            {/* Card 4: Today's Earnings */}
            <div className="bg-gradient-to-br from-[#0A3641] to-[#0D6EFD] text-white border border-blue-500/20 rounded-[28px] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-blue-100/80">Today's Earnings</span>
                <div className="p-2.5 bg-white/10 text-blue-300 border border-white/10 rounded-xl shrink-0">
                  <Coins className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-white mt-4">{fmtMoney(s.today_earnings ?? 0)}</div>
                <p className="text-[10px] text-blue-200/80 font-semibold mt-1">Today's dynamic earnings</p>
              </div>
            </div>
          </div>

          {/* Right Side: Recharts Bar Chart */}
          <div className="lg:col-span-6 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col h-full min-h-[320px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">Network & Earnings Analytics</h3>
            <div className="flex-1 w-full h-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#888888" fontSize={9.5} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={9.5} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value, name, props) => {
                    if (props.payload.name === "Earnings") return [fmtMoney(value), "Total Earnings"];
                    return [value, props.payload.name];
                  }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </KycPasswordGate>
  );
}
