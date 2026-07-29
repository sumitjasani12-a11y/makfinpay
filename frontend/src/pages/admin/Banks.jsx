import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { Plus, PencilLine, Trash2, X, Landmark, Check } from "lucide-react";

function BankModal({ bank, onClose, onSaved }) {
  const [name, setName] = useState(bank ? bank.name : "");
  const [billPay, setBillPay] = useState(bank ? bank.bill_pay_enabled : true);
  const [payout, setPayout] = useState(bank ? bank.payout_enabled : true);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return toast.error("Bank name is required");

    setBusy(true);
    try {
      if (bank) {
        await api.patch(`/admin/banks/${bank.id}`, {
          name: cleanName,
          bill_pay_enabled: billPay,
          payout_enabled: payout,
        });
        toast.success("Bank updated successfully");
      } else {
        await api.post("/admin/banks", {
          name: cleanName,
          bill_pay_enabled: billPay,
          payout_enabled: payout,
        });
        toast.success("Bank created successfully");
      }
      onSaved();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={save} className="bg-white rounded-2xl max-w-md w-full border border-black/5 shadow-2xl overflow-hidden animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-800">{bank ? "Edit Bank" : "Add New Bank"}</h3>
          <button type="button" onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="mfp-label">Bank Name</label>
            <input type="text" required placeholder="e.g. AXIS BANK" className="mfp-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          
          <div className="space-y-3">
            <label className="mfp-label">Feature Permissions</label>
            
            <label className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 bg-neutral-50/50 cursor-pointer hover:bg-neutral-50 transition-all select-none">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-[#1B4332] focus:ring-[#1b4332]" checked={billPay} onChange={(e) => setBillPay(e.target.checked)} />
              <div>
                <div className="text-sm font-semibold text-neutral-800">Bill Payment Enabled</div>
                <div className="text-xs text-neutral-500">Allow agents to make credit card bill payments to this bank.</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 bg-neutral-50/50 cursor-pointer hover:bg-neutral-50 transition-all select-none">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-[#1B4332] focus:ring-[#1b4332]" checked={payout} onChange={(e) => setPayout(e.target.checked)} />
              <div>
                <div className="text-sm font-semibold text-neutral-800">Payout/Withdrawals Enabled</div>
                <div className="text-xs text-neutral-500">Allow agents to withdraw balance to this bank.</div>
              </div>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button type="submit" disabled={busy} className="mfp-btn-primary flex-1">{busy ? "Saving…" : bank ? "Save Changes" : "Create Bank"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function AdminBanks() {
  const [banks, setBanks] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const reload = () => {
    api.get("/admin/banks")
      .then((r) => setBanks(r.data))
      .catch((e) => toast.error(formatErr(e.response?.data?.detail)));
  };

  useEffect(() => { reload(); }, []);

  const toggleActive = async (bank) => {
    try {
      await api.patch(`/admin/banks/${bank.id}`, { active: !bank.active });
      toast.success(`${bank.name} ${!bank.active ? "activated" : "deactivated"}`);
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Are you sure you want to delete this bank?")) return;
    try {
      await api.delete(`/admin/banks/${id}`);
      toast.success("Bank deleted successfully");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Management"
        subtitle="Manage bank accounts and feature permissions for the system."
        actions={
          <button className="mfp-btn-primary" onClick={() => setModal(true)}>
            <Plus className="h-4 w-4" /> Add New Bank
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4">
        {banks.length === 0 ? (
          <div className="mfp-card p-12 text-center text-neutral-500">
            No banks configured. Click "Add New Bank" to populate list.
          </div>
        ) : (
          banks.map((b) => (
            <div key={b.id} className={`mfp-card px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border transition-all ${b.active ? "border-emerald-100 bg-white" : "border-neutral-200 bg-neutral-50/50 opacity-75"}`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${b.active ? "bg-emerald-50 text-[#1B4332]" : "bg-neutral-100 text-neutral-400"}`}>
                  <Landmark className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-base font-bold text-neutral-800 tracking-wide uppercase">{b.name}</div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold flex items-center gap-1 ${b.active ? "text-emerald-600" : "text-neutral-400"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${b.active ? "bg-emerald-500" : "bg-neutral-400"}`} />
                      {b.active ? "ACTIVE" : "INACTIVE"}
                    </span>
                    
                    {b.bill_pay_enabled && (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-[#1B4332]/5 text-[#1b4332] tracking-wider">
                        BILL PAY
                      </span>
                    )}

                    {b.payout_enabled && (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-600/5 text-emerald-600 tracking-wider">
                        PAYOUT
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 self-end md:self-auto">
                {/* Active switch toggle */}
                <button
                  onClick={() => toggleActive(b)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    b.active ? "bg-[#2D6A4F]" : "bg-neutral-200"
                  }`}
                  title={b.active ? "Active (Click to Disable)" : "Disabled (Click to Enable)"}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      b.active ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditing(b)}
                    className="p-2 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-all"
                    title="Edit Bank"
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(b.id)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                    title="Delete Bank"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {(modal || editing) && (
        <BankModal
          bank={editing}
          onClose={() => { setModal(false); setEditing(null); }}
          onSaved={() => { setModal(false); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
