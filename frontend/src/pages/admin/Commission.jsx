import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { toast } from "sonner";
import { Check, X, PencilLine } from "lucide-react";

function ModeToggle({ mode, onChange }) {
  // mode = 'default' | 'custom'
  return (
    <div className="inline-flex rounded-full bg-[#F4F3ED] p-0.5" role="tablist">
      {[
        { key: "default", label: "Default" },
        { key: "custom", label: "Custom" },
      ].map((opt) => {
        const active = mode === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${active ? "bg-[#1B4332] text-white shadow-sm" : "text-neutral-600 hover:text-[#1B4332]"}`}
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
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${isDefault ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
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
  return (
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
            {rows.length === 0 ? (
              <tr><td colSpan={6}><EmptyState>No {kind === "dist" ? "distributors" : "admin-created agents"} yet.</EmptyState></td></tr>
            ) : rows.map((r) => (
              <CommissionRow key={r.id} row={r} kind={kind} defaultPct={defaultPct} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminCommission() {
  const [defaultPct, setDefaultPct] = useState(1.2);
  const [draftDefault, setDraftDefault] = useState("1.2");
  const [savingSettings, setSavingSettings] = useState(false);
  const [masterDistributors, setMasterDistributors] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [adminAgents, setAdminAgents] = useState([]);

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
    // Only admin-created distributors (not MD-managed) are editable here.
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

  return (
    <div>
      <PageHeader title="Commission Settings" subtitle="Define the default commission for all new distributors and agents. Existing users on Default mode auto-update." />

      <div className="mfp-card p-6 max-w-xl mb-10">
        <div className="space-y-4">
          <div>
            <label className="mfp-label">Default Commission %</label>
            <input
              className="mfp-input" type="number" min="0" step="0.01"
              value={draftDefault}
              onChange={(e) => setDraftDefault(e.target.value)}
              data-testid="comm-default"
            />
            <div className="mt-2 text-xs text-neutral-500">
              Saving will automatically update all distributors and admin-created agents that are on <strong>Default</strong> mode. Custom-mode records are unaffected.
            </div>
          </div>
          <button onClick={saveSettings} disabled={savingSettings} className="mfp-btn-primary" data-testid="comm-save">
            {savingSettings ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="mb-12">
        <div className="mb-4">
          <h2 className="text-lg font-medium tracking-tight">Master Distributor Commissions</h2>
          <p className="text-sm text-neutral-500">This % is the ADMIN&apos;s revenue portion for every recharge in each MD&apos;s downline. Cascades to all their distributors and agents.</p>
        </div>
        <CommissionTable rows={masterDistributors} kind="dist" defaultPct={defaultPct} onChanged={loadAll} />
      </div>

      <div className="mb-12">
        <div className="mb-4">
          <h2 className="text-lg font-medium tracking-tight">Distributor Commissions (Admin Created)</h2>
          <p className="text-sm text-neutral-500">Manage commission for distributors created directly by Admin. MD-managed distributors are edited by their master distributor.</p>
        </div>
        <CommissionTable rows={distributors} kind="dist" defaultPct={defaultPct} onChanged={loadAll} />
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-medium tracking-tight">Agent Commissions (Admin Created)</h2>
          <p className="text-sm text-neutral-500">Manage commission for agents created directly by Admin. Distributor-created agents are managed by their distributor.</p>
        </div>
        <CommissionTable rows={adminAgents} kind="agent" defaultPct={defaultPct} onChanged={loadAll} />
      </div>
    </div>
  );
}
