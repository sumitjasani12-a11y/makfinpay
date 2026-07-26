import React, { useEffect, useState } from "react";
import { api, fmtMoney } from "@/lib/api";
import { Kpi, PageHeader } from "@/components/Shared";

export default function MdOverview() {
  const [s, setS] = useState({});
  useEffect(() => { api.get("/master-distributor/stats").then((r) => setS(r.data)); }, []);
  return (
    <div>
      <PageHeader title="Master Distributor overview" subtitle="Manage your distributors + agents and grow your network." />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        <Kpi label="My Distributors" value={s.distributors ?? 0} data-testid="kpi-md-distributors" />
        <Kpi label="My Agents" value={s.agents ?? 0} data-testid="kpi-md-agents" />
        <Kpi label="Pending Recharges" value={s.pending_recharges ?? 0} data-testid="kpi-md-pending-recharges" />
        <Kpi label="Approved Recharges" value={s.approved_recharges ?? 0} data-testid="kpi-md-approved-recharges" />
        <Kpi label="Total Earnings" value={fmtMoney(s.earnings)} accent="text-[#CC5500]" data-testid="kpi-md-earnings" />
      </div>
    </div>
  );
}
