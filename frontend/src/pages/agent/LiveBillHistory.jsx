import React, { useEffect, useState, useMemo } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import BharatConnectLogo from "@/components/BharatConnectLogo";
import { Search, X, Receipt, Clock, RotateCcw, ShieldCheck, History, HelpCircle } from "lucide-react";

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
        <div className="bg-gradient-to-br from-[#58181F] to-[#DC3545] text-white border border-red-500/20 rounded-2xl p-3.5 shadow-md flex items-center gap-3.5 h-[84px] relative overflow-hidden transition-all hover:shadow-lg animate-fadeIn">
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
