import React, { useCallback, useEffect, useState } from "react";
import { api, formatErr, fmtDate, fileUrl } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Check, X, Eye } from "lucide-react";

function RejectModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(reason.trim()); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-[#FDFCF8] rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="kyc-reject-modal">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <div className="text-base font-medium">Reject KYC</div>
          <button onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="mfp-label">Rejection reason (optional)</label>
            <textarea
              className="mfp-input min-h-[96px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Aadhaar image is blurred"
              data-testid="kyc-reject-reason"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button onClick={confirm} disabled={busy} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold flex-1" data-testid="kyc-reject-confirm">
              {busy ? "Rejecting…" : "Confirm Reject"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminKyc() {
  const [items, setItems] = useState([]);
  const [rejecting, setRejecting] = useState(null);

  const reload = useCallback(
    () => api.get("/admin/kyc").then((r) => setItems(r.data)),
    []
  );
  useEffect(() => { reload(); }, [reload]);

  const approve = async (uid) => {
    try { await api.post(`/admin/kyc/${uid}/approve`, { note: "" }); toast.success("KYC approved"); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const reject = async (uid, reason) => {
    try {
      await api.post(`/admin/kyc/${uid}/reject`, { note: reason });
      toast.success("KYC rejected");
      setRejecting(null);
      reload();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const renderAction = (r) => {
    const uid = r.user_id;
    const status = r.status || "pending";
    return (
      <div className="flex gap-2">
        {(status === "pending" || status === "rejected") && (
          <button
            className="rounded-lg bg-[#2D6A4F]/10 text-[#2D6A4F] hover:bg-[#2D6A4F]/20 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
            onClick={() => approve(uid)}
            data-testid={`kyc-approve-${uid}`}
          ><Check className="h-3 w-3" /> Approve</button>
        )}
        {(status === "pending" || status === "approved") && (
          <button
            className="rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
            onClick={() => setRejecting(r)}
            data-testid={`kyc-reject-${uid}`}
          ><X className="h-3 w-3" /> Reject</button>
        )}
      </div>
    );
  };

  const renderDoc = (path, label, uid) => path ? (
    <a className="inline-flex items-center gap-1 text-[#1B4332] underline" target="_blank" rel="noreferrer" href={fileUrl(path)} data-testid={`view-${label}-${uid}`}>
      <Eye className="h-3 w-3" /> View
    </a>
  ) : <span className="text-xs text-neutral-500">—</span>;

  return (
    <div>
      <PageHeader title="KYC Review" subtitle="Approve or reject agent KYC documents. Agents cannot log in until approved." />
      <DataTable
        columns={[
          { key: "agent", label: "Agent Name", render: (r) => r.user?.full_name || "—" },
          { key: "distributor", label: "Distributor", render: (r) => (
            r.distributor_name === "Admin"
              ? <span className="italic text-neutral-500">Admin</span>
              : <span className="font-medium">{r.distributor_name || "—"}</span>
          ) },
          { key: "phone", label: "Phone", render: (r) => r.user?.phone || "—" },
          { key: "address", label: "Address", render: (r) => <span className="text-xs">{r.user?.address || "—"}</span> },
          { key: "aadhaar", label: "Aadhaar", render: (r) => renderDoc(r.aadhaar_path, "aadhaar", r.user_id) },
          { key: "pan", label: "PAN", render: (r) => renderDoc(r.pan_path, "pan", r.user_id) },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status || "pending"} /> },
          { key: "submitted_at", label: "Submitted", render: (r) => fmtDate(r.submitted_at || r.updated_at) },
          { key: "actions", label: "Action", render: renderAction },
        ]}
        rows={items}
        empty="No agent KYC records yet"
      />
      {rejecting && (
        <RejectModal
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => reject(rejecting.user_id, reason)}
        />
      )}
    </div>
  );
}
