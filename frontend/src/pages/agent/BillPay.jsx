import React, { useEffect, useState, useMemo } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { CreditCard, Check, ChevronsUpDown, Wallet, Search, Loader2, AlertCircle, History, X, Clock, RotateCcw, ShieldCheck, FileDown, FileSpreadsheet } from "lucide-react";
import { useWebSocketListener } from "@/lib/ws";


function BankCombobox({ value, onChange, options = [] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => options.filter((b) => b.toLowerCase().includes(search.toLowerCase())),
    [search, options]
  );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mfp-input flex items-center justify-between text-left w-full"
        data-testid="bill-operator-trigger"
      >
        <span className={value ? "text-neutral-800" : "text-neutral-400"}>
          {value || "Select Bank / Operator"}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-neutral-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-2 w-full bg-white border border-black/10 rounded-xl shadow-xl overflow-hidden" data-testid="bill-operator-popover">
            <div className="px-3 py-2 border-b border-black/5 flex items-center gap-2">
              <Search className="h-4 w-4 text-neutral-400" />
              <input
                autoFocus
                placeholder="Search bank…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent outline-none text-sm w-full"
                data-testid="bill-operator-search"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-neutral-500">No banks match "{search}"</div>
              ) : filtered.map((b) => (
                <button
                  type="button"
                  key={b}
                  onClick={() => { onChange(b); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-[#1B4332]/5 ${b === value ? "bg-[#1B4332]/10 text-[#1B4332] font-medium" : "text-neutral-700"}`}
                  data-testid={`bill-operator-opt-${b}`}
                >
                  {b}
                  {b === value && <Check className="h-4 w-4 text-[#1B4332]" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AgentBillPay() {
  const [wallet, setWallet] = useState({ balance: 0 });
  const [f, setF] = useState({ customer_name: "", card_last4: "", operator: "", customer_phone: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [slabs, setSlabs] = useState([]);
  const [banks, setBanks] = useState([]);
  const [billPayEnabled, setBillPayEnabled] = useState(true);

  // History state
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [amtQuery, setAmtQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
    setPage(1);
  }, [statusFilter, q, amtQuery, startDate, endDate]);

  const stats = useMemo(() => {
    let successAmt = 0;
    let successCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;
    let reversedAmt = 0;
    let reversedCount = 0;

    historyItems.forEach((item) => {
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
  }, [historyItems]);

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

      const itemDate = item.created_at ? item.created_at.substring(0, 10) : "";
      const matchesStart = !startDate || itemDate >= startDate;
      const matchesEnd = !endDate || itemDate <= endDate;

      return matchesStatus && matchesSearch && matchesAmount && matchesStart && matchesEnd;
    });
  }, [historyItems, statusFilter, q, amtQuery, startDate, endDate]);

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
    link.setAttribute("download", `Bill_Transaction_History_${new Date().toISOString().split('T')[0]}.csv`);
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
          <title>Bill Transaction History Report</title>
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
          <p>Bill Transaction History Report · Generated on ${new Date().toLocaleDateString()}</p>
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

  useEffect(() => {
    api.get("/wallet").then((r) => setWallet(r.data));
    api.get("/billing/service-slabs").then((r) => setSlabs(r.data)).catch((e) => console.log("Failed to fetch slabs:", e.message));
    api.get("/billing/banks").then((r) => setBanks(r.data.map(b => b.name))).catch((e) => console.log("Failed to fetch banks:", e.message));
    fetchHistory();

    const fetchConfig = () => {
      api.get("/settings/recharge-limits-public")
        .then((r) => {
          setBillPayEnabled(r.data.bill_pay_enabled ?? true);
        })
        .catch((e) => console.log("Failed to fetch settings config:", e.message));
    };

    fetchConfig();
    const interval = setInterval(fetchConfig, 4000);
    return () => clearInterval(interval);
  }, []);

  const billAmt = Number(f.amount) || 0;

  const maxLimit = useMemo(() => {
    if (slabs.length === 0) return 100000;
    return Math.max(...slabs.map((s) => s.max_amount));
  }, [slabs]);

  const exceedsLimit = billAmt > maxLimit;

  const charge = useMemo(() => {
    if (billAmt <= 0) return 0;
    const match = slabs.find((s) => billAmt >= s.min_amount && billAmt <= s.max_amount);
    if (match) {
      return match.charge_type === "percent"
        ? +(billAmt * match.charge_amount / 100).toFixed(2)
        : match.charge_amount;
    }
    return billAmt <= 50000 ? 15 : 25;
  }, [billAmt, slabs]);

  const total = billAmt > 0 && !exceedsLimit ? billAmt + charge : 0;
  const hasAmount = billAmt > 0 && !exceedsLimit;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return; // primary defense — ignore rapid re-clicks
    if (!f.operator) return toast.error("Select a Bank / Operator");
    if (f.card_last4.length !== 4) return toast.error("Card last 4 digits required");
    if (!billAmt) return toast.error("Enter bill amount");
    if (exceedsLimit) return toast.error(`Maximum bill amount allowed is ₹${maxLimit.toLocaleString("en-IN")}`);
    if (wallet.balance < total) return toast.error("Insufficient wallet balance");
    setBusy(true);
    try {
      await api.post("/agent/bill-payments", { ...f, amount: billAmt });
      toast.success("Bill payment submitted — under admin review");
      setF({ customer_name: "", card_last4: "", operator: "", customer_phone: "", amount: "" });
      const w = await api.get("/wallet"); setWallet(w.data);
      window.dispatchEvent(new CustomEvent("ws:wallet_update"));
      fetchHistory();
      setTimeout(() => setBusy(false), 1500);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Credit Card Bill Payment" subtitle="A small service charge is added on top of every bill payment." />
      
      {!billPayEnabled ? (
        <div className="bg-white border border-black/5 rounded-3xl p-10 lg:p-16 shadow-lg shadow-indigo-500/5 flex flex-col items-center justify-center text-center space-y-5 max-w-[800px] mx-auto animate-fadeIn">
          <div className="bg-rose-50 text-rose-600 p-5 rounded-full border border-rose-200/50 animate-pulse">
            <AlertCircle className="h-12 w-12 stroke-1" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-neutral-800">Bill Payment Service Paused</h3>
            <p className="text-sm text-neutral-500 max-w-md leading-relaxed mx-auto">
              Credit Card Bill Payment service is temporarily disabled by the administrator. 
              Please check back later or contact support if you have any queries.
            </p>
          </div>
          <div className="text-[10px] text-neutral-400 font-mono bg-neutral-50 px-3 py-1.5 rounded-full border border-neutral-100">
            SERVICE_STATUS: PAUSED
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Form */}
          <div className="lg:col-span-8 mfp-card p-6">
            <form onSubmit={submit} className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <label className="mfp-label">Customer Owner Name</label>
                <input className="mfp-input bg-neutral-50/50" required value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} disabled={busy} data-testid="bill-name" />
              </div>
              <div>
                <label className="mfp-label">Card Last 4 Digits</label>
                <input className="mfp-input bg-neutral-50/50" required maxLength={4} value={f.card_last4} onChange={(e) => setF({ ...f, card_last4: e.target.value.replace(/\D/g, "") })} disabled={busy} data-testid="bill-card" />
              </div>
              <div>
                <label className="mfp-label">Bank / Operator</label>
                <BankCombobox value={f.operator} onChange={(v) => setF({ ...f, operator: v })} options={banks} />
              </div>
              <div>
                <label className="mfp-label">Customer Phone</label>
                <input className="mfp-input bg-neutral-50/50" required value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} disabled={busy} data-testid="bill-phone" />
              </div>
              <div>
                <label className="mfp-label">Bill Amount</label>
                <input
                  className={`mfp-input bg-neutral-50/50 ${exceedsLimit ? "border-rose-400 focus:border-rose-500" : ""}`}
                  type="number" min="1" max={maxLimit} step="0.01" required
                  value={f.amount}
                  onChange={(e) => setF({ ...f, amount: e.target.value })}
                  disabled={busy}
                  data-testid="bill-amount"
                />
                {exceedsLimit && (
                  <div className="mt-1 text-xs text-rose-600" data-testid="bill-amount-error">
                    Maximum bill amount allowed is ₹{maxLimit.toLocaleString("en-IN")}
                  </div>
                )}
              </div>
              <div className="flex items-end pb-0.5 w-full">
                <div className="flex items-center gap-3 w-full">
                  <button
                    disabled={busy || exceedsLimit}
                    className="mfp-btn-secondary flex-1 w-1/2 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 flex items-center justify-center gap-2 h-[38px] rounded-xl text-xs font-bold"
                    data-testid="bill-submit"
                  >
                    {busy
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                      : exceedsLimit
                        ? <><CreditCard className="h-4 w-4" /> Limit Exceeded</>
                        : hasAmount
                          ? <><CreditCard className="h-4 w-4" /> Pay {fmtMoney(total)}</>
                          : <><CreditCard className="h-4 w-4" /> Pay Bill</>
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => setF({ customer_name: "", card_last4: "", operator: "", customer_phone: "", amount: "" })}
                    disabled={busy}
                    className="flex-1 w-1/2 border border-black/10 hover:bg-neutral-50 text-neutral-600 h-[38px] rounded-xl text-xs font-bold transition-all flex items-center justify-center"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Wallet & Charges panel */}
          <aside className="lg:col-span-4 mfp-card p-6 bg-white">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
              <Wallet className="h-4 w-4" /> Available Wallet
            </div>
            <div className="mt-3 text-4xl font-medium tracking-tight text-[#1B4332]" data-testid="wallet-balance-billpay">
              {fmtMoney(wallet.balance)}
            </div>
            <div className="text-xs text-neutral-500 mt-1">Live balance — updates after each payment</div>

            <div className="my-6 border-t border-black/5" />

            <div className="mfp-overline">Service Charges</div>
            <div className="mt-3 rounded-xl border border-black/5 bg-[#F4F3ED] overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {slabs.length === 0 ? (
                    <>
                      <tr className="border-b border-black/5">
                        <td className="px-4 py-2.5 text-neutral-700">₹0 – ₹50,000</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#1B4332]">₹15</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 text-neutral-700">₹50,001 – ₹1,00,000</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#1B4332]">₹25</td>
                      </tr>
                    </>
                  ) : (
                    slabs.map((s, idx) => (
                      <tr key={s.id} className={idx < slabs.length - 1 ? "border-b border-black/5" : ""}>
                        <td className="px-4 py-2.5 text-neutral-700">
                          ₹{parseFloat(s.min_amount).toLocaleString("en-IN")} – ₹{parseFloat(s.max_amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#1B4332]">
                          {s.charge_type === "percent" ? `${s.charge_amount}%` : `₹${parseFloat(s.charge_amount).toFixed(2)}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {hasAmount && (
              <div className="mt-6 rounded-xl bg-[#1B4332] text-white p-5" data-testid="bill-breakdown">
                <div className="text-xs uppercase tracking-[0.2em] text-[#E8E5D7]">Breakdown</div>
                <div className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-[#E8E5D7]">Bill Amount</span><span className="font-medium text-white">{fmtMoney(billAmt)}</span></div>
                  <div className="flex justify-between"><span className="text-[#E8E5D7]">Service Charge</span><span className="font-medium text-white">{fmtMoney(charge)}</span></div>
                  <div className="border-t border-white/15 my-2" />
                  <div className="flex justify-between text-base">
                    <span className="text-white">Total Payable</span>
                    <span className="font-semibold text-[#FFE4C7]" data-testid="bill-total">{fmtMoney(total)}</span>
                  </div>
                </div>
                {wallet.balance < total && (
                  <div className="mt-3 text-xs text-rose-200 bg-rose-900/30 rounded-lg px-3 py-2">
                    Wallet short by {fmtMoney(total - wallet.balance)}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Bill Transaction History Section */}
      <div className="mt-12 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-black/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-800">Bill Transaction History</h3>
              <p className="text-xs text-neutral-400">All bill payments performed by you. Pending payments are under admin review.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportHistoryPdf}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white"
            >
              <FileDown className="h-3.5 w-3.5" /> Export PDF
            </button>
            <button
              onClick={exportHistoryExcel}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
            </button>
          </div>
        </div>

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
              {(q || statusFilter !== "all" || amtQuery !== "" || startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setQ(""); setStatusFilter("all"); setAmtQuery(""); setStartDate(""); setEndDate(""); }}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                  title="Clear all filters"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Start Date */}
            <div className="w-full sm:w-auto">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Start Date"
                className="mfp-input text-xs bg-white border border-black/10 focus:border-[#1b4332] py-2 px-3 rounded-xl cursor-pointer w-full sm:w-36 h-[38px]"
              />
            </div>

            {/* End Date */}
            <div className="w-full sm:w-auto">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="End Date"
                className="mfp-input text-xs bg-white border border-black/10 focus:border-[#1b4332] py-2 px-3 rounded-xl cursor-pointer w-full sm:w-36 h-[38px]"
              />
            </div>

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
