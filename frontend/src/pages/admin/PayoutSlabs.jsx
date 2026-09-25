import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { Plus, PencilLine, Trash2, X, Layers, ShieldCheck, Power } from "lucide-react";

function PayoutSlabModal({ slab, onClose, onSaved }) {
  const [minVal, setMinVal] = useState(slab ? String(slab.min_amount) : "100");
  const [maxVal, setMaxVal] = useState(slab ? String(slab.max_amount) : "50000");
  const [chargeVal, setChargeVal] = useState(slab ? String(slab.charge_amount) : "25");
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
        await api.delete(`/admin/payout-slabs/${slab.id}`);
      }
      await api.post("/admin/payout-slabs", {
        min_amount: min,
        max_amount: max,
        charge_amount: charge,
        charge_type: type
      });
      toast.success(slab ? "Payout slab updated" : "Payout slab created");
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
          <h3 className="text-lg font-semibold text-neutral-800">{slab ? "Edit Payout Slab" : "New Payout Charge Slab"}</h3>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mfp-label">Charge Type</label>
              <select className="mfp-input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="flat">Flat Fee (₹)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="mfp-label">Charge Value ({type === "flat" ? "₹" : "%"})</label>
              <input type="number" step="0.01" min="0" required className="mfp-input" value={chargeVal} onChange={(e) => setChargeVal(e.target.value)} />
            </div>
          </div>
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>This slab will be applied dynamically when Agents initiate a Payout.</span>
          </div>
        </div>
        <div className="px-5 py-4 bg-neutral-50 border-t border-black/5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="mfp-btn-secondary text-sm" disabled={busy}>Cancel</button>
          <button type="submit" className="mfp-btn-primary text-sm" disabled={busy}>
            {busy ? "Saving..." : slab ? "Update Slab" : "Create Slab"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPayoutSlabs() {
  const [slabs, setSlabs] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSlab, setEditSlab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payoutEnabled, setPayoutEnabled] = useState(true);
  const [togglingPayout, setTogglingPayout] = useState(false);

  const fetchSlabs = () => {
    setLoading(true);
    Promise.all([
      api.get("/admin/payout-slabs"),
      api.get("/admin/payout-settings").catch(() => ({ data: { payout_enabled: true } }))
    ])
      .then(([slabRes, setRes]) => {
        setSlabs(slabRes.data || []);
        setPayoutEnabled(setRes.data?.payout_enabled ?? true);
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSlabs();
  }, []);

  const handleToggleMasterPayout = async (newVal) => {
    setTogglingPayout(true);
    try {
      await api.put("/admin/payout-settings", { payout_enabled: newVal });
      setPayoutEnabled(newVal);
      toast.success(newVal ? "Bank Payout Service Enabled for Users!" : "Bank Payout Service Disabled!");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update payout setting");
    } finally {
      setTogglingPayout(false);
    }
  };

  const toggleActive = async (id) => {
    try {
      await api.patch(`/admin/payout-slabs/${id}/toggle`);
      toast.success("Slab status updated");
      fetchSlabs();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const deleteSlab = async (id) => {
    if (!window.confirm("Are you sure you want to delete this payout slab?")) return;
    try {
      await api.delete(`/admin/payout-slabs/${id}`);
      toast.success("Slab deleted");
      fetchSlabs();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/5 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-800">Payout Charge Slabs & Master Status</h2>
          <p className="text-xs text-neutral-500 mt-1">Manage dynamic payout charge fee slabs and master ON/OFF toggle for agents.</p>
        </div>
        <button
          onClick={() => { setEditSlab(null); setModalOpen(true); }}
          className="mfp-btn-primary py-2.5 px-4 text-sm font-bold flex items-center justify-center gap-2 shrink-0 shadow-md"
        >
          <Plus className="h-4 w-4" /> Add Payout Slab
        </button>
      </div>

      {/* Master Payout ON/OFF Switch */}
      <div className={`mfp-card p-5 border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        payoutEnabled ? "bg-emerald-50/40 border-emerald-500/30" : "bg-rose-50/40 border-rose-500/30"
      }`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl ${payoutEnabled ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-rose-500 text-white shadow-lg shadow-rose-500/20"}`}>
            <Power className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-neutral-800 flex items-center gap-2">
              Bank Payout Master Toggle: 
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-extrabold uppercase ${
                payoutEnabled ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              }`}>
                {payoutEnabled ? "ONLINE / ENABLED" : "OFFLINE / DISABLED"}
              </span>
            </h4>
            <p className="text-xs text-neutral-600 mt-0.5">
              {payoutEnabled 
                ? "Payout service is active. Users can see the Bank Payout menu and send instant payouts."
                : "Payout service is disabled. Bank Payout menu is hidden from users & direct URL access is blocked."}
            </p>
          </div>
        </div>

        <button
          onClick={() => handleToggleMasterPayout(!payoutEnabled)}
          disabled={togglingPayout}
          className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md shrink-0 ${
            payoutEnabled
              ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20"
              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
          }`}
        >
          {togglingPayout ? "Updating..." : payoutEnabled ? "Turn OFF Payout" : "Turn ON Payout"}
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-neutral-500 font-medium">Loading payout slabs...</div>
      ) : slabs.length === 0 ? (
        <div className="mfp-card p-12 text-center text-neutral-500 space-y-4">
          <Layers className="h-12 w-12 text-neutral-300 mx-auto" />
          <div>
            <p className="font-bold text-neutral-800 text-base">No payout charge slabs configured yet.</p>
            <p className="text-xs text-neutral-500 mt-1">Click the button below to add your first payout fee slab range.</p>
          </div>
          <button
            onClick={() => { setEditSlab(null); setModalOpen(true); }}
            className="mfp-btn-primary py-2.5 px-5 text-sm font-bold inline-flex items-center gap-2 shadow-md"
          >
            <Plus className="h-4 w-4" /> Add Payout Slab
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {slabs.map((s) => (
            <div key={s.id} className="mfp-card p-5 relative group hover:border-[#1B4332]/30 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-md">
                    Range: ₹{s.min_amount.toLocaleString()} - ₹{s.max_amount.toLocaleString()}
                  </span>
                  <button
                    onClick={() => toggleActive(s.id)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                      s.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {s.active ? "Active" : "Inactive"}
                  </button>
                </div>

                <div className="text-2xl font-bold text-neutral-800 mb-1">
                  {s.charge_type === "flat" ? `₹${s.charge_amount}` : `${s.charge_amount}%`}
                  <span className="text-xs font-normal text-neutral-500 ml-1">Fee / Charge</span>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-black/5 flex items-center justify-between">
                <button
                  onClick={() => { setEditSlab(s); setModalOpen(true); }}
                  className="text-xs font-semibold text-[#1B4332] hover:text-[#2d6a4f] flex items-center gap-1"
                >
                  <PencilLine className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => deleteSlab(s.id)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <PayoutSlabModal
          slab={editSlab}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchSlabs(); }}
        />
      )}
    </div>
  );
}
