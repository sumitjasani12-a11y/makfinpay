import React, { useEffect, useState } from "react";
import { api, formatErr, fileUrl } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { toast } from "sonner";
import { CheckCircle2, Trash2 } from "lucide-react";

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
        <div className="mfp-card p-6">
          <h3 className="text-lg font-medium mb-4">Active QR Preview</h3>
          {activeQr ? (
            <div className="flex flex-col items-center">
              <div className="relative p-3 border border-black/5 bg-[#F4F3ED] rounded-2xl mb-4 w-full flex items-center justify-center min-h-[260px]">
                <img 
                  src={fileUrl(activeQr.image_path)} 
                  alt="active qr" 
                  className="mx-auto rounded-xl max-h-60 object-contain" 
                />
                <span className="absolute top-4 right-4 mfp-pill bg-emerald-100 text-emerald-800 flex items-center gap-1.5 shadow-sm border border-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Active Gateway
                </span>
              </div>
              
              <div className="w-full bg-[#FBFBFA] border border-neutral-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <span className="text-xs text-neutral-500 font-medium">QR Gateway Name</span>
                  <span className="text-sm font-semibold text-neutral-800 bg-[#E8F5E9] text-[#1B4332] px-2.5 py-1 rounded-lg">
                    {activeQr.label}
                  </span>
                </div>
                
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <span className="text-xs text-neutral-500 font-medium">Mobile Number</span>
                  <span className="text-sm font-medium text-neutral-800 tabular-nums">
                    {activeQr.mobile_number || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500 font-medium">UPI ID</span>
                  <span className="text-sm font-medium text-[#1B4332] truncate max-w-[200px]" title={activeQr.upi_id}>
                    {activeQr.upi_id || "—"}
                  </span>
                </div>
              </div>
            </div>
          ) : <EmptyState>No active QR. Select one to add.</EmptyState>}
        </div>
      </div>
    </div>
  );
}
