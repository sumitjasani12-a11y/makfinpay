import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, PencilLine, X } from "lucide-react";

function MarkupModal({ agent, base, onClose, onSaved }) {
  const [val, setVal] = useState(String(agent.markup_commission ?? 0));
  const [busy, setBusy] = useState(false);
  const m = parseFloat(val) || 0;
  const total = +(base + m).toFixed(4);
  const save = async () => {
    if (Number.isNaN(parseFloat(val)) || m < 0) return toast.error("Markup must be ≥ 0");
    setBusy(true);
    try {
      await api.patch(`/distributor/agents/${agent.id}/markup`, { markup_percent: m });
      toast.success("Markup updated");
      onSaved();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-[#FDFCF8] rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="edit-markup-modal">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <div>
            <div className="mfp-overline">Edit Markup</div>
            <div className="text-base font-medium">{agent.full_name}</div>
          </div>
          <button onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="mfp-label">Your Markup %</label>
            <input type="number" min="0" step="0.01" className="mfp-input" value={val} onChange={(e) => setVal(e.target.value)} data-testid="edit-markup-input" autoFocus />
          </div>
          <div className="rounded-xl bg-[#F4F3ED] p-4 text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-neutral-600">Base Commission</span><span className="font-medium">{base}%</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">Your Markup</span><span className="font-medium">{m}%</span></div>
            <div className="border-t border-black/10 my-1" />
            <div className="flex justify-between text-base"><span className="font-semibold">Agent Total</span><span className="font-semibold text-[#1B4332]" data-testid="edit-markup-total">{total}%</span></div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button onClick={save} disabled={busy} className="mfp-btn-primary flex-1" data-testid="edit-markup-save">{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DistAgents() {
  const { user } = useAuth();
  const base = Number(user?.commission_percent || 0);

  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", address: "", firm_name: "", firm_address: "", markup: "" });
  const [editing, setEditing] = useState(null);
  const [createdCreds, setCreatedCreds] = useState(null);

  const reload = () => api.get("/distributor/agents").then((r) => setItems(r.data));
  useEffect(() => { reload(); }, []);

  const markupNum = parseFloat(form.markup) || 0;
  const previewTotal = +(base + markupNum).toFixed(4);

  const create = async (e) => {
    e.preventDefault();
    if (markupNum < 0) return toast.error("Markup must be ≥ 0");
    try {
      const body = {
        role: "agent",
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        firm_name: form.firm_name,
        firm_address: form.firm_address,
        commission_percent: markupNum,
      };
      const { data } = await api.post("/distributor/agents", body);
      toast.success("Agent created successfully");
      setShow(false);
      setForm({ full_name: "", email: "", phone: "", address: "", firm_name: "", firm_address: "", markup: "" });
      reload();
      if (data && data.password) {
        setCreatedCreds(data);
      }
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const toggle = async (id) => { try { await api.patch(`/distributor/agents/${id}/freeze`); reload(); } catch (e) { toast.error(formatErr(e.response?.data?.detail)); } };

  return (
    <div>
      <PageHeader title="My Agents" subtitle={`Your base commission is ${base}%. Add a markup to set each agent's total commission.`}
        actions={<button className="mfp-btn-primary" onClick={() => setShow(!show)} data-testid="new-agent-btn"><Plus className="h-4 w-4" /> New Agent</button>} />

      {show && (
        <form onSubmit={create} className="mfp-card p-6 grid sm:grid-cols-2 gap-4 mb-8">
          {[
            ["Full Name", "full_name", "text"],
            ["Email Address", "email", "email"],
            ["Phone Number", "phone", "text"],
            ["Personal Address", "address", "text"],
            ["Firm Name", "firm_name", "text"],
            ["Firm Address", "firm_address", "text"]
          ].map(([l, k, t]) => (
            <div key={k}>
              <label className="mfp-label">{l}</label>
              <input className="mfp-input" type={t} required value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`dist-form-${k}`} />
            </div>
          ))}
          <div>
            <label className="mfp-label">Add Your Markup %</label>
            <input className="mfp-input" type="number" step="0.01" min="0" value={form.markup} onChange={(e) => setForm({ ...form, markup: e.target.value })} placeholder="Enter markup percentage" data-testid="dist-form-markup" />
            <div className="mt-1 text-xs text-neutral-500">This will be added on top of base commission</div>
          </div>
          <div className="sm:col-span-2 rounded-xl bg-[#F4F3ED] p-4 text-sm space-y-1.5" data-testid="markup-preview">
            <div className="flex justify-between"><span className="text-neutral-600">Base Commission</span><span className="font-medium">{base}%</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">Your Markup</span><span className="font-medium">{markupNum}%</span></div>
            <div className="border-t border-black/10 my-1" />
            <div className="flex justify-between text-base"><span className="font-semibold">Agent Total Commission</span><span className="font-semibold text-[#1B4332]" data-testid="markup-preview-total">{previewTotal}%</span></div>
          </div>
          <div className="sm:col-span-2"><button className="mfp-btn-primary" data-testid="dist-form-submit">Create Agent</button></div>
        </form>
      )}

      <DataTable
        columns={[
          { key: "full_name", label: "Name" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
          { key: "wallet_balance", label: "Wallet", render: (r) => fmtMoney(r.wallet_balance) },
          { key: "base_commission", label: "Base %", render: (r) => `${r.base_commission ?? base}%` },
          { key: "markup_commission", label: "Markup %", render: (r) => `${r.markup_commission ?? 0}%` },
          { key: "commission_percent", label: "Total %", render: (r) => <span className="font-semibold text-[#1B4332]">{r.commission_percent}%</span> },
          { key: "kyc_status", label: "Status", render: (r) => {
            if (r.frozen) return <StatusBadge status="rejected" />;
            const resolved = !r.kyc_status || r.kyc_status === "approved" ? "approved" : (r.kyc_status === "rejected" ? "rejected" : "pending");
            return <StatusBadge status={resolved} />;
          } },
          { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
          { key: "actions", label: "Action", render: (r) => (
            <div className="flex items-center gap-2">
              <button className="mfp-btn-outline px-3 py-1.5 text-xs" onClick={() => setEditing(r)} data-testid={`edit-markup-${r.id}`}><PencilLine className="h-3 w-3" /> Markup</button>
              <button
                onClick={() => toggle(r.id)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  r.frozen ? "bg-neutral-200" : "bg-[#2D6A4F]"
                }`}
                title={r.frozen ? "Frozen (Click to Enable)" : "Active (Click to Freeze)"}
                data-testid={`dist-freeze-${r.id}`}
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
      />

      {editing && (
        <MarkupModal agent={editing} base={base} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}

      {createdCreds && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4">
          <div className="bg-[#FDFCF8] rounded-2xl p-6 max-w-md w-full border border-black/5 shadow-2xl animate-fade-in" data-testid="creds-modal">
            <h3 className="text-lg font-semibold text-neutral-800 mb-2">Agent Created Successfully!</h3>
            <p className="text-xs text-neutral-500 mb-4">Please copy these credentials and share them with the agent. The password will not be shown again.</p>

            <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-100 mb-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400">Email Address</span>
                <div className="text-sm font-medium text-neutral-800 mt-0.5 break-all">{createdCreds.email}</div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400">Temporary Password</span>
                <div className="text-sm font-mono font-semibold text-emerald-700 mt-0.5 break-all bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100 flex justify-between items-center">
                  <span>{createdCreds.password}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 px-2 py-1 rounded bg-emerald-100"
                    onClick={() => {
                      navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
                      toast.success("Credentials copied to clipboard");
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
            <button className="mfp-btn-primary w-full py-2.5 font-bold" onClick={() => setCreatedCreds(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
