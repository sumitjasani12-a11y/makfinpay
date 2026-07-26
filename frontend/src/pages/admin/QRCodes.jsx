import React, { useEffect, useState } from "react";
import { api, formatErr, fileUrl } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { CheckCircle2, Trash2 } from "lucide-react";

export default function AdminQRCodes() {
  const [items, setItems] = useState([]);
  const [label, setLabel] = useState("");
  const [upi, setUpi] = useState("");
  const [path, setPath] = useState("");

  const reload = () => api.get("/admin/qrcodes").then((r) => setItems(r.data));
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!label || !path) return toast.error("Provide label and QR image");
    try { await api.post("/admin/qrcodes", { label, image_path: path, upi_id: upi }); toast.success("QR added"); setLabel(""); setUpi(""); setPath(""); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const activate = async (id) => { await api.patch(`/admin/qrcodes/${id}/activate`); reload(); };
  const del = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/admin/qrcodes/${id}`); reload(); };

  return (
    <div>
      <PageHeader title="QR Code Management" subtitle="Upload UPI QR codes. Only one QR can be active at a time." />
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="mfp-card p-6">
          <h3 className="text-lg font-medium mb-4">Add new QR</h3>
          <div className="space-y-3">
            <div><label className="mfp-label">Label</label><input className="mfp-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Main UPI" data-testid="qr-label" /></div>
            <div><label className="mfp-label">Phone Number (optional)</label><input className="mfp-input" type="tel" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="Enter phone number" data-testid="qr-upi" /></div>
            <FileUpload onUploaded={setPath} label="Upload QR image" testid="qr-upload" />
            {path && <div className="text-xs text-neutral-500">Uploaded ✓</div>}
            <button className="mfp-btn-primary" onClick={create} data-testid="qr-create">Add QR</button>
          </div>
        </div>
        <div className="mfp-card p-6">
          <h3 className="text-lg font-medium mb-4">Active QR Preview</h3>
          {items.find((i) => i.active) ? (
            <div className="text-center">
              <img src={fileUrl(items.find((i) => i.active).image_path)} alt="active qr" className="mx-auto rounded-2xl max-h-64 border border-black/10" />
              <div className="mt-3 text-sm font-medium">{items.find((i) => i.active).label}</div>
              {items.find((i) => i.active).upi_id && <div className="text-xs text-neutral-500">{items.find((i) => i.active).upi_id}</div>}
            </div>
          ) : <EmptyState>No active QR. Activate one below.</EmptyState>}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.length === 0 && <EmptyState>No QR codes yet.</EmptyState>}
        {items.map((q) => (
          <div key={q.id} className="mfp-card p-5">
            <img src={fileUrl(q.image_path)} alt={q.label} className="rounded-xl h-44 w-full object-contain bg-[#F4F3ED] border border-black/5" />
            <div className="mt-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{q.label}</div>
                <div className="text-xs text-neutral-500">{q.upi_id || "—"}</div>
              </div>
              {q.active && <span className="mfp-pill bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-3 w-3" /> Active</span>}
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
