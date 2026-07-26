import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtDate, fileUrl } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Check, X, Eye, AlertCircle, Search, RotateCcw } from "lucide-react";

function RejectModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!reason.trim()) return toast.error("Please provide a rejection reason");
    setBusy(true);
    try { await onConfirm(reason.trim()); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-[#FDFCF8] rounded-2xl max-w-md w-full border border-black/5 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="kyc-reject-modal">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <div className="text-base font-semibold">Reject KYC Application</div>
          <button onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="mfp-label">Reason for Rejection</label>
            <textarea
              className="mfp-input min-h-[96px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Aadhaar Back side photo is blurred or missing"
              data-testid="kyc-reject-reason"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
            <button type="button" onClick={confirm} disabled={busy} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold flex-1" data-testid="kyc-reject-confirm">
              {busy ? "Rejecting…" : "Confirm Reject"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KycDetailModal({ record, onClose, onApprove, onReject }) {
  const u = record.user || {};
  return (
    <div className="fixed inset-0 bg-black/60 z-40 grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#FDFCF8] rounded-3xl max-w-4xl w-full border border-black/5 shadow-2xl p-6 relative my-8" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-black/5 mb-6">
          <div>
            <h3 className="text-xl font-bold text-neutral-800">KYC Application Review</h3>
            <p className="text-xs text-neutral-500 mt-1">Submitted: {fmtDate(record.submitted_at || record.updated_at)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors text-neutral-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-neutral-50 p-6 rounded-2xl border border-neutral-100 mb-6">
          <div>
            <span className="text-[10px] uppercase font-semibold text-neutral-400">Agent Details</span>
            <div className="mt-1 text-sm font-semibold text-neutral-800">{u.full_name}</div>
            <div className="text-xs text-neutral-500 mt-0.5">Phone: {u.phone || "—"} | Email: {u.email || "—"}</div>
            <div className="text-xs text-neutral-500 mt-1">Personal Address: {u.address || "—"}</div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-neutral-400">Firm / Business Details</span>
            <div className="mt-1 text-sm font-semibold text-neutral-800">{u.firm_name || "—"}</div>
            <div className="text-xs text-neutral-500 mt-1">Firm Address: {u.firm_address || "—"}</div>
          </div>
        </div>

        {/* Documents Grid */}
        <h4 className="text-xs uppercase font-semibold text-neutral-400 mb-3 tracking-wider">Uploaded Documents (7)</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Aadhaar Card (Front)", path: record.aadhaar_path },
            { label: "Aadhaar Card (Back)", path: record.aadhaar_back_path },
            { label: "PAN Card (Front)", path: record.pan_path },
            { label: "Selfie Photo", path: record.selfie_path },
            { label: "Cheque / Passbook", path: record.cheque_path },
            { label: "Firm Front Photo", path: record.firm_front_path, span: "sm:col-span-2" },
          ].map((doc, idx) => (
            <div key={idx} className={`border border-black/5 rounded-2xl p-3 bg-white flex flex-col justify-between ${doc.span || ""}`}>
              <span className="text-xs font-semibold text-neutral-600 mb-2 block">{doc.label}</span>
              {doc.path ? (
                <div className="space-y-2">
                  <div className="bg-neutral-100 rounded-lg h-24 overflow-hidden border border-neutral-200/50 flex items-center justify-center">
                    {/* Render preview if it is an image */}
                    {doc.path.match(/\.(jpeg|jpg|gif|png|webp)/i) ? (
                      <img src={fileUrl(doc.path)} alt={doc.label} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-neutral-500 uppercase font-mono">Document File</span>
                    )}
                  </div>
                  <a 
                    href={fileUrl(doc.path)} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="w-full text-center py-1.5 bg-[#1B4332] text-white rounded-lg text-xs font-semibold hover:bg-[#1B4332]/95 inline-flex items-center justify-center gap-1"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </a>
                </div>
              ) : (
                <span className="text-xs text-neutral-400 italic py-6 text-center">Not uploaded</span>
              )}
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center border-t border-black/5 pt-4">
          <div>
            <span className="text-[10px] uppercase font-semibold text-neutral-400">Current Status</span>
            <div className="mt-1"><StatusBadge status={record.status || "pending"} /></div>
          </div>
          <div className="flex gap-2">
            {(record.status === "pending" || record.status === "approved") && (
              <button 
                type="button"
                onClick={() => onReject(record)}
                className="px-6 py-2 border border-rose-200 hover:bg-rose-50 text-rose-700 font-semibold rounded-xl text-sm transition-colors"
              >
                Reject KYC
              </button>
            )}
            {(record.status === "pending" || record.status === "rejected") && (
              <button 
                type="button"
                onClick={() => onApprove(record.user_id)}
                className="px-6 py-2 bg-[#2D6A4F] hover:bg-[#2D6A4F]/90 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                Approve KYC
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



export default function AdminKyc() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  // filters & search & pagination state
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // default to 10 entries!

  const reload = useCallback(
    () => api.get("/admin/kyc").then((r) => setItems(r.data || [])),
    []
  );
  
  useEffect(() => { reload(); }, [reload]);

  // Reset page to 1 when filters change
  useEffect(() => { setPage(1); }, [statusFilter, q, pageSize]);

  // Filter items on client-side
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // status match
      const currentStatus = item.status || "pending";
      if (statusFilter !== "all" && currentStatus !== statusFilter) return false;

      // search match
      if (q.trim()) {
        const query = q.toLowerCase();
        const agentName = (item.user?.full_name || "").toLowerCase();
        const firmName = (item.user?.firm_name || "").toLowerCase();
        const distributor = (item.distributor_name || "").toLowerCase();
        const phone = (item.user?.phone || "").toLowerCase();
        if (
          !agentName.includes(query) &&
          !firmName.includes(query) &&
          !distributor.includes(query) &&
          !phone.includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [items, statusFilter, q]);

  // Paginated items on client-side
  const paginatedItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredItems.slice(startIndex, startIndex + pageSize);
  }, [filteredItems, page, pageSize]);

  const approve = async (uid) => {
    try { 
      await api.post(`/admin/kyc/${uid}/approve`, { note: "" }); 
      toast.success("KYC approved successfully"); 
      setSelected(null);
      reload(); 
    } catch (e) { 
      toast.error(formatErr(e.response?.data?.detail)); 
    }
  };

  const reject = async (uid, reason) => {
    try {
      await api.post(`/admin/kyc/${uid}/reject`, { note: reason });
      toast.success("KYC rejected successfully");
      setRejecting(null);
      setSelected(null);
      reload();
    } catch (e) { 
      toast.error(formatErr(e.response?.data?.detail)); 
    }
  };

  const clearAll = () => {
    setQ("");
    setStatusFilter("all");
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="KYC Review" subtitle="Review, approve, or reject agent KYC applications and firm documents." />

      {/* Filters card */}
      <div className="mfp-card p-5 mb-6 space-y-4" data-testid="kyc-filter-bar">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative md:col-span-2">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by Agent Name, Firm Name, Phone..."
              className="mfp-input !pl-11 !pr-10"
              data-testid="kyc-search"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
                data-testid="kyc-search-clear"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mfp-input w-full"
              data-testid="kyc-status-filter"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="not_submitted">Not Submitted</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-black/5">
          <div className="text-sm text-neutral-600" data-testid="kyc-results-count">
            Matched <span className="font-semibold">{filteredItems.length}</span> KYC records
          </div>
          <button onClick={clearAll} className="mfp-btn-ghost" data-testid="kyc-clear-all">
            <RotateCcw className="h-3.5 w-3.5" /> Clear All Filters
          </button>
        </div>
      </div>

      <DataTable
        columns={[
          { key: "agent", label: "Agent Name", render: (r) => r.user?.full_name || "—" },
          { key: "firm_name", label: "Firm Name", render: (r) => r.user?.firm_name || "—" },
          { key: "distributor", label: "Distributor", render: (r) => (
            r.distributor_name === "Admin"
              ? <span className="italic text-neutral-500">Admin</span>
              : <span className="font-medium">{r.distributor_name || "—"}</span>
          ) },
          { key: "phone", label: "Phone", render: (r) => r.user?.phone || "—" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status || "pending"} /> },
          { key: "submitted_at", label: "Submitted", render: (r) => fmtDate(r.submitted_at || r.updated_at) },
          { key: "actions", label: "Action", render: (r) => (
            <button
              onClick={() => setSelected(r)}
              className="p-1.5 border border-neutral-200 text-[#1B4332] hover:bg-neutral-50 rounded-lg transition-colors inline-flex items-center justify-center gap-1 font-semibold text-xs"
              title="Review Application"
            >
              <Eye className="h-4 w-4" /> Review Application
            </button>
          ) },
        ]}
        rows={paginatedItems}
        empty="No agent KYC records yet"
        pagination={{
          page,
          pageSize,
          total: filteredItems.length,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
        }}
      />
      
      {selected && (
        <KycDetailModal
          record={selected}
          onClose={() => setSelected(null)}
          onApprove={approve}
          onReject={(rec) => setRejecting(rec)}
        />
      )}

      {rejecting && (
        <RejectModal
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => reject(rejecting.user_id, reason)}
        />
      )}
    </div>
  );
}
