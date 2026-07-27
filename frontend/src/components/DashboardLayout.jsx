import React, { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Menu, Megaphone } from "lucide-react";
import { NAV } from "./dashboardNav";
import { SidebarContent } from "./SidebarContent";
import Logo from "./Logo";
import { api, fmtMoney } from "@/lib/api";

const ROLE_LABELS = { master_distributor: "Master Distributor" };
export function roleLabel(r) { return ROLE_LABELS[r] || r; }

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const roleBaseRoute = user.role === "master_distributor" ? "/md" : `/${user.role}`;
  const isExcludedRole = user.role === "admin";
  let items = NAV[user.role] || [];
  if (!isExcludedRole && (user.first_login || user.kyc_status !== "approved")) {
    items = items.filter(it => it.to === roleBaseRoute);
  }
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(null);
  const [headlines, setHeadlines] = useState([]);

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

  // Fetch wallet balance on route change / page view
  useEffect(() => {
    if (user && user.role !== "admin" && user.kyc_status === "approved" && !user.first_login) {
      api.get("/wallet")
        .then((r) => setBalance(r.data.balance))
        .catch((e) => console.log("Failed to fetch header wallet:", e.message));
    }
  }, [user, location.pathname]);

  // close drawer whenever route changes (mobile UX)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  return (
    <div className="min-h-screen bg-[#FDFCF8] md:flex">
      {/* Desktop / tablet sidebar (≥ md) */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-black/5 bg-[#FDFCF8] sticky top-0 h-screen flex-col">
        <SidebarContent user={user} items={items} onLogout={handleLogout} />
      </aside>

      {/* Mobile drawer (< md) */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} data-testid="mobile-drawer-overlay" />
      )}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-[#FDFCF8] border-r border-black/5 flex flex-col transform transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}
        data-testid="mobile-drawer"
      >
        <SidebarContent user={user} items={items} onLogout={handleLogout} />
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-16 px-4 sm:px-8 border-b border-black/5 flex items-center justify-between bg-[#FDFCF8]/80 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden mfp-btn-ghost p-2 -ml-1 min-h-[44px] min-w-[44px]"
              onClick={() => setOpen(true)}
              data-testid="mobile-menu-toggle"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Logo variant="dark" size={28} className="md:hidden" />
            <div className="min-w-0">
              <div className="mfp-overline">Operator Console</div>
              <div className="text-sm font-medium capitalize truncate">{roleLabel(user.role)} Dashboard</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-600">
            {balance !== null && (
              <span className="font-extrabold text-neutral-800 bg-[#E8F5E9] text-[#00966B] px-3.5 py-1 rounded-full text-xs flex items-center gap-1.5 border border-[#C8E6C9] shadow-sm transition-all" data-testid="header-balance">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00966B] animate-pulse" />
                Wallet: {fmtMoney(balance)}
              </span>
            )}
            <span className="mfp-pill bg-[#E8E5D7] text-[#1B4332] capitalize">{roleLabel(user.role)}</span>
          </div>
        </header>
        {user.role !== "admin" && headlines.length > 0 && (
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
              {headlines.map(msg => `${msg} | `).join("     ")}
            </marquee>
          </div>
        )}
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
