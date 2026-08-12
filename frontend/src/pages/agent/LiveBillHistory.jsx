import React, { useEffect, useState, useMemo } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import BharatConnectLogo from "@/components/BharatConnectLogo";
import { toast } from "sonner";
import { Search, X, Receipt, Clock, RotateCcw, ShieldCheck, History, HelpCircle, FileDown, FileSpreadsheet } from "lucide-react";

const STATUS_TABS = [
  { key: "all", label: "All Status" },
  { key: "pending", label: "Pending" },
  { key: "success", label: "Success" },
  { key: "reversed", label: "Reversed" },
];

const getShortTxnId = (id) => {
  if (!id) return "—";
  if (id.startsWith("Txn")) return id;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const padded = String(hash).padStart(10, "0");
  return `Txn${padded}`;
};

function isItemInRange(createdAtIso, rangeType, customStart, customEnd) {
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

export default function LiveBillHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [amtQuery, setAmtQuery] = useState("");
  const [rangeType, setRangeType] = useState("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchHistory = () => {
    setLoading(true);
    api.get("/agent/live-billpay/transactions")
      .then((r) => setItems(r.data || []))
      .catch((e) => console.log("Failed to fetch live bill transactions:", e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, q, amtQuery, rangeType, startDate, endDate]);

  // filter
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "reversed" ? (item.status === "reversed" || item.status === "failed" || item.status === "rejected") : item.status === statusFilter);
      
      const term = q.toLowerCase().trim();
      const matchesSearch =
        !term ||
        (item.customer_name || "").toLowerCase().includes(term) ||
        (item.operator || "").toLowerCase().includes(term) ||
        (item.customer_phone || "").toLowerCase().includes(term);

      const itemAmt = item.amount ?? 0;
      const matchesAmount = !amtQuery.trim() || String(itemAmt).includes(amtQuery.trim());

      const matchesDate = isItemInRange(item.created_at, rangeType, startDate, endDate);

      return matchesStatus && matchesSearch && matchesAmount && matchesDate;
    });
  }, [items, statusFilter, q, amtQuery, rangeType, startDate, endDate]);

  // stats
  const stats = useMemo(() => {
    let successAmt = 0;
    let successCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;
    let reversedAmt = 0;
    let reversedCount = 0;

    filteredItems.forEach((item) => {
      const amt = item.amount ?? 0;
      if (item.status === "success") {
        successAmt += amt;
        successCount++;
      } else if (item.status === "pending") {
        pendingAmt += amt;
        pendingCount++;
      } else if (item.status === "reversed" || item.status === "failed") {
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
      ["Tx ID", "Biller Name / ID", "Mobile Number", "Bill Amount", "Charges", "Total Deducted", "Status", "Date & Time"]
    ];
    filteredItems.forEach((item) => {
      const shortId = getShortTxnId(item.id);
      const billerName = item.biller_name || item.operator || item.biller_id || "—";
      const mobile = item.customer_phone || item.mobile_number || "—";
      const billAmt = item.bill_amount ?? item.amount ?? 0;
      const chargeAmt = item.service_charge ?? item.charges ?? 0;
      const totalAmt = item.total_amount ?? item.amount ?? 0;
      csvRows.push([
        `"${shortId}"`,
        `"${billerName}"`,
        `"${mobile}"`,
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
    link.setAttribute("download", `Live_Bill_History_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel/CSV downloaded");
  };

  const exportHistoryPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Pop-up blocker is preventing the PDF export. Please allow pop-ups.");

    const rowsHtml = filteredItems.map(item => {
      const shortId = getShortTxnId(item.id);
      const billerName = item.biller_name || item.operator || item.biller_id || "—";
      const mobile = item.customer_phone || item.mobile_number || "—";
      const billAmt = item.bill_amount ?? item.amount ?? 0;
      const chargeAmt = item.service_charge ?? item.charges ?? 0;
      const totalAmt = item.total_amount ?? item.amount ?? 0;
      return `
        <tr>
          <td>${shortId}</td>
          <td>${billerName}</td>
          <td>${mobile}</td>
          <td>${fmtMoney(billAmt)}</td>
          <td>${fmtMoney(chargeAmt)}</td>
          <td>${fmtMoney(totalAmt)}</td>
          <td class="status-${item.status}">${(item.status || "").toUpperCase()}</td>
          <td>${fmtDate(item.created_at)}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Live Bill History Report</title>
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
            .status-failed { color: #c53030; font-weight: bold; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>MAK FIN PAY</h1>
          <p>Live Bill History Report · Generated on ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Tx ID</th>
                <th>Biller Name / ID</th>
                <th>Mobile Number</th>
                <th>Bill Amount</th>
                <th>Service Charge</th>
                <th>Total Deducted</th>
                <th>Status</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <br/>
          <button onclick="window.print()" style="padding: 8px 16px; background: #1b4332; color: white; border: none; border-radius: 4px; cursor: pointer;">Print / Save PDF</button>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // paginate
  const paginatedItems = useMemo(() => {
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize;
    return filteredItems.slice(fromIdx, toIdx);
  }, [filteredItems, page, pageSize]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Live Bill History"
        subtitle="Dedicated overview of all your utility, gas, electricity, and other live bill payments."
        actions={<BharatConnectLogo iconClassName="h-9 w-9" />}
      />

      {/* Metrics statistics cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Success */}
        <div className="bg-gradient-to-br from-[#0F5132] to-[#198754] text-white border border-emerald-500/20 rounded-2xl p-3.5 shadow-md flex items-center gap-3.5 h-[84px] relative overflow-hidden transition-all hover:shadow-lg animate-fadeIn">
          <div className="p-2.5 bg-white/10 text-emerald-300 border border-white/10 rounded-xl shrink-0">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] text-emerald-100/80 font-bold tracking-wider uppercase block truncate">
              Successful Payments ({stats.successCount} tx)
            </span>
            <span className="text-base font-black text-white mt-0.5 block truncate">
              {fmtMoney(stats.successAmt)}
            </span>
          </div>
        </div>

        {/* Pending */}
        <div className="bg-gradient-to-br from-[#664D03] to-[#FD7E14] text-white border border-orange-500/20 rounded-2xl p-3.5 shadow-md flex items-center gap-3.5 h-[84px] relative overflow-hidden transition-all hover:shadow-lg animate-fadeIn">
          <div className="p-2.5 bg-white/10 text-orange-300 border border-white/10 rounded-xl shrink-0">
            <Clock className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] text-orange-100/80 font-bold tracking-wider uppercase block truncate">
              Pending Review ({stats.pendingCount} tx)
            </span>
            <span className="text-base font-black text-white mt-0.5 block truncate">
              {fmtMoney(stats.pendingAmt)}
            </span>
          </div>
        </div>

        {/* Reversed */}
        <div className="bg-gradient-to-br from-[#842029] to-[#DC3545] text-white border border-red-500/20 rounded-2xl p-3.5 shadow-md flex items-center gap-3.5 h-[84px] relative overflow-hidden transition-all hover:shadow-lg animate-fadeIn">
          <div className="p-2.5 bg-white/10 text-red-300 border border-white/10 rounded-xl shrink-0">
            <RotateCcw className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] text-red-100/80 font-bold tracking-wider uppercase block truncate">
              Reversed & Failed ({stats.reversedCount} tx)
            </span>
            <span className="text-base font-black text-white mt-0.5 block truncate">
              {fmtMoney(stats.reversedAmt)}
            </span>
          </div>
        </div>
      </div>

      {/* Search filters */}
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
              placeholder="Search by Customer, Biller ID, Phone..."
              className="mfp-input !pl-11 !pr-10 bg-neutral-50/50"
            />
            {(q || statusFilter !== "all" || amtQuery !== "" || rangeType !== "today" || startDate || endDate) && (
              <button
                type="button"
                onClick={() => { setQ(""); setStatusFilter("all"); setAmtQuery(""); setRangeType("today"); setStartDate(""); setEndDate(""); }}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-indigo-600"
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
              className="mfp-input text-xs bg-white border border-black/10 focus:border-[#1b4332] py-2 px-3 rounded-xl cursor-pointer w-full sm:w-36 h-[38px] appearance-none"
            >
              {STATUS_TABS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Search */}
          <div className="w-full sm:w-auto">
            <input
              value={amtQuery}
              onChange={(e) => setAmtQuery(e.target.value)}
              placeholder="Search Amount"
              className="mfp-input text-xs bg-white border border-black/10 focus:border-[#1b4332] py-2 px-3 rounded-xl w-full sm:w-36 h-[38px]"
            />
          </div>

          {/* Export PDF & Export Excel Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={exportHistoryPdf}
              className="py-2 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white shadow-xs h-[38px] cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5" /> Export PDF
            </button>
            <button
              onClick={exportHistoryExcel}
              className="py-2 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white shadow-xs h-[38px] cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
            </button>
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          loading={loading}
          className="min-w-[1300px]"
          columns={[
            {
              key: "created_at",
              label: "Date & Time",
              render: (r) => <span className="text-neutral-500 text-[11px] whitespace-nowrap">{fmtDate(r.created_at)}</span>
            },
            {
              key: "id",
              label: "Tx ID",
              render: (r) => (
                <span 
                  className="bg-neutral-100 text-neutral-800 font-bold font-mono text-[11px] px-2.5 py-1 rounded-md uppercase select-all tracking-wider border border-neutral-200/80 cursor-pointer hover:bg-neutral-200 transition-colors whitespace-nowrap"
                  title={`Original ID: ${r.id}`}
                >
                  {getShortTxnId(r.id)}
                </span>
              )
            },
            {
              key: "operator",
              label: "Biller Name / ID",
              render: (r) => (
                <span className="font-semibold text-neutral-700 whitespace-nowrap">
                  {r.operator}
                </span>
              )
            },
            {
              key: "customer_phone",
              label: "Mobile Number",
              render: (r) => (
                <span className="font-mono text-neutral-600">
                  {r.customer_phone}
                </span>
              )
            },
            {
              key: "card_last4",
              label: "Card Number",
              render: (r) => (
                <span className="font-mono font-semibold text-neutral-700">
                  {r.card_last4 || "—"}
                </span>
              )
            },
            {
              key: "bill_amount",
              label: "Bill Amt",
              render: (r) => <span className="font-semibold text-neutral-800 tabular-nums">{fmtMoney(r.bill_amount)}</span>
            },
            {
              key: "service_charge",
              label: "Charges",
              render: (r) => <span className="text-neutral-500 tabular-nums">{fmtMoney(r.service_charge)}</span>
            },
            {
              key: "amount",
              label: "Total Deducted",
              render: (r) => (
                <span className="font-bold text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded border border-emerald-100/80 tabular-nums">
                  {fmtMoney(r.amount)}
                </span>
              )
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <StatusBadge status={r.status} />
            },
            { 
              key: "reason", 
              label: "Reason", 
              render: (r, { isExpanded, toggleExpand }) => {
                const isRejected = r.status === "reversed" || r.status === "rejected" || r.status === "failed";
                const note = r.note || r.rejection_reason || r.reason;
                if (isRejected && note) {
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
            }
          ]}
          rows={paginatedItems}
          empty="No live bill history transactions found."
          pagination={{
            page,
            pageSize,
            total: filteredItems.length,
            onPageChange: setPage,
            onPageSizeChange: (n) => { setPageSize(n); setPage(1); }
          }}
        />
      </div>
    </div>
  );
}
