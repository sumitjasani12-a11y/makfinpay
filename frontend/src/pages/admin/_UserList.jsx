import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, DataTable, StatusBadge, EmptyState } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { Plus, Eye, X, FileDown, Loader2, Search, RotateCcw } from "lucide-react";

function UserForm({ role, onCreated }) {
  const [form, setForm] = useState({ role, full_name: "", email: "", password: "", phone: "", address: "", aadhaar_path: "", pan_path: "", commission_percent: "" });
  const [busy, setBusy] = useState(false);
  const isAgent = role === "agent";
  const isMd = role === "master_distributor";
  const submit = async (e) => {
    e.preventDefault();
    if (isAgent && (!form.aadhaar_path || !form.pan_path)) {
      return toast.error("Aadhaar and PAN documents are required");
    }
    setBusy(true);
    try {
      const body = { ...form };
      if (isMd && form.commission_percent === "") {
        delete body.commission_percent;
      } else if (isMd) {
        body.commission_percent = parseFloat(form.commission_percent);
      } else {
        delete body.commission_percent;
      }
      const { data } = await api.post("/admin/users", body);
      toast.success(`${role.replace("_", " ")} created`);
      onCreated(data);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || e.message);
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mfp-card p-6 grid sm:grid-cols-2 gap-4">
      {[
        ["Full Name", "full_name"], ["Email", "email"], ["Password", "password"],
        ["Phone", "phone"], ["Address", "address"],
      ].map(([l, k]) => (
        <div key={k}>
          <label className="mfp-label">{l}</label>
          <input className="mfp-input" required type={k === "password" ? "password" : k === "email" ? "email" : "text"}
            value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`form-${k}`} />
        </div>
      ))}
      {isAgent && (
        <>
          <div>
            <label className="mfp-label">Aadhaar Card</label>
            <FileUpload onUploaded={(p) => setForm((f) => ({ ...f, aadhaar_path: p }))} label="Upload Aadhaar Card" testid="form-aadhaar" />
          </div>
          <div>
            <label className="mfp-label">PAN Card</label>
            <FileUpload onUploaded={(p) => setForm((f) => ({ ...f, pan_path: p }))} label="Upload PAN Card" testid="form-pan" />
          </div>
        </>
      )}
      {isMd && (
        <div>
          <label className="mfp-label">Commission % (optional)</label>
          <input className="mfp-input" type="number" step="0.01" min="0" value={form.commission_percent}
            onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
            placeholder="Leave empty to use platform default"
            data-testid="form-commission" />
          <div className="mt-1 text-xs text-neutral-500">This is the ADMIN&apos;S portion of every downline recharge under this MD.</div>
        </div>
      )}
      {!isMd && (
        <div className="sm:col-span-2 text-xs text-neutral-500">Commission will be auto-assigned from the platform Default %. Edit later from Commission page.</div>
      )}
      <div className="sm:col-span-2">
        <button disabled={busy} className="mfp-btn-primary" data-testid="form-submit">
          <Plus className="h-4 w-4" /> {busy ? "Creating…" : `Create ${role.replace("_", " ")}`}
        </button>
      </div>
    </form>
  );
}

function MdDetailModal({ md, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
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
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-start overflow-y-auto p-4 pt-10" onClick={onClose}>
      <div className="bg-[#FDFCF8] rounded-2xl max-w-6xl w-full mx-auto" onClick={(e) => e.stopPropagation()} data-testid="md-detail-modal">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <div>
            <div className="mfp-overline">Master Distributor Detail</div>
            <div className="text-lg font-medium">{md.full_name}</div>
          </div>
          <button onClick={onClose} className="mfp-btn-ghost p-2" data-testid="md-detail-close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ["Name", md.full_name],
              ["Email", md.email],
              ["Phone", md.phone || "—"],
              ["Commission %", `${md.commission_percent}%`],
              ["Earnings", fmtMoney(md.earnings ?? 0)],
              ["Status", null],
            ].map(([k, v]) => (
              <div key={k} className="mfp-card p-4">
                <div className="mfp-overline">{k}</div>
                <div className="mt-2 text-sm font-medium break-all">
                  {k === "Status" ? <StatusBadge status={md.frozen ? "rejected" : "approved"} /> : v}
                </div>
              </div>
            ))}
          </div>

          {loading ? <EmptyState>Loading…</EmptyState> : (
            <>
              <div>
                <h3 className="text-base font-medium mb-3">Distributors under {md.full_name} ({distributors.length})</h3>
                {distributors.length === 0 ? <EmptyState>No distributors yet.</EmptyState> : (
                  <div className="mfp-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full mfp-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Earnings</th><th>Markup %</th><th>Total %</th><th>Status</th><th>Created</th></tr></thead>
                    <tbody>{distributors.map((d) => (
                      <tr key={d.id} data-testid={`md-dist-row-${d.id}`}>
                        <td className="px-4 py-3 text-sm">{d.full_name}</td>
                        <td className="px-4 py-3 text-sm">{d.email}</td>
                        <td className="px-4 py-3 text-sm">{d.phone || "—"}</td>
                        <td className="px-4 py-3 text-sm">{fmtMoney(d.earnings ?? 0)}</td>
                        <td className="px-4 py-3 text-sm">{d.md_pct ?? d.markup_commission ?? 0}%</td>
                        <td className="px-4 py-3 text-sm"><span className="font-semibold text-[#1B4332]">{d.commission_percent}%</span></td>
                        <td className="px-4 py-3 text-sm"><StatusBadge status={d.frozen ? "rejected" : "approved"} /></td>
                        <td className="px-4 py-3 text-sm">{fmtDate(d.created_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table></div></div>
                )}
              </div>
              <div>
                <h3 className="text-base font-medium mb-3">Direct Agents ({directAgents.length})</h3>
                {directAgents.length === 0 ? <EmptyState>No direct agents.</EmptyState> : (
                  <div className="mfp-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full mfp-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Wallet</th><th>Total %</th><th>Status</th><th>Created</th></tr></thead>
                    <tbody>{directAgents.map((a) => (
                      <tr key={a.id} data-testid={`md-direct-agent-row-${a.id}`}>
                        <td className="px-4 py-3 text-sm">{a.full_name}</td>
                        <td className="px-4 py-3 text-sm">{a.email}</td>
                        <td className="px-4 py-3 text-sm">{fmtMoney(a.wallet_balance)}</td>
                        <td className="px-4 py-3 text-sm"><span className="font-semibold text-[#1B4332]">{a.commission_percent}%</span></td>
                        <td className="px-4 py-3 text-sm"><StatusBadge status={a.frozen ? "rejected" : (a.kyc_status && a.kyc_status !== "approved" ? a.kyc_status : "approved")} /></td>
                        <td className="px-4 py-3 text-sm">{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table></div></div>
                )}
              </div>
              {distributorAgents.length > 0 && (
                <div>
                  <h3 className="text-base font-medium mb-3">Agents via Distributors ({distributorAgents.length})</h3>
                  <div className="mfp-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full mfp-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Wallet</th><th>Total %</th><th>Status</th><th>Created</th></tr></thead>
                    <tbody>{distributorAgents.map((a) => (
                      <tr key={a.id} data-testid={`md-via-agent-row-${a.id}`}>
                        <td className="px-4 py-3 text-sm">{a.full_name}</td>
                        <td className="px-4 py-3 text-sm">{a.email}</td>
                        <td className="px-4 py-3 text-sm">{fmtMoney(a.wallet_balance)}</td>
                        <td className="px-4 py-3 text-sm"><span className="font-semibold text-[#1B4332]">{a.commission_percent}%</span></td>
                        <td className="px-4 py-3 text-sm"><StatusBadge status={a.frozen ? "rejected" : (a.kyc_status && a.kyc_status !== "approved" ? a.kyc_status : "approved")} /></td>
                        <td className="px-4 py-3 text-sm">{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table></div></div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-start overflow-y-auto p-4 pt-10" onClick={onClose}>
      <div className="bg-[#FDFCF8] rounded-2xl max-w-5xl w-full mx-auto" onClick={(e) => e.stopPropagation()} data-testid="distributor-detail-modal">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <div>
            <div className="mfp-overline">Distributor Detail</div>
            <div className="text-lg font-medium">{distributor.full_name}</div>
          </div>
          <button onClick={onClose} className="mfp-btn-ghost p-2" data-testid="distributor-detail-close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ["Name", distributor.full_name],
              ["Email", distributor.email],
              ["Phone", distributor.phone || "—"],
              ["Commission %", `${distributor.commission_percent}%`],
              ["Earnings", fmtMoney(distributor.earnings ?? 0)],
              ["Status", null],
            ].map(([k, v]) => (
              <div key={k} className="mfp-card p-4">
                <div className="mfp-overline">{k}</div>
                <div className="mt-2 text-sm font-medium break-all">
                  {k === "Status"
                    ? <StatusBadge status={distributor.frozen ? "rejected" : "approved"} />
                    : v}
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-base font-medium mb-3">Agents Under {distributor.full_name}</h3>
            {loading ? (
              <EmptyState>Loading…</EmptyState>
            ) : agents.length === 0 ? (
              <EmptyState>No agents created by this distributor yet.</EmptyState>
            ) : (
              <div className="mfp-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full mfp-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Wallet</th>
                        <th>Markup %</th>
                        <th>Total Commission %</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a) => (
                        <tr key={a.id} data-testid={`distributor-agent-row-${a.id}`}>
                          <td className="px-4 py-3 text-sm">{a.full_name}</td>
                          <td className="px-4 py-3 text-sm">{a.email}</td>
                          <td className="px-4 py-3 text-sm">{a.phone || "—"}</td>
                          <td className="px-4 py-3 text-sm">{fmtMoney(a.wallet_balance)}</td>
                          <td className="px-4 py-3 text-sm">{a.markup_commission ?? 0}%</td>
                          <td className="px-4 py-3 text-sm"><span className="font-semibold text-[#1B4332]">{a.commission_percent}%</span></td>
                          <td className="px-4 py-3 text-sm"><StatusBadge status={a.frozen ? "rejected" : "approved"} /></td>
                          <td className="px-4 py-3 text-sm">{fmtDate(a.created_at)}</td>
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
    </div>
  );
}

export function AdminUserList({ role }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);
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
            <button className="mfp-btn-primary" onClick={() => setShow(!show)} data-testid="toggle-create-form">
              <Plus className="h-4 w-4" /> New {roleSingular}
            </button>
          </div>
        }
      />
      {show && <div className="mb-8"><UserForm role={role} onCreated={() => { setShow(false); reload(); }} /></div>}

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

      <DataTable
        columns={[
          { key: "full_name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          // Agents: show direct parent (Distributor / MD / Admin).
          // Distributors: show Created By (MD / Admin).
          ...(role === "agent" ? [{
            key: "creator_name",
            label: "Distributor",
            render: (r) => r.creator_name === "Admin"
              ? <span className="italic text-neutral-500">Admin</span>
              : <span className="font-medium">{r.creator_name || "—"}</span>,
          }] : []),
          ...(isDistributor ? [{
            key: "creator_name",
            label: "Created By",
            render: (r) => r.creator_name === "Admin"
              ? <span className="italic text-neutral-500">Admin</span>
              : <span className="font-medium">{r.creator_name || "—"}</span>,
          }] : []),
          ...(isMd ? [
            { key: "distributors_count", label: "Distributors", render: (r) => r.distributors_count ?? 0 },
            { key: "agents_count", label: "Agents", render: (r) => r.agents_count ?? 0 },
            { key: "earnings", label: "Earnings", render: (r) => fmtMoney(r.earnings ?? 0) },
          ] : []),
          ...(isDistributor ? [{ key: "earnings", label: "Earnings", render: (r) => fmtMoney(r.earnings ?? 0) }] : []),
          ...(role === "agent" ? [{ key: "wallet_balance", label: "Wallet", render: (r) => fmtMoney(r.wallet_balance) }] : []),
          { key: "commission_percent", label: "Comm %", render: (r) => `${r.commission_percent ?? "—"}%` },
          { key: "status", label: "Status", render: (r) => {
            if (r.frozen) return <StatusBadge status="rejected" />;
            if (role === "agent" && r.kyc_status && r.kyc_status !== "approved") {
              return <StatusBadge status={r.kyc_status === "pending" ? "pending" : "rejected"} />;
            }
            return <StatusBadge status="approved" />;
          } },
          { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
          { key: "actions", label: "Action", render: (r) => (
            <div className="flex gap-2">
              {(isDistributor || isMd) && (
                <button
                  className="mfp-btn-outline px-3 py-1.5 text-xs"
                  onClick={() => setDetail(r)}
                  data-testid={`view-${r.id}`}
                >
                  <Eye className="h-3 w-3" /> View
                </button>
              )}
              <button className="mfp-btn-outline px-3 py-1.5 text-xs" onClick={() => toggle(r.id)} data-testid={`freeze-${r.id}`}>
                {r.frozen ? "Unfreeze" : "Freeze"}
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

      {detail && isMd && <MdDetailModal md={detail} onClose={() => setDetail(null)} />}
      {detail && isDistributor && <DistributorDetailModal distributor={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
