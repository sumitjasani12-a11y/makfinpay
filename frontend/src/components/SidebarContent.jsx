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
    "KYC Review": "text-[#EE9B00]", // Ochre
    "Reason Entry": "text-[#9B5DE5]", // Light Violet
    "Audit Logs": "text-[#90A955]", // Soft Green
    "Backup & Restore": "text-[#B5E2FA]", // Ice Blue
    "Change Password": "text-[#DDA15E]", // Light Copper
    "Change MPIN": "text-[#FF70A6]", // Soft Salmon Pink
    "Manage TPIN": "text-[#70E000]", // Lime Green
    "Settings": "text-[#A8DADC]", // Pastel Blue
    "Rules & Policies": "text-[#FCA311]" // Tangerine
  };
  return colors[label] || "text-indigo-400";
};

export function SidebarContent({ user, items, onLogout }) {
  return (
    <>
      <Link
        to="/"
        className="px-6 h-16 flex items-center gap-2.5 border-b border-white/5 select-none shrink-0"
        data-testid="sidebar-logo"
      >
        <Logo variant="light" size={32} />
        <div className="leading-tight">
          <div className="text-sm font-black tracking-wide text-white">MAK FIN PAY</div>
          <div className="text-[9px] tracking-[0.2em] font-black uppercase text-neutral-300 mt-0.5">
            {(user.role || "").replace("_", " ")}
          </div>
        </div>
      </Link>
      
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto no-scrollbar">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-[12.5px] tracking-wide ` +
              `${isActive
                ? "bg-white/10 text-white shadow-sm border border-white/5"
                : "text-white/70 hover:bg-white/5 hover:text-white"
              }`
            }
            data-testid={`nav-${it.label.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <it.icon className={`h-[18px] w-[18px] shrink-0 ${getIconColor(it.label)}`} strokeWidth={2.3} />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/5 p-4 bg-black/10">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="h-9 w-9 rounded-full bg-white/10 border border-white/10 text-white grid place-items-center font-bold text-sm shadow-inner">
            {(user.full_name || "?")[0].toUpperCase()}
          </div>
          <div className="leading-tight overflow-hidden">
            <div className="text-xs font-bold text-white truncate tracking-wide">{user.full_name}</div>
            <div className="text-[10px] text-neutral-300 truncate font-semibold mt-0.5">{user.email}</div>
          </div>
        </div>
        
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[12.5px] font-bold text-white/70 hover:bg-white/5 hover:text-white hover:text-rose-400 hover:bg-rose-500/5 transition-all select-none border border-transparent hover:border-rose-500/10 tracking-wide"
          data-testid="logout-btn"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-rose-400" strokeWidth={2.3} />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}
