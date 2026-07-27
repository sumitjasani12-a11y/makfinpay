import React from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import Logo from "./Logo";

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
            <it.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
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
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}
