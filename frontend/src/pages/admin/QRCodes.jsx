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

            {label && (
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 space-y-2 text-sm text-neutral-700">
                <div>QR Name: <strong className="text-neutral-800">{label}</strong></div>
                <div>Mobile Number: <strong className="text-neutral-800">{mobile}</strong></div>
                <div>UPI ID: <strong className="text-neutral-800">{upi}</strong></div>
                {path && (
                  <div className="mt-2 text-xs text-emerald-700 font-medium">
                    QR Image Loaded ✓
                  </div>
                )}
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
            <div className="text-center">
              <img src={fileUrl(activeQr.image_path)} alt="active qr" className="mx-auto rounded-2xl max-h-64 border border-black/10 object-contain" />
              <div className="mt-4 text-base font-semibold text-neutral-800">{activeQr.label}</div>
              <div className="text-sm text-neutral-600 mt-1">Mobile: {activeQr.mobile_number || activeQr.upi_id}</div>
              {activeQr.mobile_number && activeQr.upi_id && <div className="text-xs text-neutral-400 mt-0.5">UPI ID: {activeQr.upi_id}</div>}
            </div>
          ) : <EmptyState>No active QR. Activate one below.</EmptyState>}
        </div>
      </div>

      {/* Grid List of Available QR Codes */}
      <h3 className="text-lg font-medium mb-4">Available QR Codes</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.length === 0 && <EmptyState>No QR codes yet.</EmptyState>}
        {items.map((q) => (
          <div key={q.id} className="mfp-card p-5">
            <img src={fileUrl(q.image_path)} alt={q.label} className="rounded-xl h-44 w-full object-contain bg-[#F4F3ED] border border-black/5" />
            <div className="mt-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-800">{q.label}</div>
                <div className="text-xs text-neutral-500">{q.mobile_number || q.upi_id || "—"}</div>
              </div>
              {q.active && <span className="mfp-pill bg-emerald-100 text-emerald-800 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Active</span>}
            </div>
            <div className="mt-3 flex gap-2">
              {!q.active && <button className="mfp-btn-outline px-3 py-1.5 text-xs" onClick={() => activate(q.id)} data-testid={`qr-activate-${q.id}`}>Activate</button>}
              <button className="rounded-xl border-2 border-rose-200 text-rose-700 hover:bg-rose-50 px-3 py-1.5 text-xs font-semibold" onClick={() => del(q.id)} data-testid={`qr-delete-${q.id}`}><Trash2 className="h-3 w-3 inline" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
