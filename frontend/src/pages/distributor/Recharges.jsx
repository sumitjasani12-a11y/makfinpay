import React, { useEffect, useMemo, useState } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";

const COLUMNS = [
  { key: "user_name", label: "Agent" },
  { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount) },
  { key: "credit_amount", label: "Net Credit", render: (r) => r.status === "approved" ? fmtMoney(r.credit_amount) : "—" },
  { key: "commission_percent", label: "Comm %", render: (r) => `${r.commission_percent}%` },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
];

export default function DistRecharges() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/distributor/recharges").then((r) => setItems(r.data)); }, []);
  const columns = useMemo(() => COLUMNS, []);
  return (
    <div>
      <PageHeader title="Agent Recharge Activity" subtitle="See recharge requests and their status across your agents." />
      <DataTable columns={columns} rows={items} />
    </div>
  );
}
