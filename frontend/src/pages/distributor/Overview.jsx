import React, { useEffect, useState } from "react";
import { api, fmtMoney } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Kpi, PageHeader } from "@/components/Shared";
import KycPasswordGate from "@/components/KycPasswordGate";

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

  return (
    <KycPasswordGate>
      <div>
        <PageHeader title="Distributor overview" subtitle="Manage agents and grow your network." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Kpi label="My Agents" value={s.agents ?? 0} />
          <Kpi label="Pending Recharges" value={s.pending_recharges ?? 0} />
          <Kpi label="Approved Recharges" value={s.approved_recharges ?? 0} />
          <Kpi label="Total Earnings" value={fmtMoney(s.earnings)} accent="text-[#CC5500]" />
        </div>
      </div>
    </KycPasswordGate>
  );
}
