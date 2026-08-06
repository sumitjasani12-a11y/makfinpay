import React, { useCallback, useEffect, useState } from "react";
import { api, formatErr, fileUrl, fmtMoney } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { rangeWindowIso, todayStr } from "@/lib/filters";
import { PageHeader, EmptyState } from "@/components/Shared";
import { toast } from "sonner";
import { CheckCircle2, Trash2, Eye, RefreshCw, Upload, Tag, Phone, Link, FileText, Search, Calendar, FileSpreadsheet, FileDown, Pencil, Check, X } from "lucide-react";

export default function AdminQRCodes() {
  const { user } = useAuth();
  const isSuperAdmin = user?.email?.toLowerCase() === "jigs.vanani@gmail.com";
  const [editingHistoryId, setEditingHistoryId] = useState(null);
  const [editPercentVal, setEditPercentVal] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [items, setItems] = useState(() => {
    try {
      const cached = localStorage.getItem("admin_active_qr");
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [qrEntries, setQrEntries] = useState([]);

  const [label, setLabel] = useState("");
  const [upi, setUpi] = useState("");
  const [mobile, setMobile] = useState("");
  const [path, setPath] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState("");

  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("mfp_cache_qr_history_today") || "[]");
    } catch {
      return [];
    }
  });
  const [historySearch, setHistorySearch] = useState("");
  const [dateFilter, setDateFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState(() => todayStr(-1));
  const [customTo, setCustomTo] = useState(() => todayStr(0));
  const [customApplied, setCustomApplied] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;

  const activeFilterRef = React.useRef(dateFilter);
  useEffect(() => {
    activeFilterRef.current = dateFilter;
  }, [dateFilter]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, dateFilter]);

  const [qrEnabled, setQrEnabled] = useState(() => {
    try {
      const v = localStorage.getItem("set_qr_enabled");
      return v !== null ? JSON.parse(v) : true;
    } catch (e) { return true; }
  });
  const [t1QrEnabled, setT1QrEnabled] = useState(() => {
    try {
      const v = localStorage.getItem("set_t1_qr_enabled");
      return v !== null ? JSON.parse(v) : true;
    } catch (e) { return true; }
  });
  const [rechargeEnabled, setRechargeEnabled] = useState(() => {
    try {
      const v = localStorage.getItem("set_recharge_enabled");
      return v !== null ? JSON.parse(v) : true;
    } catch (e) { return true; }
  });
  const [t1RechargeEnabled, setT1RechargeEnabled] = useState(() => {
    try {
      const v = localStorage.getItem("set_t1_recharge_enabled");
      return v !== null ? JSON.parse(v) : true;
    } catch (e) { return true; }
  });

  const [uploadIsT1, setUploadIsT1] = useState(false);
  const [activeTab, setActiveTab] = useState("normal");

  const [historyLoading, setHistoryLoading] = useState(() => !localStorage.getItem("mfp_cache_qr_history_today"));

  const fetchHistory = useCallback((filter, cFrom, cTo) => {
    activeFilterRef.current = filter;
    const cacheKey = `mfp_cache_qr_history_${filter}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        setHistory(JSON.parse(cachedData));
        setHistoryLoading(false);
      } catch { }
    } else {
      setHistoryLoading(true);
    }

    let key = filter;
    if (filter === "all") key = "lifetime";
    if (filter === "this_week") key = "last7";
    if (filter === "this_month") key = "last30";

    const { from_ts, to_ts } = rangeWindowIso(key, cFrom || customFrom, cTo || customTo);

    api.get("/admin/qrcodes/history", { params: { from_ts, to_ts } })
      .then((r) => {
        if (activeFilterRef.current !== filter) return;
        const data = r.data || [];
        setHistory(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch { }
      })
      .catch((e) => {
        if (activeFilterRef.current !== filter) return;
        toast.error(formatErr(e.response?.data?.detail) || "Failed to load history");
      })
      .finally(() => {
        if (activeFilterRef.current === filter) {
          setHistoryLoading(false);
        }
      });
  }, [customFrom, customTo]);

  const handleSaveHistoryPercent = async (hid, val) => {
    const targetVal = val !== undefined ? val : editPercentVal;
    const p = parseFloat(targetVal);
    if (isNaN(p) || p < 0 || p > 100) {
      toast.error("Please enter a valid percentage (0 - 100)");
      setEditingHistoryId(null);
      return;
    }
    setEditLoading(true);
    try {
      await api.put(`/admin/qrcodes/history/${hid}/percent`, { qr_percent: p });
      toast.success("QR % updated successfully!");
      setEditingHistoryId(null);
      fetchHistory(dateFilter);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update percentage");
    } finally {
      setEditLoading(false);
    }
  };

  useEffect(() => {
    if (dateFilter !== "custom") {
      fetchHistory(dateFilter);
    } else if (customApplied) {
      fetchHistory("custom", customFrom, customTo);
    }
  }, [dateFilter, fetchHistory, customApplied, customFrom, customTo]);

  const reload = () => {
    api.get("/admin/qrcodes?stats=true").then((r) => {
      setItems(r.data || []);
      try {
        localStorage.setItem("admin_active_qr", JSON.stringify(r.data || []));
      } catch (e) { }
    });
    api.get("/admin/qr-name-entries").then((r) => setQrEntries(r.data || []));
    fetchHistory(dateFilter);
    api.get(`/admin/settings/recharge-limits?_t=${Date.now()}`).then((r) => {
      const qe = r.data.qr_enabled ?? true;
      const t1qe = r.data.t1_qr_enabled ?? true;
      const re = r.data.recharge_enabled ?? true;
      const t1re = r.data.t1_recharge_enabled ?? true;
      setQrEnabled(qe);
      setT1QrEnabled(t1qe);
      setRechargeEnabled(re);
      setT1RechargeEnabled(t1re);
      try {
        localStorage.setItem("set_qr_enabled", JSON.stringify(qe));
        localStorage.setItem("set_t1_qr_enabled", JSON.stringify(t1qe));
        localStorage.setItem("set_recharge_enabled", JSON.stringify(re));
        localStorage.setItem("set_t1_recharge_enabled", JSON.stringify(t1re));
      } catch (e) { }
    });
  };

  useEffect(() => { reload(); }, []);

  const handleToggleQr = async (val) => {
    setQrEnabled(val);
    try { localStorage.setItem("set_qr_enabled", JSON.stringify(val)); } catch (e) { }
    try {
      await api.put("/admin/settings/recharge-toggles", {
        qr_enabled: val,
        t1_qr_enabled: t1QrEnabled,
        recharge_enabled: rechargeEnabled,
        t1_recharge_enabled: t1RechargeEnabled
      });
      toast.success(`Agent QR image ${val ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update toggle");
      setQrEnabled(!val);
      try { localStorage.setItem("set_qr_enabled", JSON.stringify(!val)); } catch (err) { }
    }
  };

  const handleToggleT1Qr = async (val) => {
    setT1QrEnabled(val);
    try { localStorage.setItem("set_t1_qr_enabled", JSON.stringify(val)); } catch (e) { }
    try {
      await api.put("/admin/settings/recharge-toggles", {
        qr_enabled: qrEnabled,
        t1_qr_enabled: val,
        recharge_enabled: rechargeEnabled,
        t1_recharge_enabled: t1RechargeEnabled
      });
      toast.success(`Agent T+1 QR image ${val ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update toggle");
      setT1QrEnabled(!val);
      try { localStorage.setItem("set_t1_qr_enabled", JSON.stringify(!val)); } catch (err) { }
    }
  };

  const handleToggleRecharge = async (val) => {
    setRechargeEnabled(val);
    try { localStorage.setItem("set_recharge_enabled", JSON.stringify(val)); } catch (e) { }
    try {
      await api.put("/admin/settings/recharge-toggles", {
        qr_enabled: qrEnabled,
        t1_qr_enabled: t1QrEnabled,
        recharge_enabled: val,
        t1_recharge_enabled: t1RechargeEnabled
      });
      toast.success(`Agent Recharge request ${val ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update toggle");
      setRechargeEnabled(!val);
      try { localStorage.setItem("set_recharge_enabled", JSON.stringify(!val)); } catch (err) { }
    }
  };

  const handleToggleT1Recharge = async (val) => {
    setT1RechargeEnabled(val);
    try { localStorage.setItem("set_t1_recharge_enabled", JSON.stringify(val)); } catch (e) { }
    try {
      await api.put("/admin/settings/recharge-toggles", {
        qr_enabled: qrEnabled,
        t1_qr_enabled: t1QrEnabled,
        recharge_enabled: rechargeEnabled,
        t1_recharge_enabled: val
      });
      toast.success(`Agent T+1 Recharge request ${val ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update toggle");
      setT1RechargeEnabled(!val);
      try { localStorage.setItem("set_t1_recharge_enabled", JSON.stringify(!val)); } catch (err) { }
    }
  };

  const handleSelectEntry = (id) => {
    setSelectedEntryId(id);
    const found = qrEntries.find(e => e.id === id);
    if (found) {
      setLabel(found.name);
      setMobile(found.mobile_number);
      setUpi(found.upi_id);
      setPath(found.image_path);
      setUploadIsT1(found.is_t1 || false);
    } else {
      setLabel("");
      setMobile("");
      setUpi("");
      setPath("");
      setUploadIsT1(false);
    }
  };

  const create = async () => {
    if (!label || !path) return toast.error("Please select a QR Name Entry first");
    try {
      await api.post("/admin/qrcodes", {
        label,
        image_path: path,
        upi_id: upi,
        mobile_number: mobile,
        is_t1: uploadIsT1
      });
      toast.success("QR added");
      setLabel("");
      setUpi("");
      setMobile("");
      setPath("");
      setSelectedEntryId("");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const activate = async (id) => {
    try {
      await api.patch(`/admin/qrcodes/${id}/activate`);
      toast.success("QR activated");
      reload();
    } catch (e) {
      toast.error("Failed to activate QR");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this QR Code?")) return;
    try {
      await api.delete(`/admin/qrcodes/${id}`);
      toast.success("QR deleted");
      reload();
    } catch (e) {
      toast.error("Failed to delete QR");
    }
  };

  const matchesDate = (isoStr) => {
    if (dateFilter === "all") return true;
    if (!isoStr) return false;
    const date = new Date(isoStr);
    const today = new Date();

    const dDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (dateFilter === "today") {
      return dDate.getTime() === dToday.getTime();
    }
    if (dateFilter === "yesterday") {
      const yesterday = new Date(dToday);
      yesterday.setDate(yesterday.getDate() - 1);
      return dDate.getTime() === yesterday.getTime();
    }
    if (dateFilter === "this_week") {
      const oneWeekAgo = new Date(dToday);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      return dDate.getTime() >= oneWeekAgo.getTime();
    }
    if (dateFilter === "this_month") {
      const oneMonthAgo = new Date(dToday);
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
      return dDate.getTime() >= oneMonthAgo.getTime();
    }
    return true;
  };

  const filteredHistory = history.filter(item => {
    const searchLower = historySearch.toLowerCase();
    const matchesSearch = !historySearch ||
      item.label?.toLowerCase().includes(searchLower) ||
      item.mobile_number?.includes(searchLower) ||
      item.upi_id?.toLowerCase().includes(searchLower);

    const hasActivity = item.entries > 0 || item.status === "ACTIVE";
    return matchesSearch && (dateFilter === "all" || hasActivity);
  });

  const paginatedHistory = React.useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return filteredHistory.slice(start, start + historyPageSize);
  }, [filteredHistory, historyPage]);

  const formatDate = (isoStr) => {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} at ${hours}:${minutes}`;
  };

  const exportCsv = () => {
    let headers = ["QR Name", "Status", "Entries", "Approved Amount", "Pending", "Approved", "Rejected", "Admin Revenue", "S.Dist Earnings", "Dist Earnings", "Total Profit", "QR %", "QR Profit", "Final Profit"];
    let csvRows = [headers.join(",")];
    filteredHistory.forEach(item => {
      let row = [
        `"${item.label}"`,
        `"${item.status}"`,
        item.entries,
        item.approved_amount,
        item.breakdown.pending,
        item.breakdown.approved,
        item.breakdown.rejected,
        item.admin_revenue,
        item.md_earnings,
        item.dist_earnings,
        item.total_profit,
        `"${item.qr_percent}%"`,
        item.qr_profit,
        item.final_profit
      ];
      csvRows.push(row.join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `qr_tracking_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPdf = () => {
    window.print();
  };

  const totalEntries = filteredHistory.reduce((sum, item) => sum + item.entries, 0);
  const totalApprovedAmount = filteredHistory.reduce((sum, item) => sum + item.approved_amount, 0);
  const totalPending = filteredHistory.reduce((sum, item) => sum + item.breakdown.pending, 0);
  const totalApproved = filteredHistory.reduce((sum, item) => sum + item.breakdown.approved, 0);
  const totalRejected = filteredHistory.reduce((sum, item) => sum + item.breakdown.rejected, 0);
  const totalAdminRevenue = filteredHistory.reduce((sum, item) => sum + item.admin_revenue, 0);
  const totalMdEarnings = filteredHistory.reduce((sum, item) => sum + item.md_earnings, 0);
  const totalDistEarnings = filteredHistory.reduce((sum, item) => sum + item.dist_earnings, 0);
  const totalProfit = filteredHistory.reduce((sum, item) => sum + item.total_profit, 0);
  const totalQrProfit = filteredHistory.reduce((sum, item) => sum + item.qr_profit, 0);
  const totalFinalProfit = filteredHistory.reduce((sum, item) => sum + item.final_profit, 0);

  const activeQr = items.find((i) => i.active && (activeTab === "t1" ? i.is_t1 : !i.is_t1));

  return (
    <div>
      <PageHeader
        title="QR Code Management"
        subtitle="Manage active UPI QR codes for payment gateway."
        actions={
          <div className="flex flex-wrap items-center gap-6 bg-white px-5 py-2.5 rounded-2xl border border-black/5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">NORMAL:</span>
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${qrEnabled ? "text-emerald-600" : "text-neutral-400"}`}>
                {qrEnabled ? "ON" : "HIDDEN"}
              </span>
              <button
                onClick={() => handleToggleQr(!qrEnabled)}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${qrEnabled ? "bg-[#2D6A4F]" : "bg-neutral-200"
                  }`}
                type="button"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${qrEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>

            <div className="h-4 w-px bg-black/10" />

            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">T+1:</span>
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${t1QrEnabled ? "text-emerald-600" : "text-neutral-400"}`}>
                {t1QrEnabled ? "ON" : "HIDDEN"}
              </span>
              <button
                onClick={() => handleToggleT1Qr(!t1QrEnabled)}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${t1QrEnabled ? "bg-[#2D6A4F]" : "bg-neutral-200"
                  }`}
                type="button"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${t1QrEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>

            <div className="h-4 w-px bg-black/10" />

            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Normal Recharge</span>
              <button
                onClick={() => handleToggleRecharge(!rechargeEnabled)}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${rechargeEnabled ? "bg-[#2D6A4F]" : "bg-neutral-200"
                  }`}
                type="button"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${rechargeEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>

            <div className="h-4 w-px bg-black/10" />

            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">T+1 Recharge</span>
              <button
                onClick={() => handleToggleT1Recharge(!t1RechargeEnabled)}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${t1RechargeEnabled ? "bg-[#2D6A4F]" : "bg-neutral-200"
                  }`}
                type="button"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${t1RechargeEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        {/* Left Card: Select QR Name Entry */}
        <div className="mfp-card p-8 flex flex-col justify-center items-center w-full lg:w-[40%]">
          <div className="max-w-xs w-full flex flex-col items-center justify-center space-y-5">
            {/* Header: Upload New QR */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3 flex items-center justify-center">
                {/* Glowing effect background */}
                <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full w-14 h-14 animate-pulse"></div>
                <div className="relative p-3.5 bg-gradient-to-tr from-indigo-500 to-blue-500 text-white rounded-3xl shadow-lg shadow-indigo-500/25">
                  <Upload className="h-5 w-5" />
                </div>
              </div>
              <h3 className="text-lg font-black tracking-tight text-neutral-800 bg-gradient-to-r from-neutral-800 to-neutral-500 bg-clip-text text-transparent">
                Upload New QR
              </h3>
              <p className="text-[10px] leading-relaxed text-neutral-400 max-w-[220px] mt-1">
                Enter a unique name for this QR code (e.g. PhonePe_01) to track its entries.
              </p>
            </div>

            <div className="space-y-3.5 w-full">
              {/* Select QR Entry */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <select
                  className="mfp-input !pl-9 !py-2 bg-white text-xs border border-black/10 focus:border-[#1b4332]"
                  value={selectedEntryId}
                  onChange={(e) => handleSelectEntry(e.target.value)}
                  data-testid="qr-select-entry"
                >
                  <option value="">Select QR Name...</option>
                  {qrEntries.filter(e => e.active && (uploadIsT1 ? e.is_t1 : !e.is_t1)).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              {/* Mobile Number */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                  <Phone className="h-3.5 w-3.5" />
                </span>
                <input
                  className="mfp-input !pl-9 !py-2 bg-neutral-50/50 text-xs border border-black/10 focus:border-[#1b4332]"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="WhatsApp Number (e.g. 919876543)"
                />
              </div>

              {/* UPI ID */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                  <Link className="h-3.5 w-3.5" />
                </span>
                <input
                  className="mfp-input !pl-9 !py-2 bg-neutral-50/50 text-xs border border-black/10 focus:border-[#1b4332]"
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  placeholder="UPI ID"
                />
              </div>

              <div className="flex gap-2 bg-[#F8F7F2] p-1.5 rounded-xl border border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    setUploadIsT1(false);
                    setLabel("");
                    setMobile("");
                    setUpi("");
                    setPath("");
                    setSelectedEntryId("");
                  }}
                  className={`flex-1 py-1.5 px-3 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${!uploadIsT1
                      ? "bg-white text-[#1B4332] shadow-sm border border-neutral-200/20"
                      : "text-neutral-500 hover:text-neutral-700"
                    }`}
                >
                  Normal (Same Day)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadIsT1(true);
                    setLabel("");
                    setMobile("");
                    setUpi("");
                    setPath("");
                    setSelectedEntryId("");
                  }}
                  className={`flex-1 py-1.5 px-3 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${uploadIsT1
                      ? "bg-white text-[#1B4332] shadow-sm border border-neutral-200/20"
                      : "text-neutral-500 hover:text-neutral-700"
                    }`}
                >
                  T+1 (Next Day)
                </button>
              </div>

              {path && (
                <div className="text-[10px] text-emerald-600 font-bold pt-0.5 text-center">
                  QR Image Loaded ✓
                </div>
              )}

              <button
                className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-white text-xs font-bold rounded-xl transition-all shadow-md bg-gradient-to-r from-[#9A91FB] to-[#8075f9] hover:from-[#867bf9] hover:to-[#6f63f7] transform hover:-translate-y-0.5 active:translate-y-0"
                onClick={create}
                data-testid="qr-create"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Update Now
              </button>
            </div>
          </div>
        </div>

        {/* Right Card: Active QR Preview */}
        <div className="mfp-card p-6 flex flex-col justify-between w-full lg:w-[60%]">
          <div className="flex items-center justify-between border-b border-black/5 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Eye className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-800">Current Active QR</h3>
                <p className="text-xs text-neutral-400">This QR is currently being shown to users.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Tab Selector */}
              <div className="bg-neutral-100 p-1 rounded-xl border border-neutral-200/50 flex gap-0.5 shadow-inner">
                <button
                  type="button"
                  onClick={() => setActiveTab("normal")}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${activeTab === "normal"
                      ? "bg-white text-neutral-800 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700"
                    }`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("t1")}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${activeTab === "t1"
                      ? "bg-white text-neutral-800 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700"
                    }`}
                >
                  T+1
                </button>
              </div>

              {/* Status visibility of selected tab QR */}
              {(() => {
                const isTabEnabled = activeTab === "t1" ? t1QrEnabled : qrEnabled;
                return (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${isTabEnabled
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      : "bg-rose-50 text-rose-600 border border-rose-100"
                    } uppercase tracking-wider`}>
                    {isTabEnabled ? "Currently Visible" : "Currently Hidden"}
                  </span>
                );
              })()}

              <button
                type="button"
                onClick={reload}
                className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-all"
                title="Refresh Stats"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {activeQr ? (
            <div className="grid md:grid-cols-5 gap-6">
              {/* QR Image Container (Col span 2) */}
              <div className="md:col-span-2 flex flex-col">
                <div className="p-3 border border-black/5 bg-[#F4F3ED] rounded-3xl w-full h-full flex items-center justify-center shadow-sm min-h-[240px]">
                  <img
                    src={fileUrl(activeQr.image_path)}
                    alt="active qr"
                    className="mx-auto rounded-xl max-h-72 object-contain"
                  />
                </div>
              </div>

              {/* QR Stats and details Container (Col span 3) */}
              <div className="md:col-span-3 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Active QR Name */}
                  <div className="bg-neutral-50/50 border border-neutral-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">Active QR Name</span>
                    <div className="text-sm font-bold text-neutral-800 break-words leading-tight uppercase">
                      {activeQr.label}
                    </div>
                  </div>

                  {/* Whatsapp Target */}
                  <div className="bg-neutral-50/50 border border-neutral-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">Whatsapp Target</span>
                    <div className="text-sm font-bold text-neutral-800 tabular-nums">
                      {activeQr.mobile_number || "—"}
                    </div>
                  </div>

                  {/* Approved Amount */}
                  <div className="bg-emerald-50/10 border border-emerald-100/50 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Approved Amount</span>
                    <div className="text-base font-extrabold text-emerald-800 tabular-nums">
                      {fmtMoney(activeQr.stats?.approved_amount ?? 0)}
                    </div>
                  </div>

                  {/* Total Entries */}
                  <div className="bg-neutral-50/50 border border-neutral-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">Total Entries</span>
                    <div className="text-base font-bold text-neutral-800 tabular-nums">
                      {activeQr.stats?.total_entries ?? 0}
                    </div>
                  </div>
                </div>

                {/* Entry Status Breakdown */}
                <div className="bg-white border border-neutral-100 rounded-2xl p-4 space-y-2">
                  <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider block text-center">Entry Status Breakdown</span>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="space-y-0.5">
                      <div className="text-lg font-black text-amber-500 tabular-nums">
                        {activeQr.stats?.pending ?? 0}
                      </div>
                      <div className="text-[9px] font-bold text-neutral-400 tracking-widest uppercase">Pending</div>
                    </div>
                    <div className="space-y-0.5 border-x border-neutral-100">
                      <div className="text-lg font-black text-emerald-600 tabular-nums">
                        {activeQr.stats?.approved ?? 0}
                      </div>
                      <div className="text-[9px] font-bold text-neutral-400 tracking-widest uppercase">Approved</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-lg font-black text-rose-500 tabular-nums">
                        {activeQr.stats?.rejected ?? 0}
                      </div>
                      <div className="text-[9px] font-bold text-neutral-400 tracking-widest uppercase">Rejected</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12"><EmptyState>No active QR. Select one to add.</EmptyState></div>
          )}
        </div>
      </div>

      {/* QR Tracking History Section */}
      <div className="mfp-card p-6 mt-8">
        {/* Header & Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-black/5 pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <RefreshCw className="h-5 w-5 animate-spin-slow" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-800">QR Tracking History</h3>
              <p className="text-xs text-neutral-400">Track performance per activation period</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                className="mfp-input !pl-9 !py-1.5 text-xs bg-neutral-50/50"
                placeholder="Search QR..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>

            {/* Date Preset Filter */}
            <div className="relative w-full sm:w-44">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
              <select
                className="mfp-input !pl-9 !py-1.5 text-xs bg-white"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  if (e.target.value !== "custom") setCustomApplied(false);
                }}
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">Last 7 Days</option>
                <option value="this_month">Last 30 Days</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Date</option>
              </select>
            </div>

            {/* Export buttons */}
            <button
              onClick={exportCsv}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 font-semibold rounded-lg shadow-sm transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              onClick={exportPdf}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs text-white bg-rose-600 hover:bg-rose-700 font-semibold rounded-lg shadow-sm transition-all"
            >
              <FileDown className="h-3.5 w-3.5" /> PDF
            </button>
          </div>
        </div>

        {/* Custom Date Panel */}
        {dateFilter === "custom" && (
          <div className="flex flex-wrap items-end gap-3 p-3.5 mb-4 bg-neutral-50 rounded-2xl border border-black/5 animate-scaleUp">
            <div>
              <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">From Date</label>
              <input
                type="date"
                max={customTo}
                className="mfp-input !py-1.5 text-xs bg-white"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">To Date</label>
              <input
                type="date"
                min={customFrom}
                className="mfp-input !py-1.5 text-xs bg-white"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
            <button
              onClick={() => {
                setCustomApplied(true);
                fetchHistory("custom", customFrom, customTo);
              }}
              className="py-1.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all active:scale-95"
            >
              Apply Filter
            </button>
            {customApplied && (
              <span className="text-xs text-neutral-500 font-semibold pb-1.5">
                Showing {customFrom} → {customTo}
              </span>
            )}
          </div>
        )}

        {/* History Table */}
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-neutral-500 border-b border-black/5 text-[10px] font-bold uppercase tracking-wider">
                <th className="text-left py-3 px-4">QR Name / Info</th>
                <th className="text-center py-3 px-4">Status</th>
                <th className="text-center py-3 px-4">Entries</th>
                <th className="text-right py-3 px-4">Appr. Amount</th>
                <th className="text-center py-3 px-4">Breakdown (P/A/R)</th>
                <th className="text-right py-3 px-4 text-indigo-600">Admin</th>
                <th className="text-right py-3 px-4 text-purple-600">S.Dist</th>
                <th className="text-right py-3 px-4 text-amber-600">Dist.</th>
                <th className="text-right py-3 px-4 text-emerald-700">Total</th>
                <th className="text-center py-3 px-4">QR %</th>
                <th className="text-right py-3 px-4 text-rose-600">QR Profit</th>
                <th className="text-right py-3 px-4 text-indigo-700">Final Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {paginatedHistory.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-neutral-400">
                    No tracking records found matching the criteria.
                  </td>
                </tr>
              ) : (
                paginatedHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50/50 transition-colors">
                    {/* QR Name / Info */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-neutral-800 uppercase flex items-center gap-1.5 flex-wrap">
                        {item.label}
                        {item.is_t1 && (
                          <span className="text-[9px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-1 py-0.5 rounded uppercase tracking-wider">
                            T+1
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5 flex flex-col gap-0.5">
                        <span>{formatDate(item.activated_at)}</span>
                        {item.deactivated_at && <span>Closed: {formatDate(item.deactivated_at)}</span>}
                        {item.mobile_number && <span className="text-blue-500 font-semibold">{item.mobile_number}</span>}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${item.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-neutral-100 text-neutral-500'
                        }`}>
                        {item.status}
                      </span>
                    </td>

                    {/* Entries */}
                    <td className="py-3 px-4 text-center font-semibold text-neutral-700 tabular-nums">
                      {item.entries}
                    </td>

                    {/* Approved Amount */}
                    <td className="py-3 px-4 text-right font-extrabold text-emerald-600 tabular-nums">
                      {fmtMoney(item.approved_amount)}
                    </td>

                    {/* Breakdown */}
                    <td className="py-3 px-4 text-center text-[11px] font-bold tabular-nums">
                      <span className="text-amber-500">{item.breakdown.pending}</span>
                      <span className="text-neutral-300 mx-1">/</span>
                      <span className="text-emerald-600">{item.breakdown.approved}</span>
                      <span className="text-neutral-300 mx-1">/</span>
                      <span className="text-rose-500">{item.breakdown.rejected}</span>
                    </td>

                    {/* Admin Revenue */}
                    <td className="py-3 px-4 text-right font-semibold text-indigo-600 tabular-nums">
                      {fmtMoney(item.admin_revenue)}
                    </td>

                    {/* S.Dist Earnings */}
                    <td className="py-3 px-4 text-right font-semibold text-purple-600 tabular-nums">
                      {fmtMoney(item.md_earnings)}
                    </td>

                    {/* Dist Earnings */}
                    <td className="py-3 px-4 text-right font-semibold text-amber-600 tabular-nums">
                      {fmtMoney(item.dist_earnings)}
                    </td>

                    {/* Total Profit */}
                    <td className="py-3 px-4 text-right font-black text-emerald-700 tabular-nums">
                      {fmtMoney(item.total_profit)}
                    </td>

                    {/* QR % */}
                    <td className="py-3 px-4 text-center font-bold text-neutral-500 tabular-nums">
                      {editingHistoryId === item.id ? (
                        <div className="inline-flex items-center justify-center">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            className="w-16 px-1.5 py-0.5 text-xs font-extrabold border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center bg-white shadow-sm"
                            value={editPercentVal}
                            onChange={(e) => setEditPercentVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveHistoryPercent(item.id, editPercentVal);
                              if (e.key === "Escape") setEditingHistoryId(null);
                            }}
                            onBlur={() => handleSaveHistoryPercent(item.id, editPercentVal)}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center gap-1">
                          <span>{item.qr_percent}%</span>
                          {isSuperAdmin && (
                            <button
                              onClick={() => {
                                setEditingHistoryId(item.id);
                                setEditPercentVal(item.qr_percent?.toString() || "0");
                              }}
                              className="p-1 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                              title="Edit QR %"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* QR Profit */}
                    <td className="py-3 px-4 text-right font-extrabold text-rose-600 tabular-nums">
                      {fmtMoney(item.qr_profit)}
                    </td>

                    {/* Final Profit */}
                    <td className="py-3 px-4 text-right font-black text-indigo-700 tabular-nums">
                      {fmtMoney(item.final_profit)}
                    </td>
                  </tr>
                ))
              )}

              {/* Summary Row */}
              {filteredHistory.length > 0 && (
                <tr className="bg-neutral-50/70 border-t-2 border-neutral-200 font-extrabold text-neutral-800">
                  <td className="py-4 px-4 uppercase text-[10px] tracking-wider text-neutral-500">Summary</td>
                  <td className="py-4 px-4 text-center">—</td>
                  <td className="py-4 px-4 text-center tabular-nums">{totalEntries}</td>
                  <td className="py-4 px-4 text-right text-emerald-600 tabular-nums">{fmtMoney(totalApprovedAmount)}</td>
                  <td className="py-4 px-4 text-center text-[11px] tabular-nums">
                    <span className="text-amber-500">{totalPending}</span>
                    <span className="text-neutral-300 mx-1">/</span>
                    <span className="text-emerald-600">{totalApproved}</span>
                    <span className="text-neutral-300 mx-1">/</span>
                    <span className="text-rose-500">{totalRejected}</span>
                  </td>
                  <td className="py-4 px-4 text-right text-indigo-600 tabular-nums">{fmtMoney(totalAdminRevenue)}</td>
                  <td className="py-4 px-4 text-right text-purple-600 tabular-nums">{fmtMoney(totalMdEarnings)}</td>
                  <td className="py-4 px-4 text-right text-amber-600 tabular-nums">{fmtMoney(totalDistEarnings)}</td>
                  <td className="py-4 px-4 text-right text-emerald-700 tabular-nums">{fmtMoney(totalProfit)}</td>
                  <td className="py-4 px-4 text-center">—</td>
                  <td className="py-4 px-4 text-right text-rose-600 tabular-nums">{fmtMoney(totalQrProfit)}</td>
                  <td className="py-4 px-4 text-right text-indigo-700 tabular-nums">{fmtMoney(totalFinalProfit)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredHistory.length > historyPageSize && (
          <div className="flex items-center justify-between border-t border-black/5 pt-4 mt-5">
            <span className="text-xs text-neutral-500">
              Showing <span className="font-bold">{((historyPage - 1) * historyPageSize) + 1}</span> to{" "}
              <span className="font-bold">{Math.min(historyPage * historyPageSize, filteredHistory.length)}</span> of{" "}
              <span className="font-bold">{filteredHistory.length}</span> entries
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={historyPage === 1}
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs font-semibold bg-[#F4F3ED] hover:bg-[#E8E5D7] text-neutral-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed select-none transition-all active:scale-98"
              >
                Previous
              </button>
              <button
                disabled={historyPage * historyPageSize >= filteredHistory.length}
                onClick={() => setHistoryPage(p => p + 1)}
                className="px-3 py-1.5 text-xs font-semibold bg-[#F4F3ED] hover:bg-[#E8E5D7] text-neutral-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed select-none transition-all active:scale-98"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
