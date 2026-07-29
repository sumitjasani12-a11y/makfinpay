import React, { useEffect, useState } from "react";
import { api, fmtMoney, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import KycPasswordGate from "@/components/KycPasswordGate";
import { Wallet, QrCode, CreditCard, Clock, ChevronLeft, ChevronRight } from "lucide-react";

export default function AgentOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    wallet_balance: 0,
    qr_payment: 0,
    live_bill_payment: 0,
    pending_requests: 0
  });
  const [headlines, setHeadlines] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    if (user && user.kyc_status === "approved" && !user.first_login) {
      api.get("/agent/dashboard-stats")
        .then((r) => setStats(r.data))
        .catch((e) => console.log("Stats error ignored:", e.message));
      api.get("/headlines/active")
        .then((r) => setHeadlines(r.data || []))
        .catch((e) => console.log("Failed to fetch active headlines:", e.message));
    }
  }, [user]);

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
        <PageHeader title="Agent Dashboard" subtitle="Manage recharges, ledger history and wallet balance." />

        {/* Welcome greeting */}
        <div className="mb-6 animate-fadeIn">
          <h2 className="text-base font-black tracking-widest text-[#9d4edd] uppercase">
            {getGreeting()}
          </h2>
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
            <div className="bg-white border border-black/5 rounded-3xl overflow-hidden shadow-sm lg:col-span-4 relative h-auto min-h-[140px] group animate-fadeIn">
              <div
                className="flex transition-transform duration-500 ease-out h-full"
                style={{ transform: `translateX(-${activeImageIndex * 100}%)` }}
              >
                {imageMessages.map((path, idx) => (
                  <div key={idx} className="w-full h-full shrink-0 animate-fadeIn">
                    <img
                      src={fileUrl(path)}
                      alt={`Announcement Banner ${idx + 1}`}
                      className="h-full w-full object-cover"
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
            <div className="mfp-card p-6 lg:col-span-3 flex flex-col justify-center animate-fadeIn" data-testid="datetime-card">
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Today</div>
              <div className="mt-3 text-2xl sm:text-3xl font-medium tracking-tight text-[#1B4332]" data-testid="now-date">{dateStr}</div>
              <div className="mt-3 text-xs text-neutral-500">Live data updates instantly</div>
            </div>
          )}
        </div>
      </div>
    </KycPasswordGate>
  );
}
