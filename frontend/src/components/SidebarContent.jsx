import React from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import Logo from "./Logo";

const getIconColor = (label) => {
  const colors = {
    "Overview": "text-[#4CC9F0]", // Cyan
    "Dashboard": "text-[#4CC9F0]",
    "Master Distributors": "text-[#FFB703]", // Amber/Gold
    "Distributors": "text-[#FFB703]",
    "My Distributors": "text-[#FFB703]",
    "Agents": "text-[#F72585]", // Pink/Rose
    "My Agents": "text-[#F72585]",
    "Recharge Approvals": "text-[#06D6A0]", // Teal/Emerald
    "Recharge Activity": "text-[#06D6A0]",
    "Recharge Wallet": "text-[#06D6A0]",
    "QR Load Wallet": "text-[#00F5D4]", // Bright Cyan
    "Withdrawals": "text-[#FF5A5F]", // Soft Red
    "Withdrawal": "text-[#FF5A5F]",
    "Pay Withdrawal": "text-[#FF5A5F]",
    "Transactions": "text-[#FF9F1C]", // Orange
    "Transaction History": "text-[#FF9F1C]",
    "Live Bill History": "text-[#FFB703]", // Golden Amber
    "Credit Card Bill": "text-[#7209B7]", // Purple
    "Live Bill Pay": "text-[#3F37C9]", // Indigo
    "Wallet Ledger": "text-[#4895EF]", // Sky Blue
    "Account Statement": "text-[#4895EF]",
    "QR Codes": "text-[#00B4D8]", // Sky Blue
    "QR Name Entry": "text-[#00F5D4]", // Bright Cyan/Teal
    "QR Gallery": "text-[#FF007F]", // Neon Pink
    "Add Announcement": "text-[#EF476F]", // Bright Red
    "Commission": "text-[#F15BB5]", // Pink
    "Service Slabs": "text-[#2A9D8F]", // Dark Sage
    "Bank Entry": "text-[#E9D8A6]", // Soft Yellow
    "CC Billers": "text-[#7209B7]", // Purple
    "KYC Review": "text-[#EE9B00]", // Ochre
    "Reason Entry": "text-[#9B5DE5]", // Light Violet
    "Audit Logs": "text-[#90A955]", // Soft Green
    "Change Password": "text-[#DDA15E]", // Light Copper
    "Change MPIN": "text-[#FF70A6]", // Soft Salmon Pink
    "Manage TPIN": "text-[#70E000]", // Lime Green
    "Settings": "text-[#A8DADC]", // Pastel Blue
    "Rules & Policies": "text-[#FCA311]" // Tangerine
  };
  return colors[label] || "text-indigo-400";
};

export function SidebarContent({ user, items, onLogout, pendingCounts = {}, collapsed = false }) {
  const getBadgeCount = (label) => {
    if (label === "QR Approvals") return pendingCounts.recharges || 0;
    if (label === "CC Bill Request") return pendingCounts.transactions || 0;
    if (label === "KYC Requests") return pendingCounts.kyc || 0;
    if (label === "Pay Withdrawals") return pendingCounts.withdrawals || 0;
    return 0;
  };

  return (
    <>
      <Link
        to="#"
        onClick={(e) => {
          e.preventDefault();
          window.location.reload();
        }}
        className="h-20 flex items-center justify-center border-b border-white/5 select-none shrink-0 w-full px-2 overflow-hidden"
        data-testid="sidebar-logo"
        title="MAK FIN PAY"
      >
        <Logo
          variant="light"
          collapsed={collapsed}
          className={`w-full object-contain transition-all ${collapsed ? "h-7 w-7" : "h-10 scale-[1.75] translate-x-[4%]"}`}
        />
      </Link>
      
      <nav className={`flex-1 overflow-y-auto no-scrollbar ${collapsed ? "p-2.5 space-y-2" : "p-4 space-y-1.5"}`}>
        {items.map((it) => {
          const badgeCount = getBadgeCount(it.label);
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              title={collapsed ? it.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-xl transition-all font-bold ` +
                `${collapsed ? "justify-center p-2.5 relative " : "gap-3 px-3.5 py-2.5 text-[12.5px] tracking-wide "}` +
                `${isActive
                  ? "bg-white/10 text-white shadow-sm border border-white/5"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
                }`
              }
              data-testid={`nav-${it.label.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <it.icon className={`h-[18px] w-[18px] shrink-0 ${getIconColor(it.label)}`} strokeWidth={2.3} />
              {!collapsed && <span>{it.label}</span>}
              {badgeCount > 0 && (
                collapsed ? (
                  <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-rose-500 ring-1 ring-[#0F172A] animate-pulse" />
                ) : (
                  <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white animate-pulse">
                    {badgeCount}
                  </span>
                )
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className={`border-t border-white/5 bg-black/10 ${collapsed ? "p-2.5 flex flex-col items-center gap-3" : "p-4"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 mb-4 px-2"}`}>
          <div className="h-9 w-9 rounded-full bg-white/10 border border-white/10 text-white grid place-items-center font-bold text-sm shadow-inner shrink-0" title={`${user.full_name} (${user.email})`}>
            {(user.full_name || "?")[0].toUpperCase()}
          </div>
          {!collapsed && (
            <div className="leading-tight overflow-hidden">
              <div className="text-xs font-bold text-white truncate tracking-wide">{user.full_name}</div>
              <div className="text-[10px] text-neutral-300 truncate font-semibold mt-0.5">{user.email}</div>
            </div>
          )}
        </div>
        
        <button
          onClick={onLogout}
          title={collapsed ? "Sign out" : undefined}
          className={`flex items-center rounded-xl text-white/70 hover:bg-white/5 hover:text-white hover:text-rose-400 hover:bg-rose-500/5 transition-all select-none border border-transparent hover:border-rose-500/10 ${collapsed ? "justify-center p-2.5 w-full" : "w-full gap-3 px-3.5 py-2.5 text-[12.5px] font-bold tracking-wide"}`}
          data-testid="logout-btn"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-rose-400" strokeWidth={2.3} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );
}
