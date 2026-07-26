import React, { useEffect, useState } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable } from "@/components/Shared";

export default function AgentLedger() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/wallet/ledger").then((r) => setItems(r.data)); }, []);
  return (
    <div>
      <PageHeader title="Wallet Ledger" subtitle="Immutable record of every wallet movement." />
      <DataTable
        columns={[
          { key: "kind", label: "Type", render: (r) => <span className="capitalize">{r.kind}</span> },
          { key: "amount", label: "Amount", render: (r) => <span className={r.kind === "debit" ? "text-rose-700" : "text-emerald-700"}>{r.kind === "debit" ? "-" : "+"}{fmtMoney(r.amount)}</span> },
          { key: "balance_after", label: "Balance", render: (r) => fmtMoney(r.balance_after) },
          { key: "ref_type", label: "Reference" },
          { key: "note", label: "Note" },
          { key: "created_at", label: "Time", render: (r) => fmtDate(r.created_at) },
        ]}
        rows={items}
      />
    </div>
  );
}
