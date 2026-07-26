import React, { useEffect, useState } from "react";
import { api, formatErr, fileUrl, fmtMoney } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { toast } from "sonner";
import { CheckCircle2, Trash2, Eye, RefreshCw, Upload, Tag, Phone, Link, FileText } from "lucide-react";

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
        <div className="mfp-card p-8 flex flex-col justify-center items-center">
          <div className="max-w-xs w-full flex flex-col items-center justify-center space-y-5">
            {/* Header: Upload New QR */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3 flex items-center justify-center">
                {/* Glowing effect background */}
                <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full w-14 h-14 animate-pulse"></div>
                <div className="relative p-3.5 bg-gradient-to-tr from-indigo-500 to-blue-500 text-white rounded-3xl shadow-lg shadow-indigo-500/25">
                  <Upload className="h-5 w-5" />
                </div>
              </div>
              <h3 className="text-lg font-black tracking-tight text-neutral-800 bg-gradient-to-r from-neutral-800 to-neutral-500 bg-clip-text text-transparent">
                Upload New QR
              </h3>
              <p className="text-[10px] leading-relaxed text-neutral-400 max-w-[220px] mt-1">
                Enter a unique name for this QR code (e.g. PhonePe_01) to track its entries.
              </p>
            </div>

            <div className="space-y-3.5 w-full">
              {/* Select QR Entry */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <select
                  className="mfp-input !pl-9 !py-2 bg-white text-xs border border-black/10 focus:border-[#1b4332]"
                  value={selectedEntryId}
                  onChange={(e) => handleSelectEntry(e.target.value)}
                  data-testid="qr-select-entry"
                >
                  <option value="">Select QR Name...</option>
                  {qrEntries.filter(e => e.active).map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.mobile_number})</option>
                  ))}
                </select>
              </div>

              {/* QR Name */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                  <Tag className="h-3.5 w-3.5" />
                </span>
                <input
                  className="mfp-input !pl-9 !py-2 bg-neutral-50/50 text-xs border border-black/10 focus:border-[#1b4332]"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="QR Name"
                />
              </div>

              {/* Mobile Number */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                  <Phone className="h-3.5 w-3.5" />
                </span>
                <input
                  className="mfp-input !pl-9 !py-2 bg-neutral-50/50 text-xs border border-black/10 focus:border-[#1b4332]"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="WhatsApp Number (e.g. 919876543)"
                />
              </div>

              {/* UPI ID */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                  <Link className="h-3.5 w-3.5" />
                </span>
                <input
                  className="mfp-input !pl-9 !py-2 bg-neutral-50/50 text-xs border border-black/10 focus:border-[#1b4332]"
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  placeholder="UPI ID"
                />
              </div>

              {path && (
                <div className="text-[10px] text-emerald-600 font-bold pt-0.5 text-center">
                  QR Image Loaded ✓
                </div>
              )}

              <button 
                className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-white text-xs font-bold rounded-xl transition-all shadow-md bg-gradient-to-r from-[#9A91FB] to-[#8075f9] hover:from-[#867bf9] hover:to-[#6f63f7] transform hover:-translate-y-0.5 active:translate-y-0" 
                onClick={create} 
                data-testid="qr-create"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Update Now
              </button>
            </div>
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
                <div className="p-3 border border-black/5 bg-[#F4F3ED] rounded-3xl w-full h-full flex items-center justify-center shadow-sm min-h-[240px]">
                  <img 
                    src={fileUrl(activeQr.image_path)} 
                    alt="active qr" 
                    className="mx-auto rounded-xl max-h-72 object-contain" 
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
