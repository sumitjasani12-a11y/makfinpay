import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Menu, Megaphone, ChevronLeft, ChevronRight } from "lucide-react";
import { NAV } from "./dashboardNav";
import { SidebarContent } from "./SidebarContent";
import Logo from "./Logo";
import { api, fmtMoney, fileUrl } from "@/lib/api";
import { useWebSocketListener } from "@/lib/ws";

const ROLE_LABELS = { master_distributor: "Master Distributor" };
export function roleLabel(r) { return ROLE_LABELS[r] || r; }

export default function DashboardLayout() {
  const { user, logout, branding } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const roleBaseRoute = user.role === "master_distributor" ? "/md" : `/${user.role}`;
  const isExcludedRole = user.role === "admin";

  const [limits, setLimits] = useState(null);
  const [collapsedSidebar, setCollapsedSidebar] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchLimits = () => {
      if (user.role !== "admin") {
        api.get("/settings/recharge-limits-public")
          .then((r) => setLimits(r.data))
          .catch((e) => console.log("Failed to fetch public limits:", e.message));
      }
    };
    fetchLimits();
    const interval = setInterval(fetchLimits, 30000);
    return () => clearInterval(interval);
  }, [user, location.pathname]);

  // Client-side URL route guard for restricted admins
  useEffect(() => {
    if (user && user.role === "admin" && user.email?.toLowerCase() !== "jigs.vanani@gmail.com") {
      const currentPath = location.pathname;
      if (currentPath.startsWith("/admin")) {
        const sub = currentPath === "/admin" || currentPath === "/admin/" ? "dashboard" : currentPath.replace("/admin/", "");
        const baseKey = sub.split("/")[0];
        const allowed = user.permissions;
        if (allowed !== null && allowed !== undefined) {
          if (!allowed.includes(baseKey)) {
            nav("/admin");
          }
        }
      }
    }
  }, [user, location.pathname, nav]);

  let items = NAV[user.role] || [];
  if (user.role === "admin" && user.email?.toLowerCase() !== "jigs.vanani@gmail.com") {
    const allowed = user.permissions;
    items = items.filter(it => {
      if (allowed !== null && allowed !== undefined) {
        const key = it.to === "/admin" ? "dashboard" : it.to.replace("/admin/", "");
        return allowed.includes(key);
      }
      return true;
    });
  } else if (!isExcludedRole && (user.first_login || user.kyc_status !== "approved")) {
    items = items.filter(it => it.to === roleBaseRoute);
  } else if (user.role === "agent" && limits) {
    items = items.filter(it => {
      if (it.to === "/agent/billpay" && !limits.bill_pay_enabled) return false;
      if (it.to === "/agent/live-billpay" && !limits.live_bill_enabled) return false;
      return true;
    });
  }

  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(null);
  const [earningsBalance, setEarningsBalance] = useState(null);
  const [t1Balance, setT1Balance] = useState(null);
  const [t1Total, setT1Total] = useState(null);
  const [bbpsBalance, setBbpsBalance] = useState(null);
  const [holdBalance, setHoldBalance] = useState(null);
  const [holdActive, setHoldActive] = useState(false);
  const [holdTotal, setHoldTotal] = useState(null);
  const [headlines, setHeadlines] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [pendingCounts, setPendingCounts] = useState({ recharges: 0, transactions: 0, kyc: 0, withdrawals: 0 });

  // Extract active image messages
  const imageMessages = useMemo(() => {
    return headlines.filter(h => h.type === "image").map(h => h.message);
  }, [headlines]);

  // Formatted date string for the header
  const headerDateStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }, []);

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

  // Fetch active headlines for marquee news sticker
  useEffect(() => {
    if (!user) return;
    const fetchHeadlines = () => {
      api.get("/headlines/active")
        .then((r) => setHeadlines(r.data || []))
        .catch((e) => console.log("Failed to fetch active headlines:", e.message));
    };
    fetchHeadlines();
    const interval = setInterval(fetchHeadlines, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // redirect to base overview page if not fully approved/setup
  useEffect(() => {
    if (!isExcludedRole && (user.first_login || user.kyc_status !== "approved")) {
      if (location.pathname !== roleBaseRoute) {
        nav(roleBaseRoute);
      }
    }
  }, [user, location.pathname, nav, isExcludedRole, roleBaseRoute]);

  const fetchWallet = useCallback(() => {
    if (!user) return;
    if (user.role !== "admin" && user.kyc_status === "approved" && !user.first_login) {
      api.get("/wallet")
        .then((r) => {
          setBalance(r.data.balance);
          setT1Balance(r.data.t1_balance);
          setHoldBalance(r.data.hold_balance);
          setHoldActive(r.data.hold_active);
        })
        .catch((e) => console.log("Failed to fetch header wallet:", e.message));

      if (user.role === "master_distributor") {
        api.get("/master-distributor/stats")
          .then((r) => setEarningsBalance(r.data.earnings ?? 0))
          .catch((e) => console.log("Failed to fetch MD header earnings:", e.message));
      } else if (user.role === "distributor") {
        api.get("/distributor/stats")
          .then((r) => setEarningsBalance(r.data.earnings ?? 0))
          .catch((e) => console.log("Failed to fetch Distributor header earnings:", e.message));
      }
    } else if (user.role === "admin") {
      Promise.allSettled([
        api.get("/admin/t1-total"),
        api.get("/admin/bbps-balance"),
        api.get("/admin/hold-total")
      ]).then(([t1Res, bbpsRes, holdRes]) => {
        const t1Total = t1Res.status === "fulfilled" ? t1Res.value.data?.total || 0 : 0;
        const rawBbps = bbpsRes.status === "fulfilled" ? bbpsRes.value.data : null;
        const bbpsBalance = rawBbps
          ? (typeof rawBbps.balance === "number" ? rawBbps.balance : (rawBbps.data?.balance || 0))
          : 0;
        const holdTotal = holdRes.status === "fulfilled" ? holdRes.value.data?.total || 0 : 0;

        setT1Total(t1Total);
        setBbpsBalance(bbpsBalance);
        setHoldTotal(holdTotal);
      });
    }
  }, [user]);

  const fetchPendingCounts = useCallback(() => {
    if (!user || user.role !== "admin") return;
    api.get("/admin/stats")
      .then((r) => {
        setPendingCounts({
          recharges: r.data.pending_recharges || 0,
          transactions: r.data.pending_transactions || 0,
          kyc: r.data.pending_kyc || 0,
          withdrawals: r.data.pending_withdrawals || 0
        });
      })
      .catch((e) => console.log("Failed to fetch pending counts:", e.message));
  }, [user]);

  // Unlock browser audio context on first user click or tap
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === "suspended") {
            ctx.resume();
          }
        }
      } catch (e) {}
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
    window.addEventListener("click", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  const playWebAudioChime = (isSuccess) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isSuccess) {
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(350, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch (e) {
      console.error("WebAudio error:", e);
    }
  };

  const playNotificationSound = (audioUrl, isSuccess = true) => {
    if (audioUrl) {
      try {
        const sound = new Audio(fileUrl(audioUrl));
        const playPromise = sound.play();
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            console.log("Custom audio playback deferred, playing fallback chime:", e);
            playWebAudioChime(isSuccess);
          });
        }
      } catch (e) {
        playWebAudioChime(isSuccess);
      }
    } else {
      playWebAudioChime(isSuccess);
    }
  };

  // Fetch wallet balance and pending counts on mount & every 10 seconds for instant updates
  useEffect(() => {
    fetchWallet();
    fetchPendingCounts();
    const interval = setInterval(() => {
      fetchWallet();
      fetchPendingCounts();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchWallet, fetchPendingCounts]);

  // Request browser notification permission for admins
  useEffect(() => {
    if (user?.role === "admin" && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  // Register WebSocket listeners to update balance & stats counts in real-time
  useWebSocketListener("recharge_created", (data) => {
    fetchPendingCounts();
    if (user?.role === "admin") {
      playNotificationSound(data?.audio_url, true);
      const amtStr = data?.amount ? `₹${Number(data.amount).toLocaleString()}` : "";
      const userStr = data?.user_name ? ` from ${data.user_name}` : "";
      toast.info(`🚨 New QR Request ${amtStr}${userStr}`, {
        duration: 8000,
        action: { label: "View", onClick: () => nav("/admin/recharges") }
      });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("🚨 New QR Request Received!", {
            body: `${amtStr}${userStr}`,
            icon: "/assets/makfinpay-favicon.png"
          });
        } catch (e) {}
      }
    }
  });

  useWebSocketListener("recharge_updated", (data) => {
    fetchWallet();
    fetchPendingCounts();
    if (data) {
      const isApproved = data.status === "approved";
      const statusTitle = isApproved ? "✅ QR Request Approved!" : "❌ QR Request Rejected!";
      if (data.audio_url) {
        playNotificationSound(data.audio_url, isApproved);
      }
      if (isApproved) {
        toast.success(statusTitle, { duration: 6000 });
      } else {
        toast.error(statusTitle, { duration: 6000 });
      }
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(statusTitle, {
            body: `Request ID: ${data.id}`,
            icon: "/assets/makfinpay-favicon.png"
          });
        } catch (e) {}
      }
    }
  });

  useWebSocketListener("kyc_submitted", () => {
    fetchPendingCounts();
    if (user?.role === "admin") {
      toast.info("📋 New KYC Request submitted!", {
        duration: 8000,
        action: { label: "View KYC", onClick: () => nav("/admin/kyc") }
      });
    }
  });

  useWebSocketListener("kyc_updated", () => {
    fetchWallet();
    fetchPendingCounts();
  });

  useWebSocketListener("cc_bill_created", (data) => {
    fetchWallet();
    fetchPendingCounts();
    if (user?.role === "admin") {
      playNotificationSound(data?.audio_url, true);
      const amtStr = data?.amount ? `₹${Number(data.amount).toLocaleString()}` : "";
      const userStr = data?.user_name ? ` from ${data.user_name}` : "";
      toast.info(`💳 New CC Bill Request ${amtStr}${userStr}`, {
        duration: 8000,
        action: { label: "View", onClick: () => nav("/admin/transactions") }
      });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("💳 New CC Bill Request!", {
            body: `${amtStr}${userStr}`,
            icon: "/assets/makfinpay-favicon.png"
          });
        } catch (e) {}
      }
    }
  });

  useWebSocketListener("cc_bill_updated", (data) => {
    fetchWallet();
    fetchPendingCounts();
    if (data) {
      const isSuccess = data.status === "success" || data.status === "approved";
      const statusTitle = isSuccess ? "✅ CC Bill Payment Approved!" : "❌ CC Bill Payment Reversed/Rejected!";
      if (data.audio_url) {
        playNotificationSound(data.audio_url, isSuccess);
      }
      if (isSuccess) {
        toast.success(statusTitle, { duration: 6000 });
      } else {
        toast.error(statusTitle, { duration: 6000 });
      }
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(statusTitle, {
            body: `Transaction ID: ${data.id}`,
            icon: "/assets/makfinpay-favicon.png"
          });
        } catch (e) {}
      }
    }
  });

  useWebSocketListener("withdrawal_created", (data) => {
    fetchWallet();
    fetchPendingCounts();
    if (user?.role === "admin") {
      playNotificationSound(data?.audio_url, true);
      const amtStr = data?.amount ? `₹${Number(data.amount).toLocaleString()}` : "";
      const userStr = data?.user_name ? ` from ${data.user_name}` : "";
      toast.info(`💸 New Withdrawal Request ${amtStr}${userStr}`, {
        duration: 8000,
        action: { label: "View", onClick: () => nav("/admin/withdrawals") }
      });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("💸 New Withdrawal Request!", {
            body: `${amtStr}${userStr}`,
            icon: "/assets/makfinpay-favicon.png"
          });
        } catch (e) {}
      }
    }
  });

  // Register custom window event listener for immediate updates from current page actions
  useEffect(() => {
    window.addEventListener("ws:wallet_update", fetchWallet);
    return () => {
      window.removeEventListener("ws:wallet_update", fetchWallet);
    };
  }, [fetchWallet]);

  // close drawer whenever route changes (mobile UX)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Desktop / tablet sidebar (≥ md) */}
      <aside className={`hidden md:flex ${collapsedSidebar ? "w-[72px]" : "w-64"} shrink-0 border-r border-white/5 bg-[#0F172A] text-white sticky top-0 h-screen flex-col transition-all duration-300`}>
        <SidebarContent user={user} items={items} onLogout={handleLogout} pendingCounts={pendingCounts} collapsed={collapsedSidebar} />
      </aside>

      {/* Mobile drawer (< md) */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} data-testid="mobile-drawer-overlay" />
      )}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-[#0F172A] text-white border-r border-white/5 flex flex-col transform transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}
        data-testid="mobile-drawer"
      >
        <SidebarContent user={user} items={items} onLogout={handleLogout} pendingCounts={pendingCounts} collapsed={false} />
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-16 px-4 sm:px-8 border-b border-black/5 flex items-center justify-between bg-white/80 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="mfp-btn-ghost p-2 -ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setOpen((prev) => !prev);
                } else {
                  setCollapsedSidebar((prev) => !prev);
                }
              }}
              data-testid="sidebar-menu-toggle"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5 text-neutral-700" />
            </button>
            <Logo variant="dark" size={38} className="md:hidden shrink-0 ml-1" />
            <div className="min-w-0">
              <div className="mfp-overline">Operator Console</div>
              <div className="text-sm font-medium capitalize truncate">{roleLabel(user.role)} Dashboard</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-sm text-neutral-600 animate-fadeIn">
            <span className="font-extrabold text-neutral-600 bg-neutral-100/70 border border-neutral-200/50 px-3.5 py-1 rounded-full text-xs shadow-sm select-none">
              {headerDateStr}
            </span>
            {balance !== null && (
              <span className="font-extrabold text-neutral-800 bg-[#E8F5E9] text-[#00966B] px-3.5 py-1 rounded-full text-xs flex items-center gap-1.5 border border-[#C8E6C9] shadow-sm transition-all" data-testid="header-balance">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00966B] animate-pulse" />
                Wallet: {fmtMoney(balance)}
              </span>
            )}
            {user.role === "agent" && t1Balance !== null && (
              <span className="font-extrabold text-neutral-800 bg-[#E3F2FD] text-[#1E88E5] px-3.5 py-1 rounded-full text-xs flex items-center gap-1.5 border border-[#BBDEFB] shadow-sm transition-all" data-testid="header-t1-balance">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E88E5] animate-pulse" />
                T+1 Wallet: {fmtMoney(t1Balance)}
              </span>
            )}
            {user.role === "agent" && holdBalance !== null && holdActive && (
              <span className="font-extrabold text-neutral-800 bg-[#FFEBEE] text-[#C81D11] px-3.5 py-1 rounded-full text-xs flex items-center gap-1.5 border border-[#FFCDD2] shadow-sm transition-all animate-pulse" data-testid="header-hold-balance">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C81D11]" />
                Hold Wallet: {fmtMoney(holdBalance)}
              </span>
            )}
            {user.role === "admin" && t1Total !== null && (
              <span className="font-extrabold text-neutral-800 bg-[#FFF3E0] text-[#E65100] px-3.5 py-1 rounded-full text-xs flex items-center gap-1.5 border border-[#FFE0B2] shadow-sm transition-all" data-testid="admin-header-t1-total">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E65100] animate-pulse" />
                T+1 Total: {fmtMoney(t1Total)}
              </span>
            )}
            {user.role === "admin" && bbpsBalance !== null && (
              <span className="font-extrabold text-neutral-800 bg-[#E8F5E9] text-[#00966B] px-3.5 py-1 rounded-full text-xs flex items-center gap-1.5 border border-[#C8E6C9] shadow-sm transition-all" data-testid="admin-header-bbps-balance">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00966B] animate-pulse" />
                Live BBPS Wallet: {fmtMoney(bbpsBalance)}
              </span>
            )}
            {user.role === "admin" && holdTotal !== null && holdTotal > 0 && (
              <span className="font-extrabold text-neutral-800 bg-[#FFEBEE] text-[#C81D11] px-3.5 py-1 rounded-full text-xs flex items-center gap-1.5 border border-[#FFCDD2] shadow-sm transition-all" data-testid="admin-header-hold-total">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C81D11] animate-pulse" />
                Hold Total: {fmtMoney(holdTotal)}
              </span>
            )}
            <span className="mfp-pill bg-[#E8E5D7] text-[#1B4332] capitalize">{roleLabel(user.role)}</span>
          </div>
        </header>
        {(() => {
          const textMessages = headlines.filter(h => h.type === "text" || !h.type).map(h => h.message);
          return (
            <>
              {/* TEXT HEADLINES MARQUEE */}
              {user.role !== "admin" && textMessages.length > 0 && (
                <div className="bg-[#FFF9E6] border-b border-amber-100 flex items-center overflow-hidden select-none h-10 relative">
                  <div
                    className="shrink-0 flex items-center gap-2 bg-[#CC5500] text-white pl-4 pr-7 h-full font-black uppercase text-[10px] tracking-wider relative"
                    style={{
                      clipPath: "polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)"
                    }}
                  >
                    <Megaphone className="h-3.5 w-3.5" />
                    <span>Announcements</span>
                  </div>
                  <marquee className="text-xs font-bold text-[#CC5500] self-center" scrollamount="3">
                    {textMessages.map(msg => `${msg} | `).join("     ")}
                  </marquee>
                </div>
              )}

              {/* MOBILE ONLY TOP WALLET BALANCE BAR */}
              <div className="md:hidden px-3 py-2 bg-white/95 backdrop-blur-md border-b border-black/5 flex items-center justify-between gap-2 shadow-2xs select-none animate-fadeIn">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 py-0.5 max-w-[70vw] sm:max-w-none">
                  {balance !== null && (
                    <span className="font-extrabold text-neutral-800 bg-[#E8F5E9] text-[#00966B] px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 border border-[#C8E6C9] shrink-0 whitespace-nowrap" data-testid="mobile-header-balance">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00966B] animate-pulse shrink-0" />
                      Wallet: {fmtMoney(balance)}
                    </span>
                  )}
                  {user.role === "agent" && t1Balance !== null && (
                    <span className="font-extrabold text-neutral-800 bg-[#E3F2FD] text-[#1E88E5] px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 border border-[#BBDEFB] shrink-0 whitespace-nowrap" data-testid="mobile-header-t1-balance">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1E88E5] animate-pulse shrink-0" />
                      T+1: {fmtMoney(t1Balance)}
                    </span>
                  )}
                  {user.role === "agent" && holdBalance !== null && holdActive && (
                    <span className="font-extrabold text-neutral-800 bg-[#FFEBEE] text-[#C81D11] px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 border border-[#FFCDD2] animate-pulse shrink-0 whitespace-nowrap" data-testid="mobile-header-hold-balance">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C81D11] shrink-0" />
                      Hold: {fmtMoney(holdBalance)}
                    </span>
                  )}
                  {user.role === "admin" && t1Total !== null && (
                    <span className="font-extrabold text-neutral-800 bg-[#FFF3E0] text-[#E65100] px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 border border-[#FFE0B2] shrink-0 whitespace-nowrap" data-testid="mobile-admin-header-t1-total">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E65100] animate-pulse shrink-0" />
                      T+1: {fmtMoney(t1Total)}
                    </span>
                  )}
                  {user.role === "admin" && bbpsBalance !== null && (
                    <span className="font-extrabold text-neutral-800 bg-[#E8F5E9] text-[#00966B] px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 border border-[#C8E6C9] shrink-0 whitespace-nowrap" data-testid="mobile-admin-header-bbps-balance">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00966B] animate-pulse shrink-0" />
                      Live BBPS: {fmtMoney(bbpsBalance)}
                    </span>
                  )}
                  {user.role === "admin" && holdTotal !== null && holdTotal > 0 && (
                    <span className="font-extrabold text-neutral-800 bg-[#FFEBEE] text-[#C81D11] px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 border border-[#FFCDD2] shrink-0 whitespace-nowrap" data-testid="mobile-admin-header-hold-total">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C81D11] animate-pulse shrink-0" />
                      Hold: {fmtMoney(holdTotal)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-auto pl-1 border-l border-black/5">
                  <span className="font-extrabold text-neutral-600 bg-neutral-100 border border-neutral-200/80 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                    {headerDateStr}
                  </span>
                  <span className="mfp-pill bg-[#E8E5D7] text-[#1B4332] capitalize text-[10px] px-2 py-0.5 whitespace-nowrap">{roleLabel(user.role)}</span>
                </div>
              </div>
            </>
          );
        })()}
        {(() => {
          const isLiveBillPath = location.pathname === "/agent/live-billpay";
          const isCcBillPath = location.pathname === "/agent/billpay";

          if (user && user.role === "agent" && (isLiveBillPath || isCcBillPath) && !limits) {
            return (
              <div className="flex h-screen items-center justify-center text-neutral-500 font-bold bg-[#F8F9FA]">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-7 w-7 animate-spin rounded-full border-4 border-solid border-indigo-600 border-t-transparent" />
                  <span>Verifying service authorization…</span>
                </div>
              </div>
            );
          }

          if (user && user.role === "agent" && isLiveBillPath && limits && !limits.live_bill_enabled) {
            return <Navigate to="/agent" replace />;
          }
          if (user && user.role === "agent" && isCcBillPath && limits && !limits.bill_pay_enabled) {
            return <Navigate to="/agent" replace />;
          }

          return (
            <div className="p-4 sm:p-6 lg:p-8 relative min-h-[calc(100vh-4rem)]">
              {user?.role !== "admin" && branding?.watermark_path && (
                <div
                  className="absolute inset-0 pointer-events-none opacity-[0.14] bg-no-repeat transition-all duration-300"
                  style={{
                    backgroundImage: `url(${fileUrl(branding.watermark_path)})`,
                    backgroundSize: "min(60vw, 540px)",
                    backgroundPosition: "38% 45%",
                  }}
                />
              )}
              <div className="relative z-10">
                <Outlet />
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
