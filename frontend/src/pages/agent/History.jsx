import React, { useEffect, useState } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";

export default function AgentHistory() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/agent/transactions").then((r) => setItems(r.data)); }, []);
  return (
    <div>
      <PageHeader title="Transaction History" subtitle="All bill payments performed by you. Pending payments are under admin review." />
      <DataTable
        columns={[
          { key: "customer_name", label: "Customer" },
          { key: "operator", label: "Bank" },
          { key: "card_last4", label: "Card", render: (r) => `**** ${r.card_last4}` },
          { key: "bill_amount", label: "Bill Amount", render: (r) => fmtMoney(r.bill_amount ?? r.amount) },
          { key: "service_charge", label: "Service Charge", render: (r) => r.service_charge != null ? fmtMoney(r.service_charge) : "—" },
          { key: "total_amount", label: "Total Deducted", render: (r) => <span className="font-semibold text-[#1B4332]">{fmtMoney(r.total_amount ?? r.amount)}</span> },
          { key: "status", label: "Status", render: (r) => (
            <div className="flex flex-col gap-1">
              <StatusBadge status={r.status} />
              {r.status === "pending" && <span className="text-[10px] text-amber-700">Under Admin Review</span>}
            </div>
          ) },
          { key: "created_at", label: "Date", render: (r) => fmtDate(r.created_at) },
        ]}
        rows={items}
      />
    </div>
  );
}
