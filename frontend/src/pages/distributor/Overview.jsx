import React, { useEffect, useState } from "react";
import { api, fmtMoney } from "@/lib/api";
import { Kpi, PageHeader } from "@/components/Shared";

export default function DistOverview() {
  const [s, setS] = useState({});
  useEffect(() => { api.get("/distributor/stats").then((r) => setS(r.data)); }, []);
  return (
    <div>
      <PageHeader title="Distributor overview" subtitle="Manage agents and grow your network." />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Kpi label="My Agents" value={s.agents ?? 0} />
        <Kpi label="Pending Recharges" value={s.pending_recharges ?? 0} />
        <Kpi label="Approved Recharges" value={s.approved_recharges ?? 0} />
        <Kpi label="Total Earnings" value={fmtMoney(s.earnings)} accent="text-[#CC5500]" />
      </div>
    </div>
  );
}
