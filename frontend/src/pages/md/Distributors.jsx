import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, PencilLine, X } from "lucide-react";

function MarkupModal({ target, base, onClose, onSaved }) {
  const [val, setVal] = useState(String(target.md_pct ?? target.markup_commission ?? 0));
  const [busy, setBusy] = useState(false);
  const m = parseFloat(val) || 0;
  const total = +(base + m).toFixed(4);
  const save = async () => {
    if (Number.isNaN(parseFloat(val)) || m < 0) return toast.error("Markup must be ≥ 0");
    setBusy(true);
    try {
      await api.patch(`/master-distributor/users/${target.id}/markup`, { markup_percent: m });
      toast.success("Markup updated");
      onSaved();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-[#FDFCF8] rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="md-edit-markup-modal">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <div>
            <div className="mfp-overline">Edit Your Markup</div>
            <div className="text-base font-medium">{target.full_name}</div>
          </div>
          <button onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="mfp-label">Your Markup %</label>
            <input type="number" min="0" step="0.01" className="mfp-input" value={val} onChange={(e) => setVal(e.target.value)} data-testid="md-edit-markup-input" autoFocus />
          </div>
          <div className="rounded-xl bg-[#F4F3ED] p-4 text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-neutral-600">Base (Admin) Commission</span><span className="font-medium">{base}%</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">Your Markup</span><span className="font-medium">{m}%</span></div>
            <div className="border-t border-black/10 my-1" />
            <div className="flex justify-between text-base"><span className="font-semibold">Total Commission</span><span className="font-semibold text-[#1B4332]" data-testid="md-edit-markup-total">{total}%</span></div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button onClick={save} disabled={busy} className="mfp-btn-primary flex-1" data-testid="md-edit-markup-save">{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MdDistributors() {
  const { user } = useAuth();
  const base = Number(user?.commission_percent || 0);

  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", phone: "", address: "", markup: "" });
  const [editing, setEditing] = useState(null);

  const reload = () => api.get("/master-distributor/distributors").then((r) => setItems(r.data));
  useEffect(() => { reload(); }, []);

  const markupNum = parseFloat(form.markup) || 0;
  const previewTotal = +(base + markupNum).toFixed(4);

  const create = async (e) => {
    e.preventDefault();
    if (markupNum < 0) return toast.error("Markup must be ≥ 0");
    try {
      await api.post("/master-distributor/users", {
        role: "distributor",
        full_name: form.full_name, email: form.email, password: form.password,
        phone: form.phone, address: form.address,
        commission_percent: markupNum,
      });
      toast.success("Distributor created");
      setShow(false);
      setForm({ full_name: "", email: "", password: "", phone: "", address: "", markup: "" });
      reload();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const toggle = async (id) => {
    try { await api.patch(`/master-distributor/users/${id}/freeze`); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader title="My Distributors" subtitle={`Your commission is ${base}%. Add a markup to set each distributor's rate.`}
        actions={<button className="mfp-btn-primary" onClick={() => setShow(!show)} data-testid="new-distributor-btn"><Plus className="h-4 w-4" /> New Distributor</button>} />

      {show && (
        <form onSubmit={create} className="mfp-card p-6 grid sm:grid-cols-2 gap-4 mb-8">
          {[["Full Name", "full_name"], ["Email", "email"], ["Password", "password"], ["Phone", "phone"], ["Address", "address"]].map(([l, k]) => (
            <div key={k}>
              <label className="mfp-label">{l}</label>
              <input className="mfp-input" type={k === "password" ? "password" : k === "email" ? "email" : "text"} required value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`md-dist-form-${k}`} />
            </div>
          ))}
          <div>
            <label className="mfp-label">Add Your Markup %</label>
            <input className="mfp-input" type="number" step="0.01" min="0" value={form.markup} onChange={(e) => setForm({ ...form, markup: e.target.value })} placeholder="Enter markup percentage" data-testid="md-dist-form-markup" />
            <div className="mt-1 text-xs text-neutral-500">Added on top of the base commission</div>
          </div>
          <div className="sm:col-span-2 rounded-xl bg-[#F4F3ED] p-4 text-sm space-y-1.5" data-testid="md-markup-preview">
            <div className="flex justify-between"><span className="text-neutral-600">Base (Admin) Commission</span><span className="font-medium">{base}%</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">Your Markup</span><span className="font-medium">{markupNum}%</span></div>
            <div className="border-t border-black/10 my-1" />
            <div className="flex justify-between text-base"><span className="font-semibold">Distributor Total</span><span className="font-semibold text-[#1B4332]" data-testid="md-markup-preview-total">{previewTotal}%</span></div>
          </div>
          <div className="sm:col-span-2"><button className="mfp-btn-primary" data-testid="md-dist-form-submit">Create Distributor</button></div>
        </form>
      )}

      <DataTable
        columns={[
          { key: "full_name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "earnings", label: "Earnings", render: (r) => fmtMoney(r.earnings ?? 0) },
          { key: "md_pct", label: "Your Markup %", render: (r) => `${r.md_pct ?? r.markup_commission ?? 0}%` },
          { key: "commission_percent", label: "Total Comm %", render: (r) => <span className="font-semibold text-[#1B4332]">{r.commission_percent}%</span> },
          { key: "frozen", label: "Status", render: (r) => <StatusBadge status={r.frozen ? "rejected" : "approved"} /> },
          { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
          { key: "actions", label: "Action", render: (r) => (
            <div className="flex items-center gap-2">
              <button className="mfp-btn-outline px-3 py-1.5 text-xs" onClick={() => setEditing(r)} data-testid={`md-edit-markup-${r.id}`}><PencilLine className="h-3 w-3" /> Markup</button>
              <button
                onClick={() => toggle(r.id)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  r.frozen ? "bg-neutral-200" : "bg-[#2D6A4F]"
                }`}
                title={r.frozen ? "Frozen (Click to Enable)" : "Active (Click to Freeze)"}
                data-testid={`md-freeze-${r.id}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    r.frozen ? "translate-x-0" : "translate-x-5"
                  }`}
                />
              </button>
            </div>
          ) },
        ]}
        rows={items}
        empty="You haven't created any distributors yet."
      />

      {editing && (
        <MarkupModal target={editing} base={base} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}
