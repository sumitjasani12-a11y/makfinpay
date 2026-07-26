import React, { useEffect, useState } from "react";
import { api, formatErr, fileUrl, fmtMoney } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { toast } from "sonner";
import { CheckCircle2, Trash2, Eye, RefreshCw } from "lucide-react";

export default function AdminQRCodes() {
  const [items, setItems] = useState([]);
  const [qrEntries, setQrEntries] = useState([]);
  
  const [label, setLabel] = useState("");
  const [upi, setUpi] = useState("");
  const [mobile, setMobile] = useState("");
  const [path, setPath] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState("");

  const reload = () => {
    api.get("/admin/qrcodes").then((r) => setItems(r.data || []));
    api.get("/admin/qr-name-entries").then((r) => setQrEntries(r.data || []));
  };

  useEffect(() => { reload(); }, []);

  const handleSelectEntry = (id) => {
    setSelectedEntryId(id);
    const found = qrEntries.find(e => e.id === id);
    if (found) {
      setLabel(found.name);
      setMobile(found.mobile_number);
      setUpi(found.upi_id);
      setPath(found.image_path);
    } else {
      setLabel("");
      setMobile("");
      setUpi("");
      setPath("");
    }
  };

  const create = async () => {
    if (!label || !path) return toast.error("Please select a QR Name Entry first");
    try {
      await api.post("/admin/qrcodes", { 
        label, 
        image_path: path, 
        upi_id: upi,
        mobile_number: mobile 
      });
      toast.success("QR added");
      setLabel("");
      setUpi("");
      setMobile("");
      setPath("");
      setSelectedEntryId("");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const activate = async (id) => {
    try {
      await api.patch(`/admin/qrcodes/${id}/activate`);
      toast.success("QR activated");
      reload();
    } catch (e) {
      toast.error("Failed to activate QR");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this QR Code?")) return;
    try {
      await api.delete(`/admin/qrcodes/${id}`);
      toast.success("QR deleted");
      reload();
    } catch (e) {
      toast.error("Failed to delete QR");
    }
  };

  const activeQr = items.find((i) => i.active);

  return (
    <div>
      <PageHeader title="QR Code Management" subtitle="Manage active UPI QR codes for payment gateway." />
      
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Left Card: Select QR Name Entry */}
        <div className="mfp-card p-6">
          <h3 className="text-lg font-medium mb-4">Select QR Name Entry</h3>
          <div className="space-y-4">
            <div>
              <label className="mfp-label font-medium mb-1">Select QR Entry</label>
              <select
                className="mfp-input bg-white"
                value={selectedEntryId}
                onChange={(e) => handleSelectEntry(e.target.value)}
                data-testid="qr-select-entry"
              >
                <option value="">-- Select QR Entry --</option>
                {qrEntries.filter(e => e.active).map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.mobile_number})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mfp-label font-medium mb-1">QR Name</label>
              <input
                className="mfp-input bg-neutral-50/50"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="QR Name"
              />
            </div>

            <div>
              <label className="mfp-label font-medium mb-1">Mobile Number</label>
              <input
                className="mfp-input bg-neutral-50/50"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="Mobile Number"
              />
            </div>

            <div>
              <label className="mfp-label font-medium mb-1">UPI ID</label>
              <input
                className="mfp-input bg-neutral-50/50"
                value={upi}
                onChange={(e) => setUpi(e.target.value)}
                placeholder="UPI ID"
              />
            </div>

            {path && (
              <div className="text-xs text-emerald-700 font-medium pt-1">
                QR Image Loaded ✓
              </div>
            )}

            <button className="mfp-btn-primary w-full" onClick={create} data-testid="qr-create">
              Add QR
            </button>
          </div>
        </div>

        {/* Right Card: Active QR Preview */}
        <div className="mfp-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-black/5 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Eye className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-800">Current Active QR</h3>
                <p className="text-xs text-neutral-400">This QR is currently being shown to users.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Live Now
              </span>
              <button 
                type="button" 
                onClick={reload} 
                className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-all"
                title="Refresh Stats"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {activeQr ? (
            <div className="grid md:grid-cols-5 gap-6">
              {/* QR Image Container (Col span 2) */}
              <div className="md:col-span-2 flex flex-col">
                <div className="p-4 border border-black/5 bg-[#F4F3ED] rounded-3xl w-full h-full flex items-center justify-center shadow-sm min-h-[240px]">
                  <img 
                    src={fileUrl(activeQr.image_path)} 
                    alt="active qr" 
                    className="mx-auto rounded-xl max-h-56 object-contain" 
                  />
                </div>
              </div>

              {/* QR Stats and details Container (Col span 3) */}
              <div className="md:col-span-3 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Active QR Name */}
                  <div className="bg-neutral-50/50 border border-neutral-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">Active QR Name</span>
                    <div className="text-sm font-bold text-neutral-800 break-words leading-tight uppercase">
                      {activeQr.label}
                    </div>
                  </div>

                  {/* Whatsapp Target */}
                  <div className="bg-neutral-50/50 border border-neutral-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">Whatsapp Target</span>
                    <div className="text-sm font-bold text-neutral-800 tabular-nums">
                      {activeQr.mobile_number || "—"}
                    </div>
                  </div>

                  {/* Approved Amount */}
                  <div className="bg-emerald-50/10 border border-emerald-100/50 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Approved Amount</span>
                    <div className="text-base font-extrabold text-emerald-800 tabular-nums">
                      {fmtMoney(activeQr.stats?.approved_amount ?? 0)}
                    </div>
                  </div>

                  {/* Total Entries */}
                  <div className="bg-neutral-50/50 border border-neutral-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">Total Entries</span>
                    <div className="text-base font-bold text-neutral-800 tabular-nums">
                      {activeQr.stats?.total_entries ?? 0}
                    </div>
                  </div>
                </div>

                {/* Entry Status Breakdown */}
                <div className="bg-white border border-neutral-100 rounded-2xl p-4 space-y-2">
                  <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider block text-center">Entry Status Breakdown</span>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="space-y-0.5">
                      <div className="text-lg font-black text-amber-500 tabular-nums">
                        {activeQr.stats?.pending ?? 0}
                      </div>
                      <div className="text-[9px] font-bold text-neutral-400 tracking-widest uppercase">Pending</div>
                    </div>
                    <div className="space-y-0.5 border-x border-neutral-100">
                      <div className="text-lg font-black text-emerald-600 tabular-nums">
                        {activeQr.stats?.approved ?? 0}
                      </div>
                      <div className="text-[9px] font-bold text-neutral-400 tracking-widest uppercase">Approved</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-lg font-black text-rose-500 tabular-nums">
                        {activeQr.stats?.rejected ?? 0}
                      </div>
                      <div className="text-[9px] font-bold text-neutral-400 tracking-widest uppercase">Rejected</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12"><EmptyState>No active QR. Select one to add.</EmptyState></div>
          )}
        </div>
      </div>
    </div>
  );
}
