import React, { useEffect, useState } from "react";
import { api, fmtMoney } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import KycPasswordGate from "@/components/KycPasswordGate";
import { Users, Clock, ShieldCheck, Coins } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

export default function DistOverview() {
  const { user } = useAuth();
  const [s, setS] = useState({});

  useEffect(() => {
    if (user && user.kyc_status === "approved" && !user.first_login) {
      api.get("/distributor/stats")
        .then((r) => setS(r.data))
        .catch((e) => console.log("Stats ignored:", e.message));
    }
  }, [user]);

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
            <div className="bg-gradient-to-br from-fuchsia-50/60 to-fuchsia-100/20 border border-fuchsia-100/80 rounded-[28px] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-fuchsia-800">My Agents</span>
                <div className="p-2 rounded-xl bg-fuchsia-100/50 text-fuchsia-700">
                  <Users className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-fuchsia-955 mt-4">{s.agents ?? 0}</div>
                <p className="text-[10px] text-fuchsia-600 font-semibold mt-1">Active agents in network</p>
              </div>
            </div>

            {/* Card 2: Pending Recharges */}
            <div className="bg-gradient-to-br from-amber-50/60 to-amber-100/20 border border-amber-100/80 rounded-[28px] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-amber-800">Pending Recharges</span>
                <div className="p-2 rounded-xl bg-amber-100/50 text-amber-700">
                  <Clock className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-amber-955 mt-4">{s.pending_recharges ?? 0}</div>
                <p className="text-[10px] text-amber-600 font-semibold mt-1">Awaiting admin review</p>
              </div>
            </div>

            {/* Card 3: Approved Recharges */}
            <div className="bg-gradient-to-br from-emerald-50/60 to-emerald-100/20 border border-emerald-100/80 rounded-[28px] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-emerald-800">Approved Recharges</span>
                <div className="p-2 rounded-xl bg-emerald-100/50 text-emerald-700">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-emerald-955 mt-4">{s.approved_recharges ?? 0}</div>
                <p className="text-[10px] text-emerald-600 font-semibold mt-1">Processed successfully</p>
              </div>
            </div>

            {/* Card 4: Total Earnings */}
            <div className="bg-gradient-to-br from-cyan-50/60 to-cyan-100/20 border border-cyan-100/80 rounded-[28px] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider text-cyan-800">Total Earnings</span>
                <div className="p-2 rounded-xl bg-cyan-100/50 text-cyan-700">
                  <Coins className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-black text-cyan-955 mt-4">{fmtMoney(s.earnings ?? 0)}</div>
                <p className="text-[10px] text-cyan-600 font-semibold mt-1">Live dynamic earnings</p>
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
