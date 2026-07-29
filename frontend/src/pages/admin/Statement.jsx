import React, { useState, useEffect, useCallback } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { PageHeader, DataTable } from "@/components/Shared";
import { toast } from "sonner";
import { Plus, Loader2, ArrowUpRight, ArrowDownLeft, Landmark, Coins, TrendingUp } from "lucide-react";

export default function AdminStatement() {
  const [activeTab, setActiveTab] = useState("system"); // system | profit | cashbook
  const [loading, setLoading] = useState(false);

  // System ledger states
  const [systemItems, setSystemItems] = useState([]);
  const [systemTotal, setSystemTotal] = useState(0);
  const [systemPage, setSystemPage] = useState(1);
  const [systemPageSize] = useState(50);

  // Profit & Cashbook states
  const [profitItems, setProfitItems] = useState([]);
  const [cashbookItems, setCashbookItems] = useState([]);

  // Balance states
  const [profitBalance, setProfitBalance] = useState(0);
  const [cashbookBalance, setCashbookBalance] = useState(0);

  // Modal states
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustType, setAdjustType] = useState("credit"); // credit | debit
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  const fetchSystemLedger = useCallback(() => {
    setLoading(true);
    api.get("/admin/system-ledger", { params: { page: systemPage, page_size: systemPageSize } })
      .then((res) => {
        setSystemItems(res.data.items || []);
        setSystemTotal(res.data.total || 0);
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load system ledger"))
      .finally(() => setLoading(false));
  }, [systemPage, systemPageSize]);

  const fetchProfitLedger = useCallback(() => {
    setLoading(true);
    api.get("/admin/profit-ledger")
      .then((res) => {
        const items = res.data || [];
        setProfitItems(items);
        if (items.length > 0) {
          setProfitBalance(items[0].balance_after || 0);
        } else {
          setProfitBalance(0);
        }
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load profit ledger"))
      .finally(() => setLoading(false));
  }, []);

  const fetchCashbook = useCallback(() => {
    setLoading(true);
    api.get("/admin/cashbook")
      .then((res) => {
        const items = res.data || [];
        setCashbookItems(items);
        if (items.length > 0) {
          setCashbookBalance(items[0].balance_after || 0);
        } else {
          setCashbookBalance(0);
        }
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load cashbook"))
      .finally(() => setLoading(false));
  }, []);

  const reloadActive = useCallback(() => {
    if (activeTab === "system") fetchSystemLedger();
    else if (activeTab === "profit") fetchProfitLedger();
    else if (activeTab === "cashbook") fetchCashbook();
  }, [activeTab, fetchSystemLedger, fetchProfitLedger, fetchCashbook]);

  useEffect(() => {
    reloadActive();
  }, [reloadActive]);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustAmount || parseFloat(adjustAmount) <= 0) {
      return toast.error("Please enter a valid amount");
    }
    if (!adjustNote.trim()) {
      return toast.error("Please enter a description for the adjustment");
    }

    setSubmittingAdjust(true);
    const endpoint = activeTab === "profit" ? "/admin/profit-ledger/adjust" : "/admin/cashbook/adjust";
    try {
      await api.post(endpoint, {
        type: adjustType,
        amount: parseFloat(adjustAmount),
        note: adjustNote.trim(),
      });
      toast.success("Adjustment logged successfully");
      setShowAdjustModal(false);
      setAdjustAmount("");
      setAdjustNote("");
      reloadActive();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to record adjustment");
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const getSystemColumns = () => [
    {
      key: "created_at",
      label: "Date & Time",
      render: (r) => <span className="text-neutral-500 font-semibold">{fmtDate(r.created_at)}</span>,
    },
    {
      key: "user_name",
      label: "Member Details",
      render: (r) => (
        <div className="leading-tight">
          <div className="font-bold text-neutral-800">{r.user_name || "System"}</div>
          <div className="text-[10px] text-neutral-400 font-medium lowercase">{r.user_email || "N/A"}</div>
        </div>
      ),
    },
    {
      key: "user_role",
      label: "Role",
      render: (r) => (
        <span className="capitalize text-xs font-bold text-neutral-600 bg-neutral-100 border px-2 py-0.5 rounded-md">
          {(r.user_role || "system").replace("_", " ")}
        </span>
      ),
    },
    {
      key: "kind",
      label: "Type",
      render: (r) => {
        const isCredit = r.kind === "credit" || r.kind === "refund";
        return (
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
              isCredit
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-rose-50 text-rose-700 border border-rose-100"
            }`}
          >
            {isCredit ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            ) : (
              <ArrowDownLeft className="h-3 w-3 text-rose-500" />
            )}
            {r.kind.toUpperCase()}
          </span>
        );
      },
    },
    {
      key: "amount",
      label: "Amount",
      render: (r) => (
        <span className={`font-bold ${r.kind === "credit" || r.kind === "refund" ? "text-emerald-700" : "text-rose-700"}`}>
          {fmtMoney(r.amount)}
        </span>
      ),
    },
    {
      key: "balance_after",
      label: "Closing Balance",
      render: (r) => <span className="font-bold text-neutral-800">{fmtMoney(r.balance_after)}</span>,
    },
    {
      key: "note",
      label: "Particulars / Reference",
      render: (r) => (
        <div className="leading-snug max-w-xs">
          <div className="font-semibold text-neutral-800 text-xs">{r.note}</div>
          {r.ref_type && (
            <div className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">
              {r.ref_type} : {r.ref_id}
            </div>
          )}
        </div>
      ),
    },
  ];

  const getProfitColumns = () => [
    {
      key: "created_at",
      label: "Date & Time",
      render: (r) => <span className="text-neutral-500 font-semibold">{fmtDate(r.created_at)}</span>,
    },
    {
      key: "type",
      label: "Type",
      render: (r) => {
        const isCredit = r.type === "credit";
        return (
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
              isCredit
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-rose-50 text-rose-700 border border-rose-100"
            }`}
          >
            {isCredit ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            ) : (
              <ArrowDownLeft className="h-3 w-3 text-rose-500" />
            )}
            {r.type.toUpperCase()}
          </span>
        );
      },
    },
    {
      key: "amount",
      label: "Amount",
      render: (r) => (
        <span className={`font-bold ${r.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>
          {fmtMoney(r.amount)}
        </span>
      ),
    },
    {
      key: "balance_after",
      label: "Accumulated Profit",
      render: (r) => <span className="font-bold text-neutral-800">{fmtMoney(r.balance_after)}</span>,
    },
    {
      key: "note",
      label: "Description / Notes",
      render: (r) => (
        <div className="leading-snug">
          <div className="font-semibold text-neutral-800 text-xs">{r.note}</div>
          {r.ref_type && (
            <div className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">
              {r.ref_type} {r.ref_id ? `: ${r.ref_id}` : ""}
            </div>
          )}
        </div>
      ),
    },
  ];

  const getCashbookColumns = () => [
    {
      key: "created_at",
      label: "Date & Time",
      render: (r) => <span className="text-neutral-500 font-semibold">{fmtDate(r.created_at)}</span>,
    },
    {
      key: "type",
      label: "Type",
      render: (r) => {
        const isCredit = r.type === "credit";
        return (
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
              isCredit
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-rose-50 text-rose-700 border border-rose-100"
            }`}
          >
            {isCredit ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            ) : (
              <ArrowDownLeft className="h-3 w-3 text-rose-500" />
            )}
            {r.type.toUpperCase()}
          </span>
        );
      },
    },
    {
      key: "amount",
      label: "Amount",
      render: (r) => (
        <span className={`font-bold ${r.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>
          {fmtMoney(r.amount)}
        </span>
      ),
    },
    {
      key: "balance_after",
      label: "Closing Bank Balance",
      render: (r) => <span className="font-bold text-neutral-800">{fmtMoney(r.balance_after)}</span>,
    },
    {
      key: "note",
      label: "Particulars",
      render: (r) => (
        <div className="leading-snug">
          <div className="font-semibold text-neutral-800 text-xs">{r.note}</div>
          {r.ref_type && (
            <div className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">
              {r.ref_type} {r.ref_id ? `: ${r.ref_id}` : ""}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Statement"
        subtitle="Manage unified system accounts, verify net profit margins, and track overall cashflow."
        actions={
          activeTab !== "system" && (
            <button
              onClick={() => setShowAdjustModal(true)}
              className="mfp-btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Adjustment</span>
            </button>
          )
        }
      />

      {/* Tabs list */}
      <div className="flex border-b border-black/5 gap-2 select-none">
        <button
          onClick={() => setActiveTab("system")}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all ${
            activeTab === "system"
              ? "border-[#1B4332] text-[#1B4332]"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          System Ledger
        </button>
        <button
          onClick={() => setActiveTab("profit")}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all ${
            activeTab === "profit"
              ? "border-[#1B4332] text-[#1B4332]"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Profit Ledger
        </button>
        <button
          onClick={() => setActiveTab("cashbook")}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all ${
            activeTab === "cashbook"
              ? "border-[#1B4332] text-[#1B4332]"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Cashbook (Bank Balance)
        </button>
      </div>

      {/* Summary Cards */}
      {activeTab === "profit" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
          <div className="bg-gradient-to-br from-[#0F5132] to-[#198754] text-white rounded-2xl p-5 flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-1.5 opacity-80">Total Net Profit</span>
              <h3 className="text-3xl font-black">{fmtMoney(profitBalance)}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      )}

      {activeTab === "cashbook" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
          <div className="bg-gradient-to-br from-[#0A3641] to-[#0D6EFD] text-white rounded-2xl p-5 flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-1.5 opacity-80">Cashbook Balance</span>
              <h3 className="text-3xl font-black">{fmtMoney(cashbookBalance)}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Landmark className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      )}

      {/* Table Data list */}
      <div className="mfp-card">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-neutral-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#1B4332]" />
            <span className="text-sm font-semibold">Loading statement logs...</span>
          </div>
        ) : activeTab === "system" ? (
          <DataTable
            rows={systemItems}
            columns={getSystemColumns()}
            pagination={{
              total: systemTotal,
              page: systemPage,
              pageSize: systemPageSize,
              onPageChange: (p) => setSystemPage(p),
            }}
          />
        ) : activeTab === "profit" ? (
          <DataTable rows={profitItems} columns={getProfitColumns()} />
        ) : (
          <DataTable rows={cashbookItems} columns={getCashbookColumns()} />
        )}
      </div>

      {/* Manual Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={() => setShowAdjustModal(false)}>
          <form
            onSubmit={handleAdjustSubmit}
            className="bg-white rounded-2xl max-w-md w-full border border-black/5 shadow-2xl animate-scaleUp overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
              <div className="text-base font-bold text-neutral-800">
                Log {activeTab === "profit" ? "Profit Margin" : "Cashbook"} Adjustment
              </div>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="mfp-btn-ghost p-2"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block mb-1">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType("credit")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      adjustType === "credit"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                        : "bg-[#F8F9FA] border-black/5 text-neutral-500"
                    }`}
                  >
                    Credit (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType("debit")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      adjustType === "debit"
                        ? "bg-rose-50 border-rose-500 text-rose-700"
                        : "bg-[#F8F9FA] border-black/5 text-neutral-500"
                    }`}
                  >
                    Debit (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block mb-1">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="mfp-input w-full"
                />
              </div>

              <div>
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block mb-1">
                  Description / Particulars
                </label>
                <textarea
                  required
                  rows="3"
                  placeholder="E.g., Manual API balance load, bank fee, etc."
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="mfp-input w-full resize-none py-2"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="mfp-btn-outline flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="mfp-btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {submittingAdjust ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Logging…</span>
                    </>
                  ) : (
                    <span>Submit Entry</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
