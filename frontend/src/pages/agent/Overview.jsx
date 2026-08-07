import React, { useEffect, useState, useCallback } from "react";
import { api, fmtMoney, fileUrl } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import KycPasswordGate from "@/components/KycPasswordGate";
import { useWebSocketListener } from "@/lib/ws";
import { Wallet, QrCode, CreditCard, Clock, ChevronLeft, ChevronRight, Filter } from "lucide-react";

export default function AgentOverview() {
  const { user } = useAuth();
  const [rangeType, setRangeType] = useState("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [stats, setStats] = useState(() => {
    try {
      const v = localStorage.getItem("mfp_cache_agent_stats");
      return v ? JSON.parse(v) : { wallet_balance: 0, qr_payment: 0, live_bill_payment: 0, pending_requests: 0 };
    } catch {
      return { wallet_balance: 0, qr_payment: 0, live_bill_payment: 0, pending_requests: 0 };
    }
  });
  const [headlines, setHeadlines] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const fetchAgentStats = useCallback(() => {
    if (user && user.id && user.kyc_status === "approved" && !user.first_login) {
      let url = `/agent/dashboard-stats?range_type=${rangeType}`;
      if (rangeType === "custom") {
        if (fromDate) url += `&from_date=${fromDate}`;
        if (toDate) url += `&to_date=${toDate}`;
      }
      api.get(url)
        .then((r) => {
          setStats(r.data);
          try { localStorage.setItem("mfp_cache_agent_stats", JSON.stringify(r.data)); } catch (e) {}
        })
        .catch(() => {});
    }
  }, [user, rangeType, fromDate, toDate]);

  useEffect(() => {
    fetchAgentStats();
    if (user && user.kyc_status === "approved" && !user.first_login) {
      api.get("/headlines/active")
        .then((r) => setHeadlines(r.data || []))
        .catch((e) => console.log("Failed to fetch active headlines:", e.message));

      // Supabase Realtime WebSocket Listener for Instant UI Updates
      const supabase = getSupabase();
      if (supabase) {
        const channel = supabase
          .channel(`agent_stats_${user.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "recharges", filter: `user_id=eq.${user.id}` },
            () => fetchAgentStats()
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` },
            () => fetchAgentStats()
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    }
  }, [user, fetchAgentStats]);

  useWebSocketListener("recharge_created", fetchAgentStats);
  useWebSocketListener("recharge_updated", fetchAgentStats);
  useWebSocketListener("wallet_updated", fetchAgentStats);

  const imageMessages = React.useMemo(() => {
    return headlines.filter(h => h.type === "image").map(h => h.message);
  }, [headlines]);

  // Autoplay image headlines slider rotation
  useEffect(() => {
    if (imageMessages.length <= 1) {
      setActiveImageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setActiveImageIndex((prev) => (prev + 1) % imageMessages.length);
    }, 5000); // Rotate every 5 seconds
    return () => clearInterval(timer);
  }, [imageMessages]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const getGreeting = () => {
    const hr = now.getHours();
    const name = user?.full_name ? user.full_name.toUpperCase() : "USER";
    if (hr < 12) return `GOOD MORNING, ${name}`;
    if (hr < 17) return `GOOD AFTERNOON, ${name}`;
    return `GOOD EVENING, ${name}`;
  };

  return (
    <KycPasswordGate>
      <div className="overflow-x-hidden relative">
        {/* Premium Dashboard Header with Date Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 mt-2 animate-fadeIn">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-[#7209b7]/10 via-[#3f37c9]/10 to-[#4cc9f0]/10 border border-[#7209b7]/10 rounded-full shadow-[0_2px_10px_rgba(114,9,183,0.05)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7209b7] animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7209b7]">
                {getGreeting()}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight leading-none mt-3">
              Agent Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 font-bold tracking-wide">
              Manage recharges, ledger history and wallet balance.
            </p>
          </div>

          {/* Date Range Filter Dropdown */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 text-slate-700 font-extrabold text-xs px-2">
              <Filter className="h-4 w-4 text-[#7209b7]" />
              <span>Filter:</span>
            </div>

            <select
              value={rangeType}
              onChange={(e) => setRangeType(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7209b7]/20 cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="this_month">This Month</option>
              <option value="all_time">All Time</option>
              <option value="custom">Custom Date</option>
            </select>

            {rangeType === "custom" && (
              <div className="flex items-center gap-2 animate-fadeIn">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#7209b7]/20"
                />
                <span className="text-xs text-slate-400 font-bold">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#7209b7]/20"
                />
              </div>
            )}
          </div>
        </div>

        {/* Hero Section: Grid of 4 Cards + Slider Carousel */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 mb-8">
          {/* Grid of 4 Cards (Col Span 6) */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {/* Card 1: Total Balance */}
            <div className="bg-gradient-to-br from-[#0F5132] to-[#198754] text-white border border-emerald-500/20 rounded-2xl p-3.5 shadow-md flex items-center gap-3.5 h-[84px] relative overflow-hidden transition-all hover:shadow-lg animate-fadeIn">
              <div className="p-2.5 bg-white/10 text-emerald-300 border border-white/10 rounded-xl shrink-0">
                <Wallet className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] text-emerald-100/80 font-bold tracking-wider uppercase block truncate">
                  Total Balance
                </span>
                <span className="text-base font-black text-white mt-0.5 block truncate">
                  {fmtMoney(stats.wallet_balance)}
                </span>
              </div>
            </div>

            {/* Card 2: QR Payment */}
            <div className="bg-gradient-to-br from-[#0A3641] to-[#0D6EFD] text-white border border-blue-500/20 rounded-2xl p-3.5 shadow-md flex items-center gap-3.5 h-[84px] relative overflow-hidden transition-all hover:shadow-lg animate-fadeIn">
              <div className="p-2.5 bg-white/10 text-blue-300 border border-white/10 rounded-xl shrink-0">
                <QrCode className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] text-blue-100/80 font-bold tracking-wider uppercase block truncate">
                  QR Payment
                </span>
                <span className="text-base font-black text-white mt-0.5 block truncate">
                  {fmtMoney(stats.qr_payment)}
                </span>
              </div>
            </div>

            {/* Card 3: Live Bill Payment */}
            <div className="bg-gradient-to-br from-[#3B0066] to-[#6F42C1] text-white border border-purple-500/20 rounded-2xl p-3.5 shadow-md flex items-center gap-3.5 h-[84px] relative overflow-hidden transition-all hover:shadow-lg animate-fadeIn">
              <div className="p-2.5 bg-white/10 text-purple-300 border border-white/10 rounded-xl shrink-0">
                <CreditCard className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] text-purple-100/80 font-bold tracking-wider uppercase block truncate">
                  Live Bill Payment
                </span>
                <span className="text-base font-black text-white mt-0.5 block truncate">
                  {fmtMoney(stats.live_bill_payment)}
                </span>
              </div>
            </div>

            {/* Card 4: Pending Requests */}
            <div className="bg-gradient-to-br from-[#664D03] to-[#FD7E14] text-white border border-orange-500/20 rounded-2xl p-3.5 shadow-md flex items-center gap-3.5 h-[84px] relative overflow-hidden transition-all hover:shadow-lg animate-fadeIn">
              <div className="p-2.5 bg-white/10 text-orange-300 border border-white/10 rounded-xl shrink-0">
                <Clock className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] text-orange-100/80 font-bold tracking-wider uppercase block truncate">
                  Pending Requests
                </span>
                <span className="text-base font-black text-white mt-0.5 block truncate">
                  {stats.pending_requests}
                </span>
              </div>
            </div>
          </div>

          {/* Slider Carousel (Col Span 4) */}
          {imageMessages.length > 0 ? (
            <div className="bg-white border border-neutral-200/80 rounded-3xl overflow-hidden shadow-sm lg:col-span-4 relative h-[270px] max-h-[270px] flex items-center justify-center bg-neutral-900/5 group animate-fadeIn">
              <div
                className="flex transition-transform duration-500 ease-out h-full w-full items-center"
                style={{ transform: `translateX(-${activeImageIndex * 100}%)` }}
              >
                {imageMessages.map((path, idx) => (
                  <div key={idx} className="w-full h-[270px] shrink-0 animate-fadeIn flex items-center justify-center p-1.5">
                    <img
                      src={fileUrl(path)}
                      alt={`Announcement Banner ${idx + 1}`}
                      className="max-h-full max-w-full object-contain rounded-2xl shadow-xs"
                    />
                  </div>
                ))}
              </div>

              {/* Navigation Arrows */}
              {imageMessages.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveImageIndex((prev) => (prev === 0 ? imageMessages.length - 1 : prev - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setActiveImageIndex((prev) => (prev + 1) % imageMessages.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>

                  {/* Pagination Indicator Dots */}
                  <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {imageMessages.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImageIndex(idx)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          activeImageIndex === idx ? "bg-white w-3" : "bg-white/50"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="mfp-card p-6 lg:col-span-4 flex flex-col justify-center animate-fadeIn" data-testid="datetime-card">
              <div className="text-xs uppercase tracking-[0.2em] font-extrabold text-[#7209b7]">
                {rangeType === "today" && "Today"}
                {rangeType === "yesterday" && "Yesterday"}
                {rangeType === "last_7_days" && "Last 7 Days"}
                {rangeType === "last_30_days" && "Last 30 Days"}
                {rangeType === "this_month" && "This Month"}
                {rangeType === "all_time" && "All Time"}
                {rangeType === "custom" && "Custom Range"}
              </div>
              <div className="mt-3 text-xl sm:text-2xl font-black tracking-tight text-[#1B4332]" data-testid="now-date">
                {rangeType === "today" && dateStr}
                {rangeType === "yesterday" && new Date(Date.now() - 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {rangeType === "last_7_days" && "Last 7 Days Summary"}
                {rangeType === "last_30_days" && "Last 30 Days Summary"}
                {rangeType === "this_month" && new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                {rangeType === "all_time" && "All Time Summary"}
                {rangeType === "custom" && (fromDate && toDate ? `${fromDate} to ${toDate}` : "Select Custom Dates")}
              </div>
              <div className="mt-3 text-xs text-neutral-500 font-medium">Filtered data updates instantly</div>
            </div>
          )}
        </div>
      </div>
    </KycPasswordGate>
  );
}
