import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge, EmptyState } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { Plus, Eye, X, FileDown, Loader2, Search, RotateCcw, Pencil, Trash2, FileSpreadsheet, Users, UserCheck, IndianRupee, Phone, Mail, Building2, Sparkles, ShieldCheck, ArrowLeft, Percent } from "lucide-react";

function UserForm({ role, editingUser, onCreated, onCancel }) {
  const [form, setForm] = useState({ 
    role, 
    full_name: editingUser?.full_name || "", 
    email: editingUser?.email || "", 
    password: "", 
    phone: editingUser?.phone || "", 
    address: editingUser?.address || "", 
    firm_name: editingUser?.firm_name || "",
    firm_address: editingUser?.firm_address || "",
    commission_percent: editingUser?.commission_percent || "" 
  });
  const [busy, setBusy] = useState(false);
  const isAgent = role === "agent";
  const isMd = role === "master_distributor";

  useEffect(() => {
    if (editingUser) {
      setForm({
        role,
        full_name: editingUser.full_name,
        email: editingUser.email,
        password: "",
        phone: editingUser.phone,
        address: editingUser.address,
        firm_name: editingUser.firm_name || "",
        firm_address: editingUser.firm_address || "",
        commission_percent: editingUser.commission_percent ?? ""
      });
    } else {
      setForm({ role, full_name: "", email: "", password: "", phone: "", address: "", firm_name: "", firm_address: "", commission_percent: "" });
    }
  }, [editingUser, role]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form };
      if (form.commission_percent !== "") {
        body.commission_percent = parseFloat(form.commission_percent);
      } else {
        delete body.commission_percent;
      }
      
      if (editingUser) {
        if (!body.password) {
          delete body.password;
        }
        await api.put(`/admin/users/${editingUser.id}`, body);
        toast.success(`${role.replace("_", " ")} updated`);
        onCreated();
      } else {
        const { data } = await api.post("/admin/users", body);
        toast.success(`${role.replace("_", " ")} created`);
        onCreated(data);
      }
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || e.message);
    } finally { setBusy(false); }
  };

  const fields = [
    { label: "Full Name", key: "full_name", type: "text", required: true },
    { label: "Email", key: "email", type: "email", required: true },
    { label: "Phone", key: "phone", type: "text", required: true },
    { label: "Address", key: "address", type: "text", required: true },
    { label: "Firm Name", key: "firm_name", type: "text", required: true },
    { label: "Firm Address", key: "firm_address", type: "text", required: true }
  ];
  
  if (editingUser) {
    fields.push({ 
      label: "Password", 
      key: "password", 
      type: "password", 
      required: false,
      placeholder: "Leave empty to keep current" 
    });
  }
  
  fields.push({
    label: role === "agent" ? "Commission % (Charges)" : "Commission %",
    key: "commission_percent",
    type: "number",
    required: false,
    placeholder: "e.g. 1.2"
  });

  return (
    <form onSubmit={submit} className="mfp-card p-6 grid sm:grid-cols-2 gap-4">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="mfp-label">{f.label}</label>
          <input 
            className="mfp-input" 
            required={f.required} 
            type={f.type}
            step={f.type === "number" ? "0.01" : undefined}
            min={f.type === "number" ? "0" : undefined}
            value={form[f.key]} 
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} 
            placeholder={f.placeholder}
            data-testid={`form-${f.key}`} 
          />
        </div>
      ))}
      <div className="sm:col-span-2 flex gap-2">
        <button disabled={busy} className="mfp-btn-primary animate-pulse-once" data-testid="form-submit">
          <Plus className="h-4 w-4" /> {busy ? "Saving…" : editingUser ? `Update ${role.replace("_", " ")}` : `Create ${role.replace("_", " ")}`}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="mfp-btn-outline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function MdDetailModal({ md, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDistributorForAgents, setSelectedDistributorForAgents] = useState(null);

  useEffect(() => {
    api.get(`/admin/master-distributors/${md.id}/downline`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatErr(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [md.id]);

  const distributors = data?.distributors || [];
  const directAgents = data?.direct_agents || [];
  const distributorAgents = data?.distributor_agents || [];

  return (
    <div className="fixed inset-0 bg-[#F8F7F2] z-50 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-black/5 px-8 py-5 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2.5 hover:bg-neutral-100 rounded-2xl transition-all border border-neutral-200 text-neutral-600 inline-flex items-center justify-center">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="text-[10px] uppercase font-black tracking-widest text-[#1B4332]/60">Master Distributor Dashboard</div>
            <h2 className="text-xl font-black text-neutral-800">{md.full_name}</h2>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-all text-neutral-400 hover:text-neutral-700">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5">
          {[
            { label: "Name", val: md.full_name, icon: Users, color: "text-blue-600 bg-blue-50" },
            { label: "Email", val: md.email, icon: Mail, color: "text-amber-600 bg-amber-50" },
            { label: "Phone", val: md.phone || "—", icon: Phone, color: "text-purple-600 bg-purple-50" },
            { label: "Commission %", val: `${md.commission_percent}%`, icon: Percent, color: "text-indigo-600 bg-indigo-50" },
            { label: "Earnings", val: fmtMoney(md.earnings ?? 0), icon: IndianRupee, color: "text-emerald-600 bg-emerald-50" },
            { label: "Status", val: null, icon: ShieldCheck, color: "text-teal-600 bg-teal-50" },
          ].map((item) => (
            <div key={item.label} className="bg-white border border-black/5 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{item.label}</span>
                <item.icon className={`h-8 w-8 p-1.5 rounded-xl ${item.color}`} />
              </div>
              <div className="mt-4 text-sm font-black text-neutral-800 break-all">
                {item.label === "Status" ? <StatusBadge status={md.frozen ? "rejected" : "approved"} /> : item.val}
              </div>
            </div>
          ))}
        </div>

        {loading ? <EmptyState>Loading…</EmptyState> : (
          <>
            {/* Distributors under MD */}
            <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-black text-neutral-800 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#1B4332]" /> Distributors under {md.full_name} ({distributors.length})
              </h3>
              {distributors.length === 0 ? <EmptyState>No distributors yet.</EmptyState> : (
                <div className="overflow-hidden border border-neutral-100 rounded-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F8F7F2] border-b border-neutral-100">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Name</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Email</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Phone</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Earnings</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Markup %</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Total %</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Created</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {distributors.map((d) => (
                          <tr key={d.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-neutral-800">{d.full_name}</td>
                            <td className="px-6 py-4 text-sm text-neutral-600">{d.email}</td>
                            <td className="px-6 py-4 text-sm text-neutral-500 font-semibold">{d.phone || "—"}</td>
                            <td className="px-6 py-4 text-sm font-black text-[#1B4332]">{fmtMoney(d.earnings ?? 0)}</td>
                            <td className="px-6 py-4 text-sm font-semibold text-neutral-500">{d.md_pct ?? d.markup_commission ?? 0}%</td>
                            <td className="px-6 py-4 text-sm"><span className="font-extrabold text-[#1B4332]">{d.commission_percent}%</span></td>
                            <td className="px-6 py-4 text-sm"><StatusBadge status={d.frozen ? "rejected" : "approved"} /></td>
                            <td className="px-6 py-4 text-sm text-neutral-400 font-semibold">{fmtDate(d.created_at)}</td>
                            <td className="px-6 py-4 text-sm text-center">
                              <button
                                onClick={() => setSelectedDistributorForAgents(d)}
                                className="px-4 py-2 text-xs inline-flex items-center gap-1.5 bg-[#1B4332]/5 text-[#1B4332] hover:bg-[#1B4332] hover:text-white border border-[#1B4332]/10 rounded-xl transition-all font-bold shadow-sm"
                              >
                                <Eye className="h-3.5 w-3.5" /> View Agents
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Direct Agents table */}
            <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-black text-neutral-800 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-indigo-600" /> Direct Agents ({directAgents.length})
              </h3>
              {directAgents.length === 0 ? <EmptyState>No direct agents.</EmptyState> : (
                <div className="overflow-hidden border border-neutral-100 rounded-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F8F7F2] border-b border-neutral-100">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Name</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Email</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Wallet</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Total %</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {directAgents.map((a) => (
                          <tr key={a.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-neutral-800">{a.full_name}</td>
                            <td className="px-6 py-4 text-sm text-neutral-600">{a.email}</td>
                            <td className="px-6 py-4 text-sm font-black text-[#1B4332]">{fmtMoney(a.wallet_balance)}</td>
                            <td className="px-6 py-4 text-sm"><span className="font-extrabold text-[#1B4332]">{a.commission_percent}%</span></td>
                            <td className="px-6 py-4 text-sm"><StatusBadge status={a.frozen ? "rejected" : (!a.kyc_status || a.kyc_status === "approved" ? "approved" : (a.kyc_status === "rejected" ? "rejected" : "pending"))} /></td>
                            <td className="px-6 py-4 text-sm text-neutral-400 font-semibold">{fmtDate(a.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Agents via Distributors table */}
            {distributorAgents.length > 0 && (
              <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="text-base font-black text-neutral-800 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" /> Agents via Distributors ({distributorAgents.length})
                </h3>
                <div className="overflow-hidden border border-neutral-100 rounded-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F8F7F2] border-b border-neutral-100">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Name</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Email</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Wallet</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Total %</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {distributorAgents.map((a) => (
                          <tr key={a.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-neutral-800">{a.full_name}</td>
                            <td className="px-6 py-4 text-sm text-neutral-600">{a.email}</td>
                            <td className="px-6 py-4 text-sm font-black text-[#1B4332]">{fmtMoney(a.wallet_balance)}</td>
                            <td className="px-6 py-4 text-sm"><span className="font-extrabold text-[#1B4332]">{a.commission_percent}%</span></td>
                            <td className="px-6 py-4 text-sm"><StatusBadge status={a.frozen ? "rejected" : (!a.kyc_status || a.kyc_status === "approved" ? "approved" : (a.kyc_status === "rejected" ? "rejected" : "pending"))} /></td>
                            <td className="px-6 py-4 text-sm text-neutral-400 font-semibold">{fmtDate(a.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedDistributorForAgents && (
        <DistributorDetailModal
          distributor={selectedDistributorForAgents}
          onClose={() => setSelectedDistributorForAgents(null)}
        />
      )}
    </div>
  );
}

function DistributorDetailModal({ distributor, onClose }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/admin/distributors/${distributor.id}/agents`)
      .then((r) => setAgents(r.data.agents))
      .catch((e) => toast.error(formatErr(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [distributor.id]);

  return (
    <div className="fixed inset-0 bg-[#F8F7F2] z-[60] overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-black/5 px-8 py-5 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2.5 hover:bg-neutral-100 rounded-2xl transition-all border border-neutral-200 text-neutral-600 inline-flex items-center justify-center">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="text-[10px] uppercase font-black tracking-widest text-[#1B4332]/60">Distributor Dashboard</div>
            <h2 className="text-xl font-black text-neutral-800">{distributor.full_name}</h2>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-xl transition-all text-neutral-400 hover:text-neutral-700">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5">
          {[
            { label: "Name", val: distributor.full_name, icon: Users, color: "text-blue-600 bg-blue-50" },
            { label: "Email", val: distributor.email, icon: Mail, color: "text-amber-600 bg-amber-50" },
            { label: "Phone", val: distributor.phone || "—", icon: Phone, color: "text-purple-600 bg-purple-50" },
            { label: "Commission %", val: `${distributor.commission_percent}%`, icon: Percent, color: "text-indigo-600 bg-indigo-50" },
            { label: "Earnings", val: fmtMoney(distributor.earnings ?? 0), icon: IndianRupee, color: "text-emerald-600 bg-emerald-50" },
            { label: "Status", val: null, icon: ShieldCheck, color: "text-teal-600 bg-teal-50" },
          ].map((item) => (
            <div key={item.label} className="bg-white border border-black/5 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{item.label}</span>
                <item.icon className={`h-8 w-8 p-1.5 rounded-xl ${item.color}`} />
              </div>
              <div className="mt-4 text-sm font-black text-neutral-800 break-all">
                {item.label === "Status" ? <StatusBadge status={distributor.frozen ? "rejected" : "approved"} /> : item.val}
              </div>
            </div>
          ))}
        </div>

        {/* Agents table */}
        <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="text-base font-black text-neutral-800 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-[#1B4332]" /> Agents Under {distributor.full_name} ({agents.length})
          </h3>
          {loading ? (
            <EmptyState>Loading…</EmptyState>
          ) : agents.length === 0 ? (
            <EmptyState>No agents created by this distributor yet.</EmptyState>
          ) : (
            <div className="overflow-hidden border border-neutral-100 rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8F7F2] border-b border-neutral-100">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Name</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Email</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Phone</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Wallet</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Markup %</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Total %</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-neutral-400">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {agents.map((a) => (
                      <tr key={a.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-neutral-800">{a.full_name}</td>
                        <td className="px-6 py-4 text-sm text-neutral-600">{a.email}</td>
                        <td className="px-6 py-4 text-sm text-neutral-500 font-semibold">{a.phone || "—"}</td>
                        <td className="px-6 py-4 text-sm font-black text-[#1B4332]">{fmtMoney(a.wallet_balance)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-neutral-500">{a.markup_commission ?? 0}%</td>
                        <td className="px-6 py-4 text-sm"><span className="font-extrabold text-[#1B4332]">{a.commission_percent}%</span></td>
                        <td className="px-6 py-4 text-sm"><StatusBadge status={a.frozen ? "rejected" : "approved"} /></td>
                        <td className="px-6 py-4 text-sm text-neutral-400 font-semibold">{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminUserList({ role }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const isDistributor = role === "distributor";
  const isMd = role === "master_distributor";
  const roleTitle = isMd ? "Master Distributors" : isDistributor ? "Distributors" : "Agents";
  const roleSingular = isMd ? "master distributor" : role;

  // filter + pagination
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 350);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const params = useMemo(() => {
    const p = { role, paginated: true, page, page_size: pageSize };
    if (debouncedQ.trim()) p.q = debouncedQ.trim();
    return p;
  }, [role, debouncedQ, page, pageSize]);

  const reload = useCallback(() => {
    setLoading(true);
    return api.get("/admin/users", { params })
      .then((r) => { setItems(r.data.items || []); setTotal(r.data.total || 0); })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load users"))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [debouncedQ, pageSize, role]);

  const toggle = async (id) => {
    try { await api.patch(`/admin/users/${id}/freeze`); toast.success("Status updated"); reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const delUser = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await api.post(`/admin/users/${id}/delete`);
      toast.success("User deleted successfully");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to delete user");
    }
  };

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const r = await api.get(`/admin/exports/${role}.pdf`, { responseType: "blob" });
      const blob = new Blob([r.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const label = roleTitle.replace(/ /g, "_");
      const today = new Date().toISOString().slice(0, 10);
      a.download = `MAK_FIN_PAY_${label}_${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${roleTitle} PDF downloaded`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Could not generate PDF, please try again");
    } finally {
      setTimeout(() => setExporting(false), 800);
    }
  };

  const exportCsv = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const r = await api.get(`/admin/exports/${role}.csv`, { responseType: "blob" });
      const blob = new Blob([r.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const label = roleTitle.replace(/ /g, "_");
      const today = new Date().toISOString().slice(0, 10);
      a.download = `MAK_FIN_PAY_${label}_${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${roleTitle} Excel/CSV downloaded`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Could not generate Excel/CSV, please try again");
    } finally {
      setTimeout(() => setExportingCsv(false), 800);
    }
  };

  return (
    <div>
      <PageHeader
        title={roleTitle}
        subtitle={`Manage all ${roleSingular}s in the system.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportPdf}
              disabled={exporting}
              className="mfp-btn-outline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              data-testid={`export-${role}-pdf`}
            >
              {exporting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing PDF…</>
                : <><FileDown className="h-4 w-4" /> Export PDF</>
              }
            </button>
            <button
              onClick={exportCsv}
              disabled={exportingCsv}
              className="mfp-btn-outline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              data-testid={`export-${role}-excel`}
            >
              {exportingCsv
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing Excel…</>
                : <><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Excel</>
              }
            </button>
            <button className="mfp-btn-primary" onClick={() => { setEditingUser(null); setShow(!show); }} data-testid="toggle-create-form">
              <Plus className="h-4 w-4" /> New {roleSingular}
            </button>
          </div>
        }
      />
      {(show || editingUser) && (
        <div className="mb-8">
          <UserForm 
            role={role} 
            editingUser={editingUser} 
            onCreated={(data) => { 
              setShow(false); 
              setEditingUser(null); 
              reload(); 
              if (data && data.password) {
                setCreatedCreds({ email: data.email, password: data.password });
              }
            }} 
            onCancel={() => { setShow(false); setEditingUser(null); }} 
          />
        </div>
      )}

      {/* Search bar */}
      <div className="mfp-card p-4 mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3" data-testid={`${role}-filter-bar`}>
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
            <Search className="h-4 w-4 text-neutral-400" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${roleTitle.toLowerCase()} by Name, Email, Phone…`}
            className="mfp-input !pl-11 !pr-10"
            data-testid={`${role}-search`}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-[#1B4332]"
              data-testid={`${role}-search-clear`}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="text-sm text-neutral-600 shrink-0" data-testid={`${role}-results-count`}>
          {loading ? "Loading…" : <>Matched <span className="font-semibold">{total.toLocaleString("en-IN")}</span></>}
        </div>
        {q && (
          <button onClick={() => { setQ(""); setPage(1); }} className="mfp-btn-ghost shrink-0" data-testid={`${role}-clear-all`}>
            <RotateCcw className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {!(role === "master_distributor" || role === "distributor") ? (
        <DataTable
          columns={[
            { key: "full_name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            // Agents: show direct parent (Distributor / MD / Admin).
            ...(role === "agent" ? [{
              key: "creator_name",
              label: "Distributor",
              render: (r) => r.creator_name === "Admin"
                ? <span className="italic text-neutral-500">Admin</span>
                : <span className="font-medium">{r.creator_name || "—"}</span>,
            }] : []),
            ...(role === "agent" ? [{ key: "wallet_balance", label: "Wallet", render: (r) => fmtMoney(r.wallet_balance) }] : []),
            { key: "commission_percent", label: "Comm %", render: (r) => `${r.commission_percent ?? "—"}%` },
            { key: "status", label: "Status", render: (r) => {
              const resolved = r.frozen ? "rejected" : (!r.kyc_status || r.kyc_status === "approved" ? "approved" : (r.kyc_status === "rejected" ? "rejected" : "pending"));
              return <StatusBadge status={resolved} />;
            } },
            { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
            { key: "actions", label: "Action", render: (r) => (
              <div className="flex items-center gap-2">
                <button 
                  className="p-1.5 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors inline-flex items-center justify-center font-semibold" 
                  onClick={() => { setShow(false); setEditingUser(r); }} 
                  title="Edit"
                  data-testid={`edit-${r.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button 
                  className="p-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center justify-center" 
                  onClick={() => delUser(r.id, r.full_name)} 
                  title="Delete"
                  data-testid={`delete-${r.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => toggle(r.id)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    r.frozen ? "bg-neutral-200" : "bg-[#2D6A4F]"
                  }`}
                  title={r.frozen ? "Frozen (Click to Enable)" : "Active (Click to Freeze)"}
                  data-testid={`freeze-${r.id}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      r.frozen ? "translate-x-0" : "translate-x-5"
                    }`}
                  />
                </button>
              </div>
            ) },
          ]}
          rows={items}
          empty={loading ? "Loading…" : `No ${roleTitle.toLowerCase()} found`}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          }}
        />
      ) : (
        <div className="space-y-6">
          {items.length === 0 ? (
            <EmptyState
              title={`No ${roleTitle.toLowerCase()} found`}
              desc="Try modifying your search filter."
              icon={Search}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((r) => (
                  <div className="bg-[#FDFCF8] border border-black/5 hover:border-[#1B4332]/20 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:shadow-[#1B4332]/5 transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-between relative overflow-hidden group" key={r.id}>
                    {/* Top Accent Gradient Bar on Hover */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-[#1B4332] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    {/* Top part: Avatar, Contact, Role badge */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Avatar Initials with Glow */}
                        <div className="h-12 w-12 rounded-2xl bg-[#1B4332]/5 text-[#1B4332] font-black text-sm flex items-center justify-center border border-[#1B4332]/10 flex-shrink-0 capitalize group-hover:bg-[#1B4332] group-hover:text-white transition-all duration-300 shadow-sm">
                          {r.full_name ? r.full_name[0] : "?"}
                        </div>
                        {/* User Details */}
                        <div className="min-w-0 space-y-1">
                          <h4 className="text-sm font-extrabold text-neutral-800 capitalize leading-tight truncate group-hover:text-[#1B4332] transition-colors" title={r.full_name}>
                            {r.full_name}
                          </h4>
                          <div className="flex items-center gap-1.5 text-neutral-400 group-hover:text-neutral-500 transition-colors">
                            <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                            <span className="text-xs font-semibold truncate block" title={r.email}>{r.email}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-neutral-400 group-hover:text-neutral-500 transition-colors">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                            <span className="text-[10px] font-bold">{r.phone || "—"}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Premium Role Badge */}
                      <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0 shadow-sm">
                        {role === "master_distributor" ? "Master Dist" : "Distributor"}
                      </span>
                    </div>

                    {/* Middle part: Micro-cards Metrics Grid */}
                    {role === "master_distributor" ? (
                      <div className="grid grid-cols-3 gap-3 my-5">
                        <div className="bg-[#F8F7F2] rounded-2xl p-2.5 text-center border border-black/[0.02] flex flex-col items-center justify-center hover:bg-white hover:shadow-sm hover:border-black/5 transition-all">
                          <Users className="h-4 w-4 text-amber-600 mb-1" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Distributors</span>
                          <span className="text-xs font-black text-neutral-800 mt-0.5">{r.distributors_count ?? 0}</span>
                        </div>
                        <div className="bg-[#F8F7F2] rounded-2xl p-2.5 text-center border border-black/[0.02] flex flex-col items-center justify-center hover:bg-white hover:shadow-sm hover:border-black/5 transition-all">
                          <UserCheck className="h-4 w-4 text-indigo-600 mb-1" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Agents</span>
                          <span className="text-xs font-black text-neutral-800 mt-0.5">{r.agents_count ?? 0}</span>
                        </div>
                        <div className="bg-[#F8F7F2] rounded-2xl p-2.5 text-center border border-black/[0.02] flex flex-col items-center justify-center hover:bg-white hover:shadow-sm hover:border-black/5 transition-all">
                          <IndianRupee className="h-4 w-4 text-emerald-600 mb-1" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Earnings</span>
                          <span className="text-xs font-black text-emerald-700 mt-0.5 truncate max-w-full" title={fmtMoney(r.earnings ?? 0)}>
                            {fmtMoney(r.earnings ?? 0).replace("₹", "")}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 my-5">
                        <div className="bg-[#F8F7F2] rounded-2xl p-2.5 text-center border border-black/[0.02] flex flex-col items-center justify-center hover:bg-white hover:shadow-sm hover:border-black/5 transition-all min-w-0">
                          <Building2 className="h-4 w-4 text-blue-600 mb-1" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Created By</span>
                          <span className="text-xs font-extrabold text-neutral-800 mt-0.5 truncate max-w-full px-1" title={r.creator_name}>
                            {r.creator_name === "Admin" ? <span className="italic text-neutral-500">Admin</span> : r.creator_name || "—"}
                          </span>
                        </div>
                        <div className="bg-[#F8F7F2] rounded-2xl p-2.5 text-center border border-black/[0.02] flex flex-col items-center justify-center hover:bg-white hover:shadow-sm hover:border-black/5 transition-all min-w-0">
                          <UserCheck className="h-4 w-4 text-indigo-600 mb-1" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Agents</span>
                          <span className="text-xs font-black text-neutral-800 mt-0.5">{r.agents_count ?? 0}</span>
                        </div>
                        <div className="bg-[#F8F7F2] rounded-2xl p-2.5 text-center border border-black/[0.02] flex flex-col items-center justify-center hover:bg-white hover:shadow-sm hover:border-black/5 transition-all min-w-0">
                          <IndianRupee className="h-4 w-4 text-emerald-600 mb-1" />
                          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Earnings</span>
                          <span className="text-xs font-black text-emerald-700 mt-0.5 truncate max-w-full" title={fmtMoney(r.earnings ?? 0)}>
                            {fmtMoney(r.earnings ?? 0).replace("₹", "")}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Bottom part: Status & Actions */}
                    <div className="flex items-center justify-between border-t border-black/5 pt-4">
                      {/* Status Badge & Comm Info */}
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.frozen ? "rejected" : (!r.kyc_status || r.kyc_status === "approved" ? "approved" : (r.kyc_status === "rejected" ? "rejected" : "pending"))} />
                        <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-md">Comm: {r.commission_percent ?? 0}%</span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          className="p-1.5 border border-neutral-200 text-neutral-600 hover:bg-[#1B4332] hover:text-white hover:border-[#1B4332] rounded-xl transition-all inline-flex items-center justify-center bg-white shadow-sm hover:shadow-md"
                          onClick={() => setDetail(r)}
                          title="View Details"
                          data-testid={`view-${r.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button 
                          className="p-1.5 border border-neutral-200 text-neutral-600 hover:bg-[#1B4332] hover:text-white hover:border-[#1B4332] rounded-xl transition-all inline-flex items-center justify-center bg-white shadow-sm hover:shadow-md" 
                          onClick={() => { setShow(false); setEditingUser(r); }} 
                          title="Edit"
                          data-testid={`edit-${r.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button 
                          className="p-1.5 border border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white hover:border-rose-600 rounded-xl transition-all inline-flex items-center justify-center bg-white shadow-sm hover:shadow-md" 
                          onClick={() => delUser(r.id, r.full_name)} 
                          title="Delete"
                          data-testid={`delete-${r.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggle(r.id)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            r.frozen ? "bg-neutral-200" : "bg-[#2D6A4F]"
                          }`}
                          title={r.frozen ? "Frozen (Click to Enable)" : "Active (Click to Freeze)"}
                          data-testid={`freeze-${r.id}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              r.frozen ? "translate-x-0" : "translate-x-4"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Card View Pagination Bar */}
              <div className="flex items-center justify-between border-t border-black/5 pt-4 mt-6">
                <div className="text-xs text-neutral-500 font-medium">
                  Showing <span className="font-semibold">{items.length}</span> of <span className="font-semibold">{total}</span> users
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <span>Rows:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                      className="bg-[#FDFCF8] border border-black/10 rounded-lg px-2 py-1 outline-none text-xs"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="px-3 py-1 bg-white border border-neutral-200 text-neutral-600 rounded-lg disabled:opacity-50 text-xs font-semibold hover:bg-neutral-50 transition-colors"
                    >
                      Prev
                    </button>
                    <span className="text-xs font-bold text-neutral-700 px-1">Page {page}</span>
                    <button
                      disabled={page * pageSize >= total}
                      onClick={() => setPage(page + 1)}
                      className="px-3 py-1 bg-white border border-neutral-200 text-neutral-600 rounded-lg disabled:opacity-50 text-xs font-semibold hover:bg-neutral-50 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {detail && isMd && <MdDetailModal md={detail} onClose={() => setDetail(null)} />}
      {detail && isDistributor && <DistributorDetailModal distributor={detail} onClose={() => setDetail(null)} />}

      {createdCreds && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4">
          <div className="bg-[#FDFCF8] rounded-2xl p-6 max-w-md w-full border border-black/5 shadow-2xl" data-testid="creds-modal">
            <h3 className="text-lg font-semibold text-neutral-800 mb-2">User Created Successfully!</h3>
            <p className="text-xs text-neutral-500 mb-4">Please copy these credentials and share them with the user. The password will not be shown again.</p>
            
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
            
            <button 
              type="button"
              className="mfp-btn-primary w-full"
              onClick={() => setCreatedCreds(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
