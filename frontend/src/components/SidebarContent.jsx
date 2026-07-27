import React from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import Logo from "./Logo";

const getIconBgColor = (label) => {
  const colors = {
    "Overview": "bg-[#4361EE]",
    "Dashboard": "bg-[#4361EE]",
    "Master Distributors": "bg-[#7209B7]",
    "Distributors": "bg-[#3A0CA3]",
    "My Distributors": "bg-[#7209B7]",
    "Agents": "bg-[#F72585]",
    "My Agents": "bg-[#F72585]",
    "Recharge Approvals": "bg-[#06D6A0]",
    "Recharge Activity": "bg-[#06D6A0]",
    "Recharge Wallet": "bg-[#06D6A0]",
    "Withdrawals": "bg-[#EF476F]",
    "Withdrawal": "bg-[#EF476F]",
    "Transactions": "bg-[#FF9F1C]",
    "Transaction History": "bg-[#FF9F1C]",
    "Credit Card Bill": "bg-[#3F37C9]",
    "Wallet Ledger": "bg-[#4CC9F0]",
    "QR Codes": "bg-[#00B4D8]",
    "QR Name Entry": "bg-[#0077B6]",
    "QR Gallery": "bg-[#7209B7]",
    "Add Announcement": "bg-[#E63946]",
    "Commission": "bg-[#F15BB5]",
    "Service Slabs": "bg-[#2A9D8F]",
    "Bank Entry": "bg-[#FFB703]",
    "KYC Review": "bg-[#E76F51]",
    "Reason Entry": "bg-[#6A0DAD]",
    "Audit Logs": "bg-[#588157]",
    "Backup & Restore": "bg-[#3A5A40]",
    "Change Password": "bg-[#9A8C98]",
    "Settings": "bg-[#DDA15E]",
    "Rules & Policies": "bg-[#8338EC]"
  };
  return colors[label] || "bg-indigo-500";
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
              `flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all font-bold text-xs tracking-wider uppercase ` +
              `${isActive
                ? "bg-white/10 text-white shadow-sm border border-white/5"
                : "text-white/70 hover:bg-white/5 hover:text-white"
              }`
            }
            data-testid={`nav-${it.label.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <div className={`p-1.5 rounded-lg text-white shadow-sm shrink-0 flex items-center justify-center ${getIconBgColor(it.label)}`}>
              <it.icon className="h-3.5 w-3.5" strokeWidth={2.5} />
            </div>
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
            <div className="text-xs font-bold text-white truncate uppercase tracking-wider">{user.full_name}</div>
            <div className="text-[10px] text-neutral-300 truncate font-semibold mt-0.5">{user.email}</div>
          </div>
        </div>
        
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold text-white/70 hover:bg-white/5 hover:text-white hover:text-rose-400 hover:bg-rose-500/5 transition-all select-none border border-transparent hover:border-rose-500/10 uppercase tracking-wider"
          data-testid="logout-btn"
        >
          <div className="p-1.5 rounded-lg bg-white/5 text-white shrink-0 flex items-center justify-center group-hover:bg-rose-500/10 transition-colors">
            <LogOut className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}
