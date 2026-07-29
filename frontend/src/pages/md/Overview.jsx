import React, { useEffect, useState } from "react";
import { api, fmtMoney } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import KycPasswordGate from "@/components/KycPasswordGate";
import { Users, UserCog, Clock, ShieldCheck, Coins } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export default function MdOverview() {
  const { user } = useAuth();
  const [s, setS] = useState({});

  useEffect(() => {
    if (user && user.kyc_status === "approved" && !user.first_login) {
      api.get("/master-distributor/stats")
        .then((r) => setS(r.data))
        .catch((e) => console.log("Stats ignored:", e.message));
    }
  }, [user]);

  const chartData = [
    { name: "Distributors", value: s.distributors ?? 0, color: "#4f46e5" },
    { name: "Agents", value: s.agents ?? 0, color: "#d946ef" },
    { name: "Pending", value: s.pending_recharges ?? 0, color: "#f59e0b" },
    { name: "Approved", value: s.approved_recharges ?? 0, color: "#10b981" },
    { name: "Earnings", value: s.earnings ?? 0, color: "#06b6d4" },
  ];

  return (
    <KycPasswordGate>
      <div className="space-y-6">
        <PageHeader title="Master Distributor overview" subtitle="Manage your distributors + agents and grow your network." />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Side: Cards layout */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* 2x2 grid for counts */}
            <div className="grid grid-cols-2 gap-4">
              {/* Card 1: My Distributors */}
              <div className="bg-gradient-to-br from-[#1d1b4c] to-[#4f46e5] text-white border border-indigo-500/20 rounded-[24px] p-4.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[125px]" data-testid="kpi-md-distributors">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-100/80">My Distributors</span>
                  <div className="p-2 bg-white/10 text-indigo-300 border border-white/10 rounded-xl shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white mt-3">{s.distributors ?? 0}</div>
                  <p className="text-[9.5px] text-indigo-200/80 font-semibold mt-0.5">Distributors registered</p>
                </div>
              </div>

              {/* Card 2: My Agents */}
              <div className="bg-gradient-to-br from-[#3B0066] to-[#6F42C1] text-white border border-purple-500/20 rounded-[24px] p-4.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[125px]" data-testid="kpi-md-agents">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-purple-100/80">My Agents</span>
                  <div className="p-2 bg-white/10 text-purple-300 border border-white/10 rounded-xl shrink-0">
                    <UserCog className="h-4 w-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white mt-3">{s.agents ?? 0}</div>
                  <p className="text-[9.5px] text-purple-200/80 font-semibold mt-0.5">Agents registered</p>
                </div>
              </div>

              {/* Card 3: Pending Recharges */}
              <div className="bg-gradient-to-br from-[#664D03] to-[#FD7E14] text-white border border-orange-500/20 rounded-[24px] p-4.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[125px]" data-testid="kpi-md-pending-recharges">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-orange-100/80">Pending Recharges</span>
                  <div className="p-2 bg-white/10 text-orange-300 border border-white/10 rounded-xl shrink-0">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white mt-3">{s.pending_recharges ?? 0}</div>
                  <p className="text-[9.5px] text-orange-200/80 font-semibold mt-0.5">Awaiting review</p>
                </div>
              </div>

              {/* Card 4: Approved Recharges */}
              <div className="bg-gradient-to-br from-[#0F5132] to-[#198754] text-white border border-emerald-500/20 rounded-[24px] p-4.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[125px]" data-testid="kpi-md-approved-recharges">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-100/80">Approved Recharges</span>
                  <div className="p-2 bg-white/10 text-emerald-300 border border-white/10 rounded-xl shrink-0">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white mt-3">{s.approved_recharges ?? 0}</div>
                  <p className="text-[9.5px] text-emerald-200/80 font-semibold mt-0.5">Approved all-time</p>
                </div>
              </div>
            </div>

            {/* Full-width Card 5: Total Earnings */}
            <div className="bg-gradient-to-br from-[#0A3641] to-[#0D6EFD] text-white border border-blue-500/20 rounded-[24px] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-between min-h-[96px]" data-testid="kpi-md-earnings">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 text-blue-300 border border-white/10 rounded-2xl shrink-0">
                  <Coins className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-blue-100/80">Total Earnings</span>
                  <div className="text-2xl font-black text-white mt-0.5">{fmtMoney(s.earnings ?? 0)}</div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9.5px] text-blue-200/80 font-semibold">Live dynamic earnings</p>
                <p className="text-[8px] text-blue-100/60 font-bold uppercase tracking-wider mt-0.5">All time</p>
              </div>
            </div>
          </div>

          {/* Right Side: Recharts Pie Chart */}
          <div className="lg:col-span-7 bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col h-full min-h-[366px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">Operations & Earnings Distribution</h3>
            <div className="flex-1 w-full h-full relative min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name, props) => {
                    if (props.payload.name === "Earnings") return [fmtMoney(value), "Total Earnings"];
                    return [value, props.payload.name];
                  }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </KycPasswordGate>
  );
}
