import React, { useEffect, useState, useMemo } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { CreditCard, Search, History, X, Clock, RotateCcw, ShieldCheck, FileDown, FileSpreadsheet, HelpCircle } from "lucide-react";
import { useWebSocketListener } from "@/lib/ws";

export function isItemInRange(createdAtIso, rangeType, customStart, customEnd) {
  if (!createdAtIso) return false;
  if (rangeType === "all") return true;

  const itemDate = new Date(createdAtIso);
  const now = new Date();
  
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (rangeType === "today") {
    return itemDate >= todayStart && itemDate <= todayEnd;
  }
  if (rangeType === "yesterday") {
    const yestStart = new Date(todayStart);
    yestStart.setDate(yestStart.getDate() - 1);
    const yestEnd = new Date(todayEnd);
    yestEnd.setDate(yestEnd.getDate() - 1);
    return itemDate >= yestStart && itemDate <= yestEnd;
  }
  if (rangeType === "last_7_days") {
    const start7 = new Date(todayStart);
    start7.setDate(start7.getDate() - 6);
    return itemDate >= start7 && itemDate <= todayEnd;
  }
  if (rangeType === "last_30_days") {
    const start30 = new Date(todayStart);
    start30.setDate(start30.getDate() - 29);
    return itemDate >= start30 && itemDate <= todayEnd;
  }
  if (rangeType === "this_month") {
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return itemDate >= startMonth && itemDate <= todayEnd;
  }
  if (rangeType === "custom") {
    const itemDateYmd = createdAtIso.substring(0, 10);
    const matchesStart = !customStart || itemDateYmd >= customStart;
    const matchesEnd = !customEnd || itemDateYmd <= customEnd;
    return matchesStart && matchesEnd;
  }
  return true;
}

export default function AgentCcBillHistory() {
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [amtQuery, setAmtQuery] = useState("");
  const [rangeType, setRangeType] = useState("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchHistory = (silent = false) => {
    if (!silent) setLoadingHistory(true);
    api.get("/agent/transactions")
      .then((r) => setHistoryItems(r.data || []))
      .catch((e) => console.log("Failed to fetch transactions:", e.message))
      .finally(() => setLoadingHistory(false));
  };

  useWebSocketListener("cc_bill_updated", () => {
    fetchHistory(true);
  });

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, q, amtQuery, rangeType, startDate, endDate]);

  const filteredItems = useMemo(() => {
    return historyItems.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const term = q.toLowerCase().trim();
      const matchesSearch =
        !term ||
        (item.customer_name || "").toLowerCase().includes(term) ||
        (item.operator || "").toLowerCase().includes(term) ||
        (item.card_last4 || "").toLowerCase().includes(term) ||
        (item.customer_phone || "").toLowerCase().includes(term);

      const itemAmt = item.bill_amount ?? item.amount ?? 0;
      const matchesAmount = !amtQuery.trim() || String(itemAmt).includes(amtQuery.trim());

      const matchesDate = isItemInRange(item.created_at, rangeType, startDate, endDate);

      return matchesStatus && matchesSearch && matchesAmount && matchesDate;
    });
  }, [historyItems, statusFilter, q, amtQuery, rangeType, startDate, endDate]);

  const stats = useMemo(() => {
    let successAmt = 0;
    let successCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;
    let reversedAmt = 0;
    let reversedCount = 0;

    filteredItems.forEach((item) => {
      const amt = item.total_amount ?? item.amount ?? 0;
      if (item.status === "success") {
        successAmt += amt;
        successCount++;
      } else if (item.status === "pending") {
        pendingAmt += amt;
        pendingCount++;
      } else if (item.status === "reversed") {
        reversedAmt += amt;
        reversedCount++;
      }
    });

    return {
      successAmt,
      successCount,
      pendingAmt,
      pendingCount,
      reversedAmt,
      reversedCount,
    };
  }, [filteredItems]);

  const exportHistoryExcel = () => {
    const csvRows = [
      ["Customer Name", "Bank / Operator", "Card Last 4", "Bill Amount", "Service Charge", "Total Deducted", "Status", "Date"]
    ];
    filteredItems.forEach((item) => {
      const billAmt = item.bill_amount ?? item.amount ?? 0;
      const chargeAmt = item.service_charge ?? 0;
      const totalAmt = item.total_amount ?? item.amount ?? 0;
      csvRows.push([
        `"${item.customer_name || ""}"`,
        `"${item.operator || ""}"`,
        `"${item.card_last4 ? `XXXX ${item.card_last4}` : "—"}"`,
        billAmt,
        chargeAmt,
        totalAmt,
        `"${item.status}"`,
        `"${fmtDate(item.created_at)}"`
      ].join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CC_Bill_History_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel/CSV downloaded");
  };

  const exportHistoryPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Pop-up blocker is preventing the PDF export. Please allow pop-ups.");

    const rowsHtml = filteredItems.map(item => {
      const billAmt = item.bill_amount ?? item.amount ?? 0;
      const chargeAmt = item.service_charge ?? 0;
      const totalAmt = item.total_amount ?? item.amount ?? 0;
      return `
        <tr>
          <td>${item.customer_name}</td>
          <td>${item.operator}</td>
          <td>${item.card_last4 ? `XXXX ${item.card_last4}` : "—"}</td>
          <td>${fmtMoney(billAmt)}</td>
          <td>${fmtMoney(chargeAmt)}</td>
          <td>${fmtMoney(totalAmt)}</td>
          <td class="status-${item.status}">${item.status.toUpperCase()}</td>
          <td>${fmtDate(item.created_at)}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>CC Bill History Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #333; }
            h1 { color: #1b4332; font-size: 20px; margin-bottom: 2px; }
            p { color: #666; font-size: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #1b4332; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .status-success { color: #2d6a4f; font-weight: bold; }
            .status-pending { color: #b7791f; font-weight: bold; }
            .status-reversed { color: #c53030; font-weight: bold; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>MAK FIN PAY</h1>
          <p>CC Bill History Report · Generated on ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Bank / Operator</th>
                <th>Card</th>
                <th>Bill Amount</th>
                <th>Service Charge</th>
                <th>Total Deducted</th>
                <th>Status</th>
                <th>Created</th>
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

  const paginatedHistory = useMemo(() => {
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize;
    return filteredItems.slice(fromIdx, toIdx);
  }, [filteredItems, page, pageSize]);

  return (
    <div>
      <PageHeader
        title="CC Bill History"
        subtitle="All credit card bill payments performed by you. Pending payments are under admin review."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={exportHistoryPdf}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white shadow-xs"
            >
              <FileDown className="h-3.5 w-3.5" /> Export PDF
            </button>
            <button
              onClick={exportHistoryExcel}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white shadow-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
            </button>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Metrics Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Success */}
          <div className="mfp-card p-6 border-l-4 border-emerald-500 flex items-center justify-between shadow-sm bg-white">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Successful Payments</div>
              <div className="text-2xl font-black text-neutral-800">{fmtMoney(stats.successAmt)}</div>
              <div className="text-[11px] font-medium text-emerald-600">{stats.successCount} transactions</div>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>

          {/* Pending */}
          <div className="mfp-card p-6 border-l-4 border-amber-500 flex items-center justify-between shadow-sm bg-white">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Pending Review</div>
              <div className="text-2xl font-black text-neutral-800">{fmtMoney(stats.pendingAmt)}</div>
              <div className="text-[11px] font-medium text-amber-600">{stats.pendingCount} transactions</div>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <Clock className="h-6 w-6" />
            </div>
          </div>

          {/* Reversed */}
          <div className="mfp-card p-6 border-l-4 border-rose-500 flex items-center justify-between shadow-sm bg-white">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Reversed & Refunded</div>
              <div className="text-2xl font-black text-neutral-800">{fmtMoney(stats.reversedAmt)}</div>
              <div className="text-[11px] font-medium text-rose-600">{stats.reversedCount} transactions</div>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
              <RotateCcw className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Search and Filters Tab */}
        <div className="mfp-card p-5 space-y-4 bg-white">
          <div className="flex flex-wrap items-end lg:items-center gap-4">
            {/* Main search text input */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Search className="h-4 w-4 text-neutral-400" />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by Customer, Bank, Card, Phone..."
                className="mfp-input !pl-11 !pr-10 bg-neutral-50/50"
              />
              {(q || statusFilter !== "all" || amtQuery !== "" || rangeType !== "today" || startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setQ(""); setStatusFilter("all"); setAmtQuery(""); setRangeType("today"); setStartDate(""); setEndDate(""); }}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                  title="Clear all filters"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Date Range Dropdown */}
            <div className="w-full sm:w-auto">
              <select
                value={rangeType}
                onChange={(e) => setRangeType(e.target.value)}
                className="mfp-input bg-white text-xs font-bold rounded-xl py-2 px-3 outline-none cursor-pointer border border-black/10 focus:border-[#1b4332] w-full sm:w-36 h-[38px]"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last_7_days">Last 7 Days</option>
                <option value="last_30_days">Last 30 Days</option>
                <option value="this_month">This Month</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Date</option>
              </select>
            </div>

            {/* Custom Date Inputs */}
            {rangeType === "custom" && (
              <div className="flex items-center gap-2 w-full sm:w-auto animate-fadeIn">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  placeholder="Start Date"
                  className="mfp-input text-xs bg-white border border-black/10 focus:border-[#1b4332] py-2 px-3 rounded-xl cursor-pointer w-full sm:w-36 h-[38px]"
                />
                <span className="text-xs text-neutral-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="End Date"
                  className="mfp-input text-xs bg-white border border-black/10 focus:border-[#1b4332] py-2 px-3 rounded-xl cursor-pointer w-full sm:w-36 h-[38px]"
                />
              </div>
            )}

            {/* Status Dropdown */}
            <div className="w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mfp-input bg-white text-xs font-bold rounded-xl py-2 px-3 outline-none cursor-pointer border border-black/10 focus:border-[#1b4332] w-full sm:w-36 h-[38px]"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="success">Success</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>

            {/* Bill Amount Search Input */}
            <div className="relative w-full sm:w-auto">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-3 w-3 text-neutral-400" />
              </span>
              <input
                type="text"
                value={amtQuery}
                onChange={(e) => setAmtQuery(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Search Amount ₹"
                className="mfp-input !pl-8 text-xs bg-neutral-50/50 w-full sm:w-36 h-[38px]"
              />
              {amtQuery && (
                <button
                  type="button"
                  onClick={() => setAmtQuery("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Transactions Data Table */}
        <div className="mfp-card overflow-hidden bg-white shadow-md rounded-2xl">
          <DataTable
            columns={[
              {
                key: "created_at",
                label: "Date",
                render: (r) => (
                  <span className="text-xs text-neutral-500 font-semibold">
                    {fmtDate(r.created_at)}
                  </span>
                ),
              },
              {
                key: "customer_name",
                label: "Customer",
                render: (r) => (
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-[#1B4332]/5 text-[#1B4332] font-black text-xs flex items-center justify-center border border-[#1B4332]/10 flex-shrink-0">
                      {(r.customer_name || "?")[0].toUpperCase()}
                    </div>
                    <span className="font-semibold text-neutral-800 text-xs capitalize">{r.customer_name}</span>
                  </div>
                ),
              },
              {
                key: "operator",
                label: "Bank",
                render: (r) => (
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-neutral-100 text-neutral-500 rounded">
                      <CreditCard className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-semibold text-xs text-neutral-700">{r.operator}</span>
                  </div>
                ),
              },
              {
                key: "card_last4",
                label: "Card",
                render: (r) => (
                  <div className="font-mono text-neutral-500 text-xs flex items-center gap-1 font-bold">
                    <span className="text-[10px] text-neutral-300">••••</span>
                    <span>{r.card_last4}</span>
                  </div>
                ),
              },
              {
                key: "bill_amount",
                label: "Bill Amount",
                render: (r) => (
                  <span className="font-extrabold text-neutral-700 text-xs">
                    {fmtMoney(r.bill_amount ?? r.amount)}
                  </span>
                ),
              },
              {
                key: "service_charge",
                label: "Service Charge",
                render: (r) => (
                  <span className="font-semibold text-xs text-neutral-400">
                    {r.service_charge != null ? fmtMoney(r.service_charge) : "—"}
                  </span>
                ),
              },
              {
                key: "total_amount",
                label: "Total Deducted",
                render: (r) => (
                  <span className="font-black text-[#1B4332] text-xs">
                    {fmtMoney(r.total_amount ?? r.amount)}
                  </span>
                ),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => (
                  <div className="flex flex-col items-start gap-0.5">
                    <StatusBadge status={r.status} />
                    {r.status === "pending" && (
                      <span className="text-[9px] font-extrabold text-amber-600 tracking-wide uppercase">
                        Under Review
                      </span>
                    )}
                    {r.status === "success" && (
                      <span className="text-[9px] font-extrabold text-emerald-600 tracking-wide uppercase">
                        Paid successfully
                      </span>
                    )}
                    {r.status === "reversed" && (
                      <span className="text-[9px] font-extrabold text-rose-600 tracking-wide uppercase">
                        Refunded to Wallet
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: "reason",
                label: "Reason",
                render: (r, { isExpanded, toggleExpand }) => {
                  const isRejected = r.status === "reversed" || r.status === "rejected" || r.status === "failed";
                  const note = r.note || r.rejection_reason || r.reason;
                  if (isRejected || note) {
                    return (
                      <button
                        type="button"
                        onClick={toggleExpand}
                        className={`px-2 py-1 text-xs font-bold rounded-lg border transition-all inline-flex items-center gap-1 cursor-pointer ${
                          isExpanded
                            ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                            : "bg-rose-50 text-rose-700 border-rose-200/80 hover:bg-rose-100/80 hover:border-rose-300"
                        }`}
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        {isExpanded ? "Hide Reason" : "View Reason"}
                      </button>
                    );
                  }
                  return <span className="text-neutral-400 font-medium">—</span>;
                }
              },
            ]}
            rows={paginatedHistory}
            empty={loadingHistory ? "Loading transactions…" : "No transactions found"}
            pagination={{
              page,
              pageSize,
              total: filteredItems.length,
              onPageChange: setPage,
              onPageSizeChange: (n) => {
                setPageSize(n);
                setPage(1);
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
