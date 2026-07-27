import React, { useEffect, useState, useMemo } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable } from "@/components/Shared";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, X } from "lucide-react";

export default function AgentLedger() {
  const [items, setItems] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    api.get("/wallet/ledger").then((r) => setItems(r.data || []));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const itemDate = item.created_at ? item.created_at.substring(0, 10) : "";
      const matchesStart = !startDate || itemDate >= startDate;
      const matchesEnd = !endDate || itemDate <= endDate;
      return matchesStart && matchesEnd;
    });
  }, [items, startDate, endDate]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const exportExcel = () => {
    const csvRows = [
      ["Type", "Amount", "Balance After", "Reference", "Note", "Time"]
    ];
    filteredItems.forEach((item) => {
      csvRows.push([
        `"${item.kind || ""}"`,
        item.amount || 0,
        item.balance_after || 0,
        `"${item.ref_type || ""}"`,
        `"${item.note || ""}"`,
        `"${fmtDate(item.created_at)}"`
      ].join(","));
    });
    
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Wallet_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel/CSV downloaded");
  };

  const exportPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Pop-up blocker is preventing the PDF export. Please allow pop-ups.");

    const rowsHtml = filteredItems.map(item => {
      return `
        <tr>
          <td style="text-transform: capitalize;">${item.kind}</td>
          <td style="color: ${item.kind === 'debit' ? '#c53030' : '#2d6a4f'}; font-weight: bold;">
            ${item.kind === 'debit' ? '-' : '+'}${fmtMoney(item.amount)}
          </td>
          <td>${fmtMoney(item.balance_after)}</td>
          <td>${item.ref_type || "—"}</td>
          <td>${item.note || "—"}</td>
          <td>${fmtDate(item.created_at)}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Wallet Ledger Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #333; }
            h1 { color: #1b4332; font-size: 20px; margin-bottom: 2px; }
            p { color: #666; font-size: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #1b4332; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>MAK FIN PAY</h1>
          <p>Wallet Ledger Report · Generated on ${new Date().toLocaleDateString()} ${startDate || endDate ? `(Filtered: ${startDate || 'Any'} to ${endDate || 'Any'})` : ''}</p>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Balance After</th>
                <th>Reference</th>
                <th>Note</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet Ledger"
        subtitle="Immutable record of every wallet movement."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Filters */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Start Date"
                className="mfp-input text-xs bg-[#FDFCF8] border border-black/10 focus:border-[#1b4332] py-1.5 px-3 rounded-xl cursor-pointer w-32 h-[36px]"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="End Date"
                className="mfp-input text-xs bg-[#FDFCF8] border border-black/10 focus:border-[#1b4332] py-1.5 px-3 rounded-xl cursor-pointer w-32 h-[36px]"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="p-2 border border-black/10 hover:bg-neutral-50 rounded-xl transition-all"
                  title="Clear filters"
                >
                  <X className="h-4 w-4 text-neutral-500" />
                </button>
              )}
            </div>

            {/* Export Buttons */}
            <button
              onClick={exportPdf}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white h-[36px]"
            >
              <FileDown className="h-3.5 w-3.5" /> Export PDF
            </button>
            <button
              onClick={exportExcel}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white h-[36px]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
            </button>
          </div>
        }
      />
      <div className="mfp-card overflow-hidden bg-white shadow-md rounded-2xl">
        <DataTable
          columns={[
            { key: "kind", label: "Type", render: (r) => <span className="capitalize font-semibold">{r.kind}</span> },
            { key: "amount", label: "Amount", render: (r) => <span className={r.kind === "debit" ? "text-rose-700 font-extrabold" : "text-emerald-700 font-extrabold"}>{r.kind === "debit" ? "-" : "+"}{fmtMoney(r.amount)}</span> },
            { key: "balance_after", label: "Balance", render: (r) => fmtMoney(r.balance_after) },
            { key: "ref_type", label: "Reference", render: (r) => <span className="text-neutral-500 text-xs font-mono font-bold">{r.ref_type || "—"}</span> },
            { key: "note", label: "Note", render: (r) => <span className="text-neutral-600">{r.note || "—"}</span> },
            { key: "created_at", label: "Time", render: (r) => fmtDate(r.created_at) },
          ]}
          rows={paginatedItems}
          empty="No wallet entries found."
          pagination={{
            page,
            pageSize,
            total: filteredItems.length,
            onPageChange: setPage,
            onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          }}
        />
      </div>
    </div>
  );
}
