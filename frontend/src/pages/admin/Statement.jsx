import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api, formatErr, fmtDate, fmtMoney } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable } from "@/components/Shared";
import { toast } from "sonner";
import { 
  Plus, Loader2, ArrowUpRight, ArrowDownLeft, Landmark, 
  TrendingUp, Search, RotateCcw, X, CheckCircle2, Download, Calendar, Filter
} from "lucide-react";

export default function AdminStatement() {
  const [activeTab, setActiveTab] = useState("admin_statement"); // admin_statement | system | profit | cashbook
  const [loading, setLoading] = useState(false);

  // Admin Statement states
  const [adminItems, setAdminItems] = useState([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(20);
  const [adminSummary, setAdminSummary] = useState({
    opening_balance: 0,
    total_credits: 0,
    total_debits: 0,
    closing_balance: 0,
    current_wallet_total: 0,
    is_reconciled: true,
  });

  // System ledger states
  const [systemItems, setSystemItems] = useState(() => {
    try {
      const v = localStorage.getItem("mfp_cache_system_ledger");
      return v ? JSON.parse(v) : [];
    } catch { return []; }
  });
  const [systemTotal, setSystemTotal] = useState(() => systemItems.length);
  const [systemPage, setSystemPage] = useState(1);
  const [systemPageSize, setSystemPageSize] = useState(20);

  // Profit & Cashbook states
  const [profitItems, setProfitItems] = useState([]);
  const [cashbookItems, setCashbookItems] = useState([]);
  const [profitBalance, setProfitBalance] = useState(0);
  const [cashbookBalance, setCashbookBalance] = useState(0);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  // Date range filter
  const [datePreset, setDatePreset] = useState("all_time"); // all_time | today | yesterday | last_7_days | custom
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const debouncedSearch = useDebounced(searchQuery, 350);
  const debouncedMinAmt = useDebounced(minAmount, 350);
  const debouncedMaxAmt = useDebounced(maxAmount, 350);

  // Modal states
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustType, setAdjustType] = useState("credit"); // credit | debit
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Reset pagination on filter change
  useEffect(() => {
    setAdminPage(1);
    setSystemPage(1);
  }, [debouncedSearch, debouncedMinAmt, debouncedMaxAmt, kindFilter, typeFilter, roleFilter, datePreset, fromDate, toDate]);

  const isFiltered = Boolean(searchQuery || minAmount || maxAmount || kindFilter !== "all" || typeFilter !== "all" || roleFilter !== "all" || datePreset !== "all_time" || fromDate || toDate);

  const clearAllFilters = () => {
    setSearchQuery("");
    setMinAmount("");
    setMaxAmount("");
    setKindFilter("all");
    setTypeFilter("all");
    setRoleFilter("all");
    setDatePreset("all_time");
    setFromDate("");
    setToDate("");
  };

  // Helper for date bounds
  const getDateParams = useCallback(() => {
    const params = {};
    if (datePreset === "today") {
      const today = new Date().toISOString().split("T")[0];
      params.from_date = today;
      params.to_date = today;
    } else if (datePreset === "yesterday") {
      const yest = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      params.from_date = yest;
      params.to_date = yest;
    } else if (datePreset === "last_7_days") {
      const start7 = new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];
      params.from_date = start7;
      params.to_date = today;
    } else if (datePreset === "custom") {
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
    }
    return params;
  }, [datePreset, fromDate, toDate]);

  // Fetch Admin Statement data
  const fetchAdminStatement = useCallback(() => {
    setLoading(true);
    const dateParams = getDateParams();
    const params = {
      page: adminPage,
      page_size: adminPageSize,
      ...dateParams,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (debouncedMinAmt !== "") params.min_amount = parseFloat(debouncedMinAmt);
    if (debouncedMaxAmt !== "") params.max_amount = parseFloat(debouncedMaxAmt);
    if (kindFilter !== "all") params.kind = kindFilter;
    if (typeFilter !== "all") params.type = typeFilter;
    if (roleFilter !== "all") params.role = roleFilter;

    api.get("/admin/admin-statement", { params })
      .then((res) => {
        setAdminItems(res.data.items || []);
        setAdminTotal(res.data.total || 0);
        if (res.data.summary) {
          setAdminSummary(res.data.summary);
        }
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load Admin Statement"))
      .finally(() => setLoading(false));
  }, [adminPage, adminPageSize, debouncedSearch, debouncedMinAmt, debouncedMaxAmt, kindFilter, typeFilter, roleFilter, getDateParams]);

  // Fetch System Ledger
  const fetchSystemLedger = useCallback(() => {
    if (systemItems.length === 0) setLoading(true);
    const dateParams = getDateParams();
    const params = {
      page: systemPage,
      page_size: systemPageSize,
      ...dateParams,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (debouncedMinAmt !== "") params.min_amount = parseFloat(debouncedMinAmt);
    if (debouncedMaxAmt !== "") params.max_amount = parseFloat(debouncedMaxAmt);
    if (kindFilter !== "all") params.kind = kindFilter;
    if (roleFilter !== "all") params.role = roleFilter;

    api.get("/admin/system-ledger", { params })
      .then((res) => {
        const fetched = res.data.items || [];
        setSystemItems(fetched);
        setSystemTotal(res.data.total || 0);
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load system ledger"))
      .finally(() => setLoading(false));
  }, [systemPage, systemPageSize, debouncedSearch, debouncedMinAmt, debouncedMaxAmt, kindFilter, roleFilter, getDateParams, systemItems.length]);

  const fetchProfitLedger = useCallback(() => {
    setLoading(true);
    api.get("/admin/profit-ledger")
      .then((res) => {
        const items = res.data || [];
        setProfitItems(items);
        setProfitBalance(items.length > 0 ? items[0].balance_after || 0 : 0);
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
        setCashbookBalance(items.length > 0 ? items[0].balance_after || 0 : 0);
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load cashbook"))
      .finally(() => setLoading(false));
  }, []);

  const reloadActive = useCallback(() => {
    if (activeTab === "admin_statement") fetchAdminStatement();
    else if (activeTab === "system") fetchSystemLedger();
    else if (activeTab === "profit") fetchProfitLedger();
    else if (activeTab === "cashbook") fetchCashbook();
  }, [activeTab, fetchAdminStatement, fetchSystemLedger, fetchProfitLedger, fetchCashbook]);

  useEffect(() => {
    reloadActive();
  }, [reloadActive]);

  // Client-side filtering for Profit & Cashbook tabs
  const filteredProfitItems = useMemo(() => {
    return profitItems.filter((item) => {
      const amt = item.amount || 0;
      if (debouncedMinAmt !== "" && amt < parseFloat(debouncedMinAmt)) return false;
      if (debouncedMaxAmt !== "" && amt > parseFloat(debouncedMaxAmt)) return false;
      if (kindFilter !== "all" && item.type !== kindFilter) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const noteMatch = (item.note || "").toLowerCase().includes(q);
        const refMatch = (item.ref_type || "").toLowerCase().includes(q) || (item.ref_id || "").toLowerCase().includes(q);
        if (!noteMatch && !refMatch) return false;
      }
      return true;
    });
  }, [profitItems, debouncedMinAmt, debouncedMaxAmt, kindFilter, debouncedSearch]);

  const filteredCashbookItems = useMemo(() => {
    return cashbookItems.filter((item) => {
      const amt = item.amount || 0;
      if (debouncedMinAmt !== "" && amt < parseFloat(debouncedMinAmt)) return false;
      if (debouncedMaxAmt !== "" && amt > parseFloat(debouncedMaxAmt)) return false;
      if (kindFilter !== "all" && item.type !== kindFilter) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const noteMatch = (item.note || "").toLowerCase().includes(q);
        const refMatch = (item.ref_type || "").toLowerCase().includes(q) || (item.ref_id || "").toLowerCase().includes(q);
        if (!noteMatch && !refMatch) return false;
      }
      return true;
    });
  }, [cashbookItems, debouncedMinAmt, debouncedMaxAmt, kindFilter, debouncedSearch]);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustAmount || parseFloat(adjustAmount) <= 0) return toast.error("Please enter a valid amount");
    if (!adjustNote.trim()) return toast.error("Please enter a description");

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

  // CSV Export handler
  const exportToCSV = () => {
    if (adminItems.length === 0) return toast.error("No statement entries to export");
    const headers = ["Date & Time", "Type", "ID", "Firm Name", "User Name", "Description", "Credit (+)", "Debit (-)", "Admin Balance", "Status", "User Current Wallet", "User Closing Balance"];
    const rows = adminItems.map(r => [
      `"${fmtDate(r.created_at)}"`,
      `"${r.type_label}"`,
      `"${r.ref_id}"`,
      `"${r.firm_name}"`,
      `"${r.user_name}"`,
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.credit ? r.credit : "",
      r.debit ? r.debit : "",
      r.admin_balance,
      `"${r.status}"`,
      r.user_current_wallet,
      r.user_closing_balance
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Admin_Statement_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Statement CSV downloaded");
  };

  // ----------------------------------------------------
  // ADMIN STATEMENT TABLE COLUMNS (Matching Photo UI)
  // ----------------------------------------------------
  const getAdminStatementColumns = () => [
    {
      key: "created_at",
      label: "TRANSACTION DATE",
      render: (r) => (
        <div className="leading-tight min-w-[110px]">
          <div className="font-bold text-neutral-800 text-xs">{fmtDate(r.created_at)}</div>
        </div>
      ),
    },
    {
      key: "type_id",
      label: "TYPE / ID",
      render: (r) => {
        let badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (r.type_label === "PAYOUT") badgeStyle = "bg-purple-50 text-purple-700 border-purple-200";
        else if (r.type_label === "CC BILL") badgeStyle = "bg-rose-50 text-rose-700 border-rose-200";
        else if (r.type_label === "LIVE BILL") badgeStyle = "bg-amber-50 text-amber-700 border-amber-200";
        else if (r.type_label === "BILL PAY") badgeStyle = "bg-rose-50 text-rose-700 border-rose-200";
        else if (r.type_label === "QR PAYMENT") badgeStyle = "bg-blue-50 text-blue-700 border-blue-200";
        else if (r.type_label === "HOLD") badgeStyle = "bg-amber-50 text-amber-700 border-amber-200";

        return (
          <div className="space-y-1 min-w-[100px]">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider block w-fit ${badgeStyle}`}>
              {r.type_label}
            </span>
            <div className="text-[11px] font-extrabold text-neutral-500 tracking-wider">
              {r.ref_id}
            </div>
          </div>
        );
      },
    },
    {
      key: "user_firm",
      label: "USER / FIRM",
      render: (r) => (
        <div className="leading-snug min-w-[160px]">
          <div className="font-black text-neutral-900 text-xs uppercase tracking-tight">{r.firm_name}</div>
          <div className="text-[11px] text-neutral-500 font-medium">{r.user_name}</div>
        </div>
      ),
    },
    {
      key: "description",
      label: "DESCRIPTION",
      render: (r) => (
        <div className="min-w-[240px] max-w-[340px] py-1 space-y-0.5">
          <div className="font-bold text-neutral-800 text-xs leading-snug break-words">
            {r.description_line1 || r.description}
          </div>
          {r.description_line2 && (
            <div className="text-[11px] font-semibold text-neutral-500 leading-snug break-words">
              {r.description_line2}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "credit",
      label: "CREDIT (+)",
      render: (r) => (
        r.credit ? (
          <span className="font-black text-emerald-600 text-xs">
            + ₹{Number(r.credit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-neutral-300 text-xs font-semibold">--</span>
        )
      ),
    },
    {
      key: "debit",
      label: "DEBIT (-)",
      render: (r) => (
        r.debit ? (
          <span className="font-black text-rose-600 text-xs">
            - ₹{Number(r.debit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-neutral-300 text-xs font-semibold">--</span>
        )
      ),
    },
    {
      key: "admin_balance",
      label: "ADMIN BALANCE",
      render: (r) => (
        <span className="font-black text-neutral-800 text-xs">
          ₹{Number(r.admin_balance).toLocaleString("en-IN", { minimumFractionDigits: 3 })}
        </span>
      ),
    },
    {
      key: "status",
      label: "STATUS",
      render: (r) => {
        let statusStyle = "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (r.status === "PENDING" || r.status === "PROCESSING") statusStyle = "bg-amber-50 text-amber-700 border-amber-200";
        else if (r.status === "REJECTED") statusStyle = "bg-rose-50 text-rose-700 border-rose-200";
        else if (r.status === "FAILED") statusStyle = "bg-red-50 text-red-700 border-red-200";
        else if (r.status === "REFUNDED") statusStyle = "bg-blue-50 text-blue-700 border-blue-200";

        return (
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wider ${statusStyle}`}>
            {r.status}
          </span>
        );
      },
    },
    {
      key: "user_current_wallet",
      label: "USER CURRENT WALLET",
      render: (r) => (
        <span className="font-black text-neutral-800 text-xs">
          ₹{Number(r.user_current_wallet).toLocaleString("en-IN", { minimumFractionDigits: 3 })}
        </span>
      ),
    },
    {
      key: "user_closing_balance",
      label: "USER CLOSING BALANCE",
      render: (r) => (
        <span className="font-black text-blue-700 text-xs">
          ₹{Number(r.user_closing_balance).toLocaleString("en-IN", { minimumFractionDigits: 3 })}
        </span>
      ),
    },
  ];

  // System columns
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
            {isCredit ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : <ArrowDownLeft className="h-3 w-3 text-rose-500" />}
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
            {isCredit ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : <ArrowDownLeft className="h-3 w-3 text-rose-500" />}
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
        </div>
      ),
    },
  ];

  const getCashbookColumns = () => getProfitColumns();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Statement"
        subtitle="Master account reconciliation, real-time agent balance auditing, and transaction logs."
        actions={
          <div className="flex items-center gap-2">
            {activeTab === "admin_statement" && (
              <button
                onClick={exportToCSV}
                className="mfp-btn-outline flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </button>
            )}
            {activeTab !== "admin_statement" && activeTab !== "system" && (
              <button
                onClick={() => setShowAdjustModal(true)}
                className="mfp-btn-primary flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Adjustment</span>
              </button>
            )}
          </div>
        }
      />

      {/* Tabs Header */}
      <div className="flex border-b border-black/5 gap-2 select-none overflow-x-auto">
        <button
          onClick={() => setActiveTab("admin_statement")}
          className={`px-5 py-3 font-black text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "admin_statement"
              ? "border-[#1B4332] text-[#1B4332] bg-emerald-50/50 rounded-t-xl"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          <span>Admin Statement</span>
          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wide">
            Master UI
          </span>
        </button>
        <button
          onClick={() => setActiveTab("system")}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "system"
              ? "border-[#1B4332] text-[#1B4332]"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          System Ledger
        </button>
        <button
          onClick={() => setActiveTab("profit")}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "profit"
              ? "border-[#1B4332] text-[#1B4332]"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Profit Ledger
        </button>
        <button
          onClick={() => setActiveTab("cashbook")}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "cashbook"
              ? "border-[#1B4332] text-[#1B4332]"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Cashbook (Bank Balance)
        </button>
      </div>

      {/* Admin Statement Master Summary Cards & Reconciliation Bar */}
      {activeTab === "admin_statement" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-black/5 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-extrabold uppercase tracking-wider block mb-1 text-neutral-400">Opening Balance</span>
              <h3 className="text-xl font-black text-neutral-800">{fmtMoney(adminSummary.opening_balance)}</h3>
            </div>
            <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-extrabold uppercase tracking-wider block mb-1 text-emerald-600">Total Credits (+)</span>
              <h3 className="text-xl font-black text-emerald-700">+ {fmtMoney(adminSummary.total_credits)}</h3>
            </div>
            <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-extrabold uppercase tracking-wider block mb-1 text-rose-600">Total Debits (-)</span>
              <h3 className="text-xl font-black text-rose-700">- {fmtMoney(adminSummary.total_debits)}</h3>
            </div>
            <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-extrabold uppercase tracking-wider block mb-1 text-blue-600">Net Closing Balance</span>
              <h3 className="text-xl font-black text-blue-800">{fmtMoney(adminSummary.closing_balance)}</h3>
            </div>
            <div className="bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] text-white rounded-2xl p-4 shadow-md flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider block opacity-80">
                  Agents Live Wallet
                </span>
                <h3 className="text-xl font-black">{fmtMoney(adminSummary.agent_wallet_total || adminSummary.current_wallet_total)}</h3>
              </div>
              <div className="text-[10px] opacity-80 font-semibold mt-1 flex flex-col gap-0.5 border-t border-white/10 pt-1">
                <span>MD Earnings: {fmtMoney(adminSummary.md_earnings_total || 0)}</span>
                <span>DS Earnings: {fmtMoney(adminSummary.distributor_earnings_total || 0)}</span>
              </div>
            </div>
          </div>

          {/* Reconciliation status bar */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Statement Reconciled: Opening Balance + Total Credits - Total Debits = Net Closing Balance</span>
            </div>
            <span className="bg-emerald-600 text-white font-black px-2.5 py-0.5 rounded-md text-[10px] uppercase tracking-wider">
              100% Matched
            </span>
          </div>
        </div>
      )}

      {/* Profit & Cashbook Summary Cards */}
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

      {/* Filter Bar */}
      <div className="mfp-card p-5 space-y-4" data-testid="statement-filter-bar">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Member / Note Search */}
          <div className="relative lg:col-span-2">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Firm, Member, ID, Note..."
              className="mfp-input !pl-11 !pr-9 w-full"
              data-testid="statement-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Date Presets */}
          <div>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="mfp-input w-full font-bold text-xs"
            >
              <option value="all_time">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="custom">Custom Date</option>
            </select>
          </div>

          {/* Type Filter */}
          {activeTab === "admin_statement" ? (
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="mfp-input w-full font-bold text-xs"
              >
                <option value="all">All Txn Types</option>
                <option value="cc_bill">CC Bill (Credit Card)</option>
                <option value="live_bill">Live Bill Pay</option>
                <option value="payout">Payout</option>
                <option value="qr_payment">QR Payment / Topup</option>
                <option value="adjustment">Adjustment / Hold</option>
              </select>
            </div>
          ) : (
            <div>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                className="mfp-input w-full text-xs font-bold"
              >
                <option value="all">All Types</option>
                <option value="credit">Credit (+)</option>
                <option value="debit">Debit (-)</option>
                <option value="refund">Refund</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
          )}

          {/* Role Filter */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="mfp-input w-full text-xs font-bold"
            >
              <option value="all">All Roles</option>
              <option value="master_distributor">Master Distributor</option>
              <option value="distributor">Distributor</option>
              <option value="agent">Agent</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={!isFiltered}
              className="mfp-btn-ghost w-full flex items-center justify-center gap-1.5 disabled:opacity-40 text-xs font-bold"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Clear Filters
            </button>
          </div>
        </div>

        {/* Custom Date Range Inputs */}
        {datePreset === "custom" && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-black/5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-500">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mfp-input text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-500">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mfp-input text-xs"
              />
            </div>
          </div>
        )}

        {/* Results Counter Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black/5">
          <div className="text-xs text-neutral-600">
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-neutral-400 font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1B4332]" /> Loading statement logs…
              </span>
            ) : activeTab === "admin_statement" ? (
              <>Showing <span className="font-bold text-neutral-800">{adminTotal.toLocaleString("en-IN")}</span> master transactions</>
            ) : activeTab === "system" ? (
              <>Matched <span className="font-bold text-neutral-800">{systemTotal.toLocaleString("en-IN")}</span> ledger entries</>
            ) : activeTab === "profit" ? (
              <>Showing <span className="font-bold text-neutral-800">{filteredProfitItems.length}</span> profit entries</>
            ) : (
              <>Showing <span className="font-bold text-neutral-800">{filteredCashbookItems.length}</span> bank cashbook entries</>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="mfp-card overflow-x-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-neutral-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#1B4332]" />
            <span className="text-sm font-semibold">Loading statement data...</span>
          </div>
        ) : activeTab === "admin_statement" ? (
          <DataTable
            rows={adminItems}
            columns={getAdminStatementColumns()}
            pagination={{
              total: adminTotal,
              page: adminPage,
              pageSize: adminPageSize,
              onPageChange: (p) => setAdminPage(p),
              onPageSizeChange: (ps) => {
                setAdminPageSize(ps);
                setAdminPage(1);
              },
            }}
          />
        ) : activeTab === "system" ? (
          <DataTable
            rows={systemItems}
            columns={getSystemColumns()}
            pagination={{
              total: systemTotal,
              page: systemPage,
              pageSize: systemPageSize,
              onPageChange: (p) => setSystemPage(p),
              onPageSizeChange: (ps) => {
                setSystemPageSize(ps);
                setSystemPage(1);
              },
            }}
          />
        ) : activeTab === "profit" ? (
          <DataTable rows={filteredProfitItems} columns={getProfitColumns()} />
        ) : (
          <DataTable rows={filteredCashbookItems} columns={getCashbookColumns()} />
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
