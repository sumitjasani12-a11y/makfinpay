import React, { useEffect, useState, useMemo } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { toast } from "sonner";
import { Check, X, PencilLine, Percent, ShieldCheck, Users, UserCheck, Coins, HelpCircle, Loader2, Search } from "lucide-react";

function ModeToggle({ mode, onChange }) {
  // mode = 'default' | 'custom'
  return (
    <div className="inline-flex rounded-full bg-neutral-100 p-0.5 border border-neutral-200/40" role="tablist">
      {[
        { key: "default", label: "Default" },
        { key: "custom", label: "Custom" },
      ].map((opt) => {
        const active = mode === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all duration-200 ${active ? "bg-[#1B4332] text-white shadow-sm" : "text-neutral-500 hover:text-[#1B4332]"}`}
            data-testid={`mode-${opt.key}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CommissionRow({ row, kind, defaultPct, onChanged }) {
  const isDefault = row.commission_type === "default";
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(row.commission_percent ?? 0));
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => { setVal(String(row.commission_percent ?? 0)); }, [row.commission_percent]);

  const cancelEdit = () => {
    setEditing(false);
    setVal(String(row.commission_percent ?? 0));
  };

  const saveCustom = async () => {
    const pct = parseFloat(val);
    if (Number.isNaN(pct) || pct < 0) return toast.error("Commission must be ≥ 0");
    try {
      await api.patch(`/admin/users/${row.id}/commission`, { commission_percent: pct });
      toast.success(isDefault ? "Switched to Custom" : "Commission updated");
      setEditing(false);
      onChanged();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const resetToDefault = async () => {
    try {
      await api.patch(`/admin/users/${row.id}/commission/reset`);
      toast.success("Reset to default");
      setConfirmReset(false);
      onChanged();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const onModeChange = (newMode) => {
    if (newMode === row.commission_type && !editing) return;
    if (newMode === "default" && row.commission_type === "custom") {
      setConfirmReset(true);
      return;
    }
    if (newMode === "custom" && row.commission_type === "default") {
      // open inline editor pre-filled with current default value
      setVal(String(defaultPct));
      setEditing(true);
      return;
    }
  };

  return (
    <>
      <tr>
        <td className="px-4 py-3 text-sm">{row.full_name}</td>
        <td className="px-4 py-3 text-sm">{row.email}</td>
        <td className="px-4 py-3 text-sm">{row.phone}</td>
        <td className="px-4 py-3 text-sm">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number" min="0" step="0.01"
                value={val} onChange={(e) => setVal(e.target.value)}
                className="mfp-input !py-1 !px-2 w-24 text-sm"
                data-testid={`row-input-${row.id}`}
                autoFocus
              />
              <span className="text-xs text-neutral-500">%</span>
              <button onClick={saveCustom} className="rounded-md bg-[#2D6A4F] hover:bg-[#1B4332] text-white p-1.5" data-testid={`row-save-${row.id}`}><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelEdit} className="rounded-md bg-neutral-200 hover:bg-neutral-300 text-neutral-700 p-1.5" data-testid={`row-cancel-${row.id}`}><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="font-semibold text-[#1B4332]" data-testid={`row-pct-${row.id}`}>{row.commission_percent}%</span>
              <span className={`text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md border ${isDefault ? "bg-emerald-50 text-emerald-700 border-emerald-200/65" : "bg-amber-50 text-amber-700 border-amber-200/65"}`}>
                {isDefault ? "Default" : "Custom"}
              </span>
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-sm">
          <ModeToggle mode={row.commission_type || "default"} onChange={onModeChange} />
        </td>
        <td className="px-4 py-3 text-sm">
          {!isDefault && !editing ? (
            <button onClick={() => setEditing(true)} className="mfp-btn-outline px-3 py-1.5 text-xs" data-testid={`row-edit-${row.id}`}>
              <PencilLine className="h-3 w-3" /> Edit
            </button>
          ) : (
            <span className="text-xs text-neutral-400">—</span>
          )}
        </td>
      </tr>
      {confirmReset && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-amber-50 text-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap" data-testid={`confirm-reset-${row.id}`}>
              <span>
                Are you sure? This will reset commission to current default value of <strong>{defaultPct}%</strong>. Custom value <strong>{row.commission_percent}%</strong> will be lost.
              </span>
              <div className="flex gap-2">
                <button onClick={() => setConfirmReset(false)} className="mfp-btn-outline px-3 py-1.5 text-xs" data-testid={`confirm-reset-cancel-${row.id}`}>Cancel</button>
                <button onClick={resetToDefault} className="mfp-btn-primary px-3 py-1.5 text-xs" data-testid={`confirm-reset-ok-${row.id}`}>Reset to Default</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CommissionTable({ rows, kind, defaultPct, onChanged }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filtered = useMemo(() => {
    const searchLower = q.toLowerCase();
    return rows.filter(
      (r) =>
        r.full_name?.toLowerCase().includes(searchLower) ||
        r.email?.toLowerCase().includes(searchLower) ||
        r.phone?.includes(searchLower)
    );
  }, [rows, q]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative max-w-sm">
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400 pointer-events-none">
          <Search className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="w-full pl-10 pr-4 py-2 text-xs border border-black/10 rounded-xl focus:outline-none focus:border-[#1b4332]"
        />
      </div>

      <div className="mfp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full mfp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Commission %</th>
                <th>Mode</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState>
                      No {kind === "dist" ? "distributors" : "admin-created agents"} found matching the criteria.
                    </EmptyState>
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <CommissionRow key={r.id} row={r} kind={kind} defaultPct={defaultPct} onChanged={onChanged} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-black/5 flex-wrap gap-3">
          <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
            Showing {Math.min(filtered.length, (page - 1) * pageSize + 1)}-{Math.min(filtered.length, page * pageSize)} of {filtered.length} entries
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-xl border border-black/5 text-xs font-bold bg-white hover:bg-neutral-50 disabled:opacity-50 transition-all select-none"
            >
              Prev
            </button>
            <span className="text-xs font-semibold px-2 text-neutral-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-xl border border-black/5 text-xs font-bold bg-white hover:bg-neutral-50 disabled:opacity-50 transition-all select-none"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}export default function AdminCommission() {
  const [defaultPct, setDefaultPct] = useState(1.2);
  const [draftDefault, setDraftDefault] = useState("1.2");
  const [savingSettings, setSavingSettings] = useState(false);
  const [masterDistributors, setMasterDistributors] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [adminAgents, setAdminAgents] = useState([]);
  const [activeTab, setActiveTab] = useState("md"); // 'md' | 'dist' | 'agent'

  const loadAll = async () => {
    const [s, mds, dists, agents] = await Promise.all([
      api.get("/admin/settings/commission"),
      api.get("/admin/users", { params: { role: "master_distributor" } }),
      api.get("/admin/users", { params: { role: "distributor" } }),
      api.get("/admin/users", { params: { role: "agent" } }),
    ]);
    setDefaultPct(s.data.default_percent);
    setDraftDefault(String(s.data.default_percent));
    setMasterDistributors(mds.data);
    setDistributors(dists.data.filter((d) => !d.md_id));
    setAdminAgents(agents.data.filter((a) => a.created_by_role !== "distributor" && a.created_by_role !== "master_distributor"));
  };

  useEffect(() => { loadAll(); }, []);

  const saveSettings = async () => {
    const v = parseFloat(draftDefault);
    if (Number.isNaN(v) || v < 0) return toast.error("Default % must be ≥ 0");
    setSavingSettings(true);
    try {
      const { data } = await api.put("/admin/settings/commission", { default_percent: v });
      toast.success(`Default saved. ${data.records_updated ?? 0} record(s) auto-updated.`);
      loadAll();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setSavingSettings(false); }
  };

  const currentTabInfo = useMemo(() => {
    switch (activeTab) {
      case "md":
        return {
          title: "Master Distributor Commissions",
          desc: "This % is the ADMIN's revenue portion for every recharge in each MD's downline. Cascades to all their distributors and agents.",
          rows: masterDistributors,
        };
      case "dist":
        return {
          title: "Distributor Commissions (Admin Created)",
          desc: "Manage commission for distributors created directly by Admin. MD-managed distributors are edited by their master distributor.",
          rows: distributors,
        };
      case "agent":
        return {
          title: "Agent Commissions (Admin Created)",
          desc: "Manage commission for agents created directly by Admin. Distributor-created agents are managed by their distributor.",
          rows: adminAgents,
        };
      default:
        return { title: "", desc: "", rows: [] };
    }
  }, [activeTab, masterDistributors, distributors, adminAgents]);

  const tabBtn = (id, label, count) => {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all duration-200 ${
          active
            ? "border-[#1B4332] text-[#1B4332]"
            : "border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-200"
        }`}
      >
        {label}
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${active ? "bg-[#1B4332] text-white" : "bg-neutral-100 text-neutral-500"}`}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <PageHeader 
        title="Commission Settings" 
        subtitle="Manage and configure default commissions and customize settings for master distributors, distributors, and agents." 
      />

      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left card: Current default indicator */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] text-white p-6 rounded-2xl border border-[#1b4332]/10 shadow-lg relative overflow-hidden flex flex-col justify-between h-[180px]">
          <div className="absolute right-0 bottom-0 translate-x-6 translate-y-6 opacity-10">
            <Coins className="h-44 w-44" />
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Percent className="h-5 w-5 text-emerald-300" />
            </div>
            <span className="text-[10px] font-black tracking-widest uppercase text-emerald-200/90">
              Active System Default
            </span>
          </div>
          <div>
            <div className="text-4xl font-black">{defaultPct}%</div>
            <p className="text-[11px] text-emerald-100/80 mt-1 max-w-[280px] leading-relaxed">
              New members automatically inherit this commission percentage on registration.
            </p>
          </div>
        </div>

        {/* Right card: Configure input */}
        <div className="lg:col-span-7 mfp-card p-6 bg-white flex flex-col justify-between h-[180px]">
          <div>
            <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block mb-2">
              Configure Default Commission
            </label>
            <div className="relative max-w-xs">
              <input
                className="mfp-input !pr-10 !py-2.5 font-bold text-neutral-800" 
                type="number" min="0" step="0.01"
                value={draftDefault}
                onChange={(e) => setDraftDefault(e.target.value)}
                data-testid="comm-default"
                placeholder="1.20"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-neutral-400 select-none pointer-events-none">
                %
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 mt-3">
            <div className="text-[10px] text-neutral-400 font-semibold max-w-[340px] leading-tight flex items-start gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-neutral-300 mt-0.5" />
              <span>
                Saving automatically updates members currently using the <strong>Default</strong> mode.
              </span>
            </div>
            <button 
              onClick={saveSettings} 
              disabled={savingSettings} 
              className="px-5 py-2.5 bg-[#1B4332] text-white hover:bg-[#153527] transition-all rounded-xl text-xs font-bold shadow-md shadow-[#1b4332]/10 flex items-center gap-1.5 disabled:opacity-50"
              data-testid="comm-save"
            >
              {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {savingSettings ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Tabbed Commissions Card */}
      <div className="mfp-card bg-white overflow-hidden shadow-md rounded-2xl">
        {/* Tab switcher header */}
        <div className="flex items-center justify-between border-b border-black/5 bg-neutral-50/50 px-6 flex-wrap">
          <div className="flex items-center gap-1 scrollbar-none overflow-x-auto">
            {tabBtn("md", "Master Distributors", masterDistributors.length)}
            {tabBtn("dist", "Distributors", distributors.length)}
            {tabBtn("agent", "Agents", adminAgents.length)}
          </div>
        </div>

        {/* Tab Content Box */}
        <div className="p-6 space-y-6">
          <div className="border-l-4 border-[#1B4332] pl-4">
            <h3 className="text-base font-black text-neutral-800 tracking-tight">
              {currentTabInfo.title}
            </h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-3xl leading-relaxed">
              {currentTabInfo.desc}
            </p>
          </div>

          <CommissionTable 
            rows={currentTabInfo.rows} 
            kind={activeTab === "agent" ? "agent" : "dist"} 
            defaultPct={defaultPct} 
            onChanged={loadAll} 
          />
        </div>
      </div>
    </div>
  );
}
