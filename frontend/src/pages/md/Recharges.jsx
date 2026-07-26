import React, { useEffect, useState } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";

const COLUMNS = [
  { key: "user_name", label: "Agent" },
  { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount) },
  { key: "credit_amount", label: "Net Credit", render: (r) => r.status === "approved" ? fmtMoney(r.credit_amount) : "—" },
  { key: "commission_percent", label: "Comm %", render: (r) => `${r.commission_percent}%` },
  { key: "md_earnings_amount", label: "My Earnings", render: (r) => r.status === "approved" ? fmtMoney(r.md_earnings_amount ?? 0) : "—" },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
];

export default function MdRecharges() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/master-distributor/recharges").then((r) => setItems(r.data)); }, []);
  return (
    <div>
      <PageHeader title="Downline Recharge Activity" subtitle="Recharges from every agent in your downline (direct + via distributors)." />
      <DataTable columns={COLUMNS} rows={items} empty="No recharges yet." />
    </div>
  );
}
