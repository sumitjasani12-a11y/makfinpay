import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function MdAgents() {
  const { user } = useAuth();
  const base = Number(user?.commission_percent || 0);

  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", phone: "", address: "", aadhaar_path: "", pan_path: "", markup: "" });

  const reload = () => api.get("/master-distributor/agents").then((r) => setItems(r.data));
  useEffect(() => { reload(); }, []);

  const markupNum = parseFloat(form.markup) || 0;
  const previewTotal = +(base + markupNum).toFixed(4);

  const create = async (e) => {
    e.preventDefault();
    if (markupNum < 0) return toast.error("Markup must be ≥ 0");
    if (!form.aadhaar_path || !form.pan_path) return toast.error("Aadhaar and PAN documents are required");
    try {
      await api.post("/master-distributor/users", {
        role: "agent",
        full_name: form.full_name, email: form.email, password: form.password,
        phone: form.phone, address: form.address,
        aadhaar_path: form.aadhaar_path, pan_path: form.pan_path,
        commission_percent: markupNum,
      });
      toast.success("Agent created — pending KYC approval");
      setShow(false);
      setForm({ full_name: "", email: "", password: "", phone: "", address: "", aadhaar_path: "", pan_path: "", markup: "" });
      reload();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const toggle = async (id) => {
    try { await api.patch(`/master-distributor/users/${id}/freeze`); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader
        title="My Agents"
        subtitle={`Every agent in your downline — direct and via your distributors. Base commission ${base}%.`}
        actions={<button className="mfp-btn-primary" onClick={() => setShow(!show)} data-testid="md-new-agent-btn"><Plus className="h-4 w-4" /> New Agent (Direct)</button>}
      />

      {show && (
        <form onSubmit={create} className="mfp-card p-6 grid sm:grid-cols-2 gap-4 mb-8">
          {[["Full Name", "full_name"], ["Email", "email"], ["Password", "password"], ["Phone", "phone"], ["Address", "address"]].map(([l, k]) => (
            <div key={k}>
              <label className="mfp-label">{l}</label>
              <input className="mfp-input" type={k === "password" ? "password" : k === "email" ? "email" : "text"} required value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`md-agent-form-${k}`} />
            </div>
          ))}
          <div>
            <label className="mfp-label">Aadhaar Card</label>
            <FileUpload onUploaded={(p) => setForm((f) => ({ ...f, aadhaar_path: p }))} label="Upload Aadhaar Card" testid="md-agent-form-aadhaar" />
          </div>
          <div>
            <label className="mfp-label">PAN Card</label>
            <FileUpload onUploaded={(p) => setForm((f) => ({ ...f, pan_path: p }))} label="Upload PAN Card" testid="md-agent-form-pan" />
          </div>
          <div>
            <label className="mfp-label">Add Your Markup %</label>
            <input className="mfp-input" type="number" step="0.01" min="0" value={form.markup} onChange={(e) => setForm({ ...form, markup: e.target.value })} placeholder="Enter markup percentage" data-testid="md-agent-form-markup" />
          </div>
          <div className="sm:col-span-2 rounded-xl bg-[#F4F3ED] p-4 text-sm space-y-1.5" data-testid="md-agent-markup-preview">
            <div className="flex justify-between"><span className="text-neutral-600">Base (Admin) Commission</span><span className="font-medium">{base}%</span></div>
            <div className="flex justify-between"><span className="text-neutral-600">Your Markup</span><span className="font-medium">{markupNum}%</span></div>
            <div className="border-t border-black/10 my-1" />
            <div className="flex justify-between text-base"><span className="font-semibold">Agent Total</span><span className="font-semibold text-[#1B4332]" data-testid="md-agent-markup-preview-total">{previewTotal}%</span></div>
          </div>
          <div className="sm:col-span-2"><button className="mfp-btn-primary" data-testid="md-agent-form-submit">Create Agent</button></div>
        </form>
      )}

      <DataTable
        columns={[
          { key: "full_name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "creator_name", label: "Via", render: (r) => r.creator_name === "Direct" ? <span className="mfp-pill bg-[#E8E5D7] text-[#1B4332]">Direct</span> : <span className="font-medium">{r.creator_name || "—"}</span> },
          { key: "wallet_balance", label: "Wallet", render: (r) => fmtMoney(r.wallet_balance) },
          { key: "commission_percent", label: "Total Comm %", render: (r) => <span className="font-semibold text-[#1B4332]">{r.commission_percent}%</span> },
          { key: "kyc_status", label: "Status", render: (r) => {
            if (r.frozen) return <StatusBadge status="rejected" />;
            if (r.kyc_status && r.kyc_status !== "approved") return <StatusBadge status={r.kyc_status === "pending" ? "pending" : "rejected"} />;
            return <StatusBadge status="approved" />;
          } },
          { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
          { key: "actions", label: "Action", render: (r) => (
            r.created_by_role === "master_distributor"
              ? <button className="mfp-btn-outline px-3 py-1.5 text-xs" onClick={() => toggle(r.id)} data-testid={`md-freeze-agent-${r.id}`}>{r.frozen ? "Unfreeze" : "Freeze"}</button>
              : <span className="text-xs text-neutral-500 italic">Managed by distributor</span>
          ) },
        ]}
        rows={items}
        empty="No agents in your downline yet."
      />
    </div>
  );
}
