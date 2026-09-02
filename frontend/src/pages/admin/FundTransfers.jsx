import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { api, formatErr, fmtDate } from "@/lib/api";
import { DATE_RANGES, todayStr, rangeWindowIso } from "@/lib/filters";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable } from "@/components/Shared";
import { toast } from "sonner";
import {
  RotateCcw, Search, X, Calendar, ChevronDown, Send, Crown, Users, UserCog,
  TrendingUp, Clock, DollarSign, Filter, Check, Loader2
} from "lucide-react";

// --- Date Range Dropdown Filter Component ---
function DateRangeDropdown({ range, setRange, from, setFrom, to, setTo, customApplied, setCustomApplied, applyCustom }) {
  const [isOpen, setIsOpen] = useState(false);

  const activeLabel = useMemo(() => {
    if (range === "custom" && customApplied) {
      return `${from} to ${to}`;
    }
    const match = DATE_RANGES.find(r => r.key === range);
    return match ? match.label : "Select Date";
  }, [range, customApplied, from, to]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 bg-white border border-neutral-200/80 hover:border-[#1B4332]/30 px-3.5 py-2.5 rounded-xl text-xs font-bold text-neutral-700 shadow-sm transition-all"
      >
        <Calendar className="h-4 w-4 text-[#1B4332]" />
        <span>{activeLabel}</span>
        <ChevronDown className="h-3 w-3 text-neutral-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-white border border-neutral-200 rounded-2xl shadow-xl p-3 z-50 animate-fadeIn space-y-3">
            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">
              Select Timeframe
            </div>
            <div className="space-y-1">
              {DATE_RANGES.map((r) => {
                const active = range === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => {
                      setRange(r.key);
                      if (r.key !== "custom") {
                        setCustomApplied(false);
                        setIsOpen(false);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? "bg-[#E8F5E9] text-[#1B4332]"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {range === "custom" && (
              <div className="border-t border-neutral-100 pt-3 space-y-2 px-1">
                <div>
                  <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">From</label>
                  <input
                    type="date"
                    max={to}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs outline-none focus:border-[#1B4332]/40"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">To</label>
                  <input
                    type="date"
                    min={from}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs outline-none focus:border-[#1B4332]/40"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => {
                    applyCustom();
                    setIsOpen(false);
                  }}
                  className="w-full py-1.5 bg-[#1B4332] text-white rounded-lg text-xs font-bold hover:bg-[#153527] transition-all"
                >
                  Apply Custom Range
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Auto-Searchable MS/DS Dropdown Component ---
function SearchableUserDropdown({ senders, selectedSenderId, onSelectSender }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  const selectedUser = useMemo(() => {
    if (!selectedSenderId || selectedSenderId === "all") return null;
    return senders.find((s) => s.id === selectedSenderId);
  }, [senders, selectedSenderId]);

  const filteredSenders = useMemo(() => {
    if (!search.trim()) return senders;
    const q = search.toLowerCase().trim();
    return senders.filter((s) => {
      const name = (s.full_name || "").toLowerCase();
      const email = (s.email || "").toLowerCase();
      const phone = (s.phone || "").toLowerCase();
      const firm = (s.firm_name || "").toLowerCase();
      const role = s.role === "master_distributor" ? "ms master" : "ds distributor";
      return name.includes(q) || email.includes(q) || phone.includes(q) || firm.includes(q) || role.includes(q);
    });
  }, [senders, search]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className="relative min-w-[220px]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full inline-flex items-center justify-between gap-2 bg-white border border-neutral-200/80 hover:border-[#1B4332]/30 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-neutral-700 shadow-sm transition-all"
      >
        <span className="truncate flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-[#1B4332] shrink-0" />
          {selectedUser ? (
            <span className="font-bold text-neutral-800">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-black mr-1 ${
                selectedUser.role === "master_distributor" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
              }`}>
                {selectedUser.role === "master_distributor" ? "MS" : "DS"}
              </span>
              {selectedUser.full_name}
            </span>
          ) : (
            <span className="text-neutral-500 font-medium">All MS & DS Users</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-2 w-72 sm:w-80 bg-white border border-neutral-200 rounded-2xl shadow-2xl p-2.5 z-50 animate-fadeIn space-y-2">
            {/* Search input field inside dropdown */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search MS/DS by name, phone, email..."
                className="w-full pl-9 pr-8 py-2 border border-neutral-200 rounded-xl text-xs outline-none focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332]"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* List options */}
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              <button
                onClick={() => {
                  onSelectSender("all");
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-all ${
                  !selectedSenderId || selectedSenderId === "all"
                    ? "bg-[#E8F5E9] text-[#1B4332] font-bold"
                    : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <span>All MS & DS Users</span>
                {(!selectedSenderId || selectedSenderId === "all") && <Check className="h-3.5 w-3.5 text-[#1B4332]" />}
              </button>

              {filteredSenders.length === 0 ? (
                <div className="py-4 text-center text-xs text-neutral-400 font-medium">
                  No MS or DS found matching "{search}"
                </div>
              ) : (
                filteredSenders.map((s) => {
                  const isSelected = selectedSenderId === s.id;
                  const isMS = s.role === "master_distributor";
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        onSelectSender(s.id);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? "bg-[#E8F5E9] border border-[#1B4332]/20 text-[#1B4332]"
                          : "hover:bg-neutral-50 border border-transparent"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                            isMS ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                          }`}>
                            {isMS ? "MS" : "DS"}
                          </span>
                          <span className="font-bold text-neutral-800 truncate">{s.full_name}</span>
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
                          {s.phone} {s.email ? `• ${s.email}` : ""} {s.firm_name ? `(${s.firm_name})` : ""}
                        </div>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-[#1B4332] shrink-0 mt-1" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminFundTransfers() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    today_amount: 0, today_count: 0,
    yesterday_amount: 0, yesterday_count: 0,
    this_month_amount: 0, this_month_count: 0,
    all_time_amount: 0, all_time_count: 0,
    filtered_amount: 0, filtered_count: 0
  });
  const [loading, setLoading] = useState(false);

  const [senders, setSenders] = useState([]);
  const [selectedSenderId, setSelectedSenderId] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);
  const [range, setRange] = useState("this_month");
  const [from, setFrom] = useState(todayStr(-30));
  const [to, setTo] = useState(todayStr());
  const [customApplied, setCustomApplied] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Load MS/DS user list for auto-searchable dropdown
  useEffect(() => {
    api.get("/admin/fund-transfer-senders")
      .then((r) => setSenders(r.data || []))
      .catch(() => {});
  }, []);

  const params = useMemo(() => {
    const { from_ts, to_ts } = range === "custom" && !customApplied
      ? { from_ts: null, to_ts: null }
      : rangeWindowIso(range, from, to);
    const p = { page, page_size: pageSize };
    if (from_ts) p.from_ts = from_ts;
    if (to_ts) p.to_ts = to_ts;
    if (roleFilter !== "all") p.role = roleFilter;
    if (selectedSenderId && selectedSenderId !== "all") p.sender_id = selectedSenderId;
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    return p;
  }, [range, from, to, customApplied, roleFilter, selectedSenderId, debouncedQ, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    return api.get("/admin/fund-transfers", { params })
      .then((r) => {
        setItems(r.data.items || []);
        setTotal(r.data.total || 0);
        if (r.data.stats) setStats(r.data.stats);
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load fund transfers"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [range, from, to, customApplied, roleFilter, selectedSenderId, debouncedQ, pageSize]);

  const clearAll = () => {
    setQ("");
    setRange("this_month");
    setFrom(todayStr(-30));
    setTo(todayStr());
    setCustomApplied(false);
    setRoleFilter("all");
    setSelectedSenderId("all");
    setPage(1);
  };

  const applyCustom = () => {
    if (!from || !to) return toast.error("Pick both From and To dates");
    if (from > to) return toast.error("From date cannot be after To date");
    setCustomApplied(true);
  };

  const columns = [
    {
      key: "created_at",
      label: "Date & Time",
      render: (row) => (
        <div>
          <div className="font-semibold text-neutral-800 text-xs">{fmtDate(row.created_at)}</div>
          <div className="text-[10px] text-neutral-400 font-mono mt-0.5">ID: {row.id?.slice(0, 8)}…</div>
        </div>
      ),
    },
    {
      key: "sender_name",
      label: "Sender (MS / DS)",
      render: (row) => {
        const isMS = row.sender_role === "master_distributor";
        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                isMS ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
              }`}>
                {isMS ? <Crown className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
                {isMS ? "Master Dist." : "Distributor"}
              </span>
              <span className="font-bold text-neutral-900 text-xs">{row.sender_name}</span>
            </div>
            <div className="text-[10px] text-neutral-500 flex items-center gap-2">
              <span>{row.sender_phone}</span>
              {row.sender_firm && <span className="text-neutral-400">({row.sender_firm})</span>}
            </div>
          </div>
        );
      },
    },
    {
      key: "recipient_name",
      label: "Recipient (Downline)",
      render: (row) => {
        const isDS = row.recipient_role === "distributor";
        const isAgent = row.recipient_role === "agent";
        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                isDS ? "bg-blue-100 text-blue-800" : isAgent ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-700"
              }`}>
                {isDS ? <Users className="h-2.5 w-2.5" /> : <UserCog className="h-2.5 w-2.5" />}
                {isDS ? "Distributor" : isAgent ? "Agent" : row.recipient_role || "User"}
              </span>
              <span className="font-bold text-neutral-900 text-xs">{row.recipient_name}</span>
            </div>
            <div className="text-[10px] text-neutral-500 flex items-center gap-2">
              <span>{row.recipient_phone}</span>
              {row.recipient_firm && <span className="text-neutral-400">({row.recipient_firm})</span>}
            </div>
          </div>
        );
      },
    },
    {
      key: "amount",
      label: "Amount (₹)",
      render: (row) => (
        <div>
          <div className="text-sm font-black text-emerald-700">
            ₹{row.amount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-neutral-400 font-medium">
            Sender Bal: ₹{row.sender_balance_after?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>
      ),
    },
    {
      key: "note",
      label: "Remarks / Note",
      render: (row) => (
        <div className="text-xs text-neutral-600 max-w-xs truncate" title={row.note}>
          {row.note || "Fund Transfer"}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fund Transfer Entry"
        subtitle="Comprehensive record of all downline fund transfers performed by Master Distributors and Distributors."
      />

      {/* Top Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Today Card */}
        <div className="mfp-card p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Today</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-black text-emerald-900">
            ₹{stats.today_amount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 mt-0.5">
            {stats.today_count} transfers
          </div>
        </div>

        {/* Yesterday Card */}
        <div className="mfp-card p-4 bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Yesterday</span>
            <RotateCcw className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-black text-blue-900">
            ₹{stats.yesterday_amount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-medium text-blue-600 mt-0.5">
            {stats.yesterday_count} transfers
          </div>
        </div>

        {/* This Month Card */}
        <div className="mfp-card p-4 bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">This Month</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-black text-amber-900">
            ₹{stats.this_month_amount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-medium text-amber-600 mt-0.5">
            {stats.this_month_count} transfers
          </div>
        </div>

        {/* Lifetime Card */}
        <div className="mfp-card p-4 bg-gradient-to-br from-purple-50 to-white border-purple-100">
          <div className="flex items-center justify-between text-purple-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">All Time</span>
            <DollarSign className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-black text-purple-900">
            ₹{stats.all_time_amount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-medium text-purple-600 mt-0.5">
            {stats.all_time_count} transfers
          </div>
        </div>

        {/* Filtered Selection Card */}
        <div className="mfp-card p-4 bg-gradient-to-br from-[#E8F5E9] to-white border-[#1B4332]/20 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-[#1B4332]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Filtered Total</span>
            <Send className="h-4 w-4 text-[#1B4332]" />
          </div>
          <div className="mt-2 text-xl font-black text-[#1B4332]">
            ₹{stats.filtered_amount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-medium text-[#1B4332]/75 mt-0.5">
            {stats.filtered_count} matching entries
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="mfp-card p-4 space-y-4 relative z-30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left Controls: Search Bar & Auto-Searchable MS/DS Dropdown */}
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Text Search */}
            <div className="relative min-w-[200px] flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search name, phone, transfer ID, note..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-10 pr-9 py-2 border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332] shadow-sm"
              />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Auto-Searchable MS/DS Dropdown */}
            <SearchableUserDropdown
              senders={senders}
              selectedSenderId={selectedSenderId}
              onSelectSender={setSelectedSenderId}
            />
          </div>

          {/* Right Controls: Role Filter Pills & Date Range Picker */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Role Filter Tabs */}
            <div className="inline-flex p-1 bg-neutral-100 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setRoleFilter("all")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  roleFilter === "all" ? "bg-white text-[#1B4332] shadow-sm font-bold" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                All Roles
              </button>
              <button
                onClick={() => setRoleFilter("master_distributor")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  roleFilter === "master_distributor" ? "bg-white text-amber-800 shadow-sm font-bold" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                <Crown className="h-3 w-3 text-amber-600" /> MS
              </button>
              <button
                onClick={() => setRoleFilter("distributor")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  roleFilter === "distributor" ? "bg-white text-blue-800 shadow-sm font-bold" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                <Users className="h-3 w-3 text-blue-600" /> DS
              </button>
            </div>

            {/* Date Range Picker */}
            <DateRangeDropdown
              range={range} setRange={setRange}
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              customApplied={customApplied} setCustomApplied={setCustomApplied}
              applyCustom={applyCustom}
            />

            {/* Clear Filters Button */}
            {(q || selectedSenderId !== "all" || roleFilter !== "all" || range !== "this_month") && (
              <button
                onClick={clearAll}
                className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-bold transition-all flex items-center gap-1"
                title="Reset all filters"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Component */}
      <DataTable
        columns={columns}
        rows={items}
        empty={loading ? <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 font-medium"><Loader2 className="h-5 w-5 animate-spin text-[#1B4332]" /></div> : "No fund transfer entries found matching the selected filters."}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
        }}
      />
    </div>
  );
}
