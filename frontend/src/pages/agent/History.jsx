import React, { useEffect, useState, useMemo } from "react";
import { api, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { Search, X, CreditCard, Clock, RotateCcw, ShieldCheck } from "lucide-react";

const STATUS_TABS = [
  { key: "all", label: "All Status" },
  { key: "pending", label: "Pending" },
  { key: "success", label: "Success" },
  { key: "reversed", label: "Reversed" },
];

export default function AgentHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [amtQuery, setAmtQuery] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchHistory = () => {
    setLoading(true);
    api.get("/agent/transactions")
      .then((r) => setItems(r.data))
      .catch((e) => console.log("Failed to fetch transactions:", e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, q, amtQuery]);

  // Client-side stats calculation
  const stats = useMemo(() => {
    let successAmt = 0;
    let successCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;
    let reversedAmt = 0;
    let reversedCount = 0;

    items.forEach((item) => {
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
  }, [items]);

  // Client-side filter
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
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

      return matchesStatus && matchesSearch && matchesAmount;
    });
  }, [items, statusFilter, q, amtQuery]);

  // Client-side paginate
  const paginatedItems = useMemo(() => {
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize;
    return filteredItems.slice(fromIdx, toIdx);
  }, [filteredItems, page, pageSize]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaction History"
        subtitle="All bill payments performed by you. Pending payments are under admin review."
      />

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
        <div className="flex flex-col lg:flex-row gap-4 items-end lg:items-center">
          <div className="relative flex-1 w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by Customer, Bank, Card Last 4, Phone..."
              className="mfp-input !pl-11 !pr-10 bg-neutral-50/50"
            />
            {(q || statusFilter !== "all" || amtQuery !== "") && (
              <button
                type="button"
                onClick={() => { setQ(""); setStatusFilter("all"); setAmtQuery(""); }}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                title="Clear all filters"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mfp-input bg-[#FDFCF8] text-xs font-bold rounded-xl py-2.5 px-4 outline-none cursor-pointer border border-black/10 focus:border-[#1b4332] w-full lg:w-44"
            >
              {STATUS_TABS.map((tab) => (
                <option key={tab.key} value={tab.key}>
                  {tab.label}
                </option>
              ))}
            </select>

            {/* Bill Amount Search Input */}
            <div className="relative w-full lg:w-44">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Search className="h-3 w-3 text-neutral-400" />
              </span>
              <input
                type="text"
                value={amtQuery}
                onChange={(e) => setAmtQuery(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Search Amount ₹"
                className="mfp-input !pl-9 text-xs bg-neutral-50/50"
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
      </div>

      {/* Transactions Data Table */}
      <div className="mfp-card overflow-hidden bg-white shadow-md rounded-2xl">
        <DataTable
          columns={[
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
              key: "created_at",
              label: "Date",
              render: (r) => (
                <span className="text-xs text-neutral-500 font-semibold">
                  {fmtDate(r.created_at)}
                </span>
              ),
            },
          ]}
          rows={paginatedItems}
          empty={loading ? "Loading transactions…" : "No transactions found"}
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
  );
}
