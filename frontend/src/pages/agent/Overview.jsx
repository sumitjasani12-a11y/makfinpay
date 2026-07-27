import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtMoney, fmtDate, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import KycPasswordGate from "@/components/KycPasswordGate";
import { Wallet, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

export default function AgentOverview() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [headlines, setHeadlines] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    if (user && user.kyc_status === "approved" && !user.first_login) {
      api.get("/wallet")
        .then((r) => setBalance(r.data.balance || 0))
        .catch((e) => console.log("Wallet ignored:", e.message));
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

  return (
    <KycPasswordGate>
      <div className="overflow-x-hidden relative">
        <PageHeader title="Agent Dashboard" subtitle="Manage recharges, ledger history and wallet balance." />

        {/* Two-column hero: wallet (70%) + date/time (30%) */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 mb-5">
          <div className="mfp-card p-8 !bg-[#1B4332] text-white relative overflow-hidden lg:col-span-7" data-testid="wallet-hero">
            <div className="text-xs uppercase tracking-[0.2em] text-white/80">Wallet Balance</div>
            <div className="mt-4 text-4xl sm:text-5xl font-medium tracking-tight text-white" data-testid="wallet-balance">
              {fmtMoney(balance)}
            </div>
            <Wallet className="absolute -right-8 -bottom-8 h-44 w-44 text-white/5" />
          </div>
          {imageMessages.length > 0 ? (
            <div className="bg-white border border-black/5 rounded-3xl overflow-hidden shadow-sm lg:col-span-3 relative h-40 lg:h-auto min-h-[140px] group animate-fadeIn">
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
