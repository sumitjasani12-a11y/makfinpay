import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { Plus, PencilLine, Trash2, X, Layers } from "lucide-react";

function SlabModal({ slab, onClose, onSaved }) {
  const [minVal, setMinVal] = useState(slab ? String(slab.min_amount) : "0");
  const [maxVal, setMaxVal] = useState(slab ? String(slab.max_amount) : "1000");
  const [chargeVal, setChargeVal] = useState(slab ? String(slab.charge_amount) : "0");
  const [type, setType] = useState(slab ? slab.charge_type : "flat");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const min = parseFloat(minVal);
    const max = parseFloat(maxVal);
    const charge = parseFloat(chargeVal);

    if (Number.isNaN(min) || min < 0) return toast.error("Min amount must be ≥ 0");
    if (Number.isNaN(max) || max <= min) return toast.error("Max amount must be greater than Min amount");
    if (Number.isNaN(charge) || charge < 0) return toast.error("Charge amount must be ≥ 0");

    setBusy(true);
    try {
      if (slab) {
        await api.delete(`/admin/service-slabs/${slab.id}`);
      }
      await api.post("/admin/service-slabs", {
        min_amount: min,
        max_amount: max,
        charge_amount: charge,
        charge_type: type
      });
      toast.success(slab ? "Slab updated" : "Slab created");
      onSaved();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={save} className="bg-white rounded-2xl max-w-md w-full border border-black/5 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-800">{slab ? "Edit Service Slab" : "New Service Slab"}</h3>
          <button type="button" onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mfp-label">Min Amount (₹)</label>
              <input type="number" min="0" required className="mfp-input" value={minVal} onChange={(e) => setMinVal(e.target.value)} />
            </div>
            <div>
              <label className="mfp-label">Max Amount (₹)</label>
              <input type="number" min="1" required className="mfp-input" value={maxVal} onChange={(e) => setMaxVal(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mfp-label">Charge Amount</label>
            <input type="number" min="0" step="0.01" required className="mfp-input" value={chargeVal} onChange={(e) => setChargeVal(e.target.value)} />
          </div>
          <div>
            <label className="mfp-label">Charge Type</label>
            <div className="flex bg-neutral-100 p-1 rounded-xl">
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${type === "flat" ? "bg-[#1B4332] text-white shadow" : "text-neutral-600 hover:text-neutral-900"}`}
                onClick={() => setType("flat")}
              >
                Flat (₹)
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${type === "percent" ? "bg-[#1B4332] text-white shadow" : "text-neutral-600 hover:text-neutral-900"}`}
                onClick={() => setType("percent")}
              >
                Percentage (%)
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button type="submit" disabled={busy} className="mfp-btn-primary flex-1">{busy ? "Saving…" : slab ? "Save Changes" : "Save Slab"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function AdminServiceSlabs() {
  const [slabs, setSlabs] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const reload = () => {
    api.get("/admin/service-slabs")
      .then((r) => setSlabs(r.data))
      .catch((e) => toast.error(formatErr(e.response?.data?.detail)));
  };

  useEffect(() => { reload(); }, []);

  const toggle = async (id) => {
    try {
      await api.patch(`/admin/service-slabs/${id}/toggle`);
      toast.success("Slab status toggled");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Are you sure you want to delete this slab?")) return;
    try {
      await api.delete(`/admin/service-slabs/${id}`);
      toast.success("Slab deleted successfully");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Charge Slabs"
        subtitle="Manage dynamic transaction service charge fee slabs based on bill amount ranges."
        actions={
          <button className="mfp-btn-primary" onClick={() => setModal(true)}>
            <Plus className="h-4 w-4" /> New Slab
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4">
        {slabs.length === 0 ? (
          <div className="mfp-card p-12 text-center text-neutral-500">
            No service charge slabs configured yet. Click "New Slab" to create one.
          </div>
        ) : (
          slabs.map((s) => (
            <div key={s.id} className={`mfp-card px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border transition-all ${s.active ? "border-emerald-100 bg-white" : "border-neutral-200 bg-neutral-50/50 opacity-75"}`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${s.active ? "bg-emerald-50 text-[#1B4332]" : "bg-neutral-100 text-neutral-400"}`}>
                  <Layers className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Amount Range</div>
                  <div className="text-base font-semibold text-neutral-800">
                    From <span className="text-[#1B4332]">₹{parseFloat(s.min_amount).toLocaleString("en-IN")}</span> to <span className="text-[#1B4332]">₹{parseFloat(s.max_amount).toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1 md:text-center">
                <div className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Service Charge</div>
                <div className="text-base font-bold text-emerald-800">
                  {s.charge_type === "percent" ? `${s.charge_amount}%` : `₹${parseFloat(s.charge_amount).toFixed(2)}`}{" "}
                  <span className="text-xs font-normal text-neutral-500">({s.charge_type === "percent" ? "Percentage" : "Flat Fee"})</span>
                </div>
              </div>

              <div className="flex items-center gap-6 self-end md:self-auto">
                <button
                  onClick={() => toggle(s.id)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    s.active ? "bg-[#2D6A4F]" : "bg-neutral-200"
                  }`}
                  title={s.active ? "Active (Click to Disable)" : "Disabled (Click to Enable)"}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      s.active ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditing(s)}
                    className="p-2 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-all"
                    title="Edit Slab"
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                    title="Delete Slab"
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
        <SlabModal
          slab={editing}
          onClose={() => { setModal(false); setEditing(null); }}
          onSaved={() => { setModal(false); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
