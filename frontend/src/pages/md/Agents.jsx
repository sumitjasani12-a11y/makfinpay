import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

export default function MdAgents() {
  const { user } = useAuth();
  const base = Number(user?.commission_percent || 0);

  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", address: "", firm_name: "", firm_address: "", markup: "" });
  const [createdCreds, setCreatedCreds] = useState(null);

  const reload = () => api.get("/master-distributor/agents").then((r) => setItems(r.data));
  useEffect(() => { reload(); }, []);

  const markupNum = parseFloat(form.markup) || 0;
  const previewTotal = +(base + markupNum).toFixed(4);

  const create = async (e) => {
    e.preventDefault();
    if (markupNum < 0) return toast.error("Markup must be ≥ 0");
    try {
      const { data } = await api.post("/master-distributor/users", {
        role: "agent",
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        firm_name: form.firm_name,
        firm_address: form.firm_address,
        commission_percent: markupNum,
      });
      toast.success("Agent created successfully");
      setShow(false);
      setForm({ full_name: "", email: "", phone: "", address: "", firm_name: "", firm_address: "", markup: "" });
      reload();
      if (data && data.password) {
        setCreatedCreds(data);
      }
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
          {[
            ["Full Name", "full_name", "text"],
            ["Email Address", "email", "email"],
            ["Phone Number", "phone", "text"],
            ["Personal Address", "address", "text"],
            ["Firm Name", "firm_name", "text"],
            ["Firm Address", "firm_address", "text"]
          ].map(([l, k, t]) => (
            <div key={k}>
              <label className="mfp-label">{l}</label>
              <input className="mfp-input" type={t} required value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`md-agent-form-${k}`} />
            </div>
          ))}
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
            const resolved = !r.kyc_status || r.kyc_status === "approved" ? "approved" : (r.kyc_status === "rejected" ? "rejected" : "pending");
            return <StatusBadge status={resolved} />;
          } },
          { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
          { key: "actions", label: "Action", render: (r) => (
            r.created_by_role === "master_distributor"
              ? (
                  <button
                    onClick={() => toggle(r.id)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      r.frozen ? "bg-neutral-200" : "bg-[#2D6A4F]"
                    }`}
                    title={r.frozen ? "Frozen (Click to Enable)" : "Active (Click to Freeze)"}
                    data-testid={`md-freeze-agent-${r.id}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        r.frozen ? "translate-x-0" : "translate-x-5"
                      }`}
                    />
                  </button>
                )
              : <span className="text-xs text-neutral-500 italic">Managed by distributor</span>
          ) },
        ]}
        rows={items}
        empty="No agents in your downline yet."
      />

      {createdCreds && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-black/5 shadow-2xl animate-fade-in" data-testid="creds-modal">
            <h3 className="text-lg font-semibold text-neutral-800 mb-2">Agent Created Successfully!</h3>
            <p className="text-xs text-neutral-500 mb-4">Please copy these credentials and share them with the agent. The password will not be shown again.</p>

            <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-100 mb-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400">Email Address</span>
                <div className="text-sm font-medium text-neutral-800 mt-0.5 break-all">{createdCreds.email}</div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400">Temporary Password</span>
                <div className="text-sm font-mono font-semibold text-emerald-700 mt-0.5 break-all bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100 flex justify-between items-center">
                  <span>{createdCreds.password}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 px-2 py-1 rounded bg-emerald-100"
                    onClick={() => {
                      navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
                      toast.success("Credentials copied to clipboard");
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
            <button className="mfp-btn-primary w-full py-2.5 font-bold" onClick={() => setCreatedCreds(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
