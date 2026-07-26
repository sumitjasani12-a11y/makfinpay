import React from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import Logo from "./Logo";

/**
 * Sidebar content shared between the desktop (≥md) sticky aside
 * and the mobile (<md) slide-in drawer.
 *
 * Kept presentational so DashboardLayout can focus on layout/drawer state.
 */
export function SidebarContent({ user, items, onLogout }) {
  return (
    <>
      <Link to="/" className="px-6 h-16 flex items-center gap-2 border-b border-black/5" data-testid="sidebar-logo">
        <Logo variant="dark" size={36} />
        <div className="leading-tight">
          <div className="text-sm font-semibold">MAK FIN PAY</div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-neutral-500">{(user.role || "").replace("_", " ")}</div>
        </div>
      </Link>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {items.map((it) => (
          <NavLink
            key={it.to} to={it.to} end={it.end}
            className={({ isActive }) => `sidebar-link min-h-[44px] ${isActive ? "active" : ""}`}
            data-testid={`nav-${it.label.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <it.icon className="h-4 w-4" strokeWidth={1.7} /> {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-black/5 p-4">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="h-9 w-9 rounded-full bg-[#E8E5D7] text-[#1B4332] grid place-items-center font-semibold">
            {(user.full_name || "?")[0].toUpperCase()}
          </div>
          <div className="leading-tight overflow-hidden">
            <div className="text-sm font-medium truncate">{user.full_name}</div>
            <div className="text-xs text-neutral-500 truncate">{user.email}</div>
          </div>
        </div>
        <button onClick={onLogout} className="mfp-btn-ghost w-full justify-start min-h-[44px]" data-testid="logout-btn">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </>
  );
}
