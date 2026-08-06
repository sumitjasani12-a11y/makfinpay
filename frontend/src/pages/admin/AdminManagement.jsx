import React, { useState, useEffect } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Users, Shield, ShieldAlert, KeyRound, Edit, Trash2, CheckSquare, Square,
  CheckCircle2, AlertTriangle, ToggleLeft, ToggleRight, X, PlusCircle, Save
} from "lucide-react";

const PERMISSIONS_LIST = [
  { key: "dashboard", label: "Dashboard Overview" },
  { key: "master-distributors", label: "Master Distributors" },
  { key: "distributors", label: "Distributors" },
  { key: "agents", label: "Agents" },
  { key: "recharges", label: "QR Approvals" },
  { key: "withdrawals", label: "Pay Withdrawals" },
  { key: "transactions", label: "CC Bill Request" },
  { key: "live-bill-history", label: "Live Bill History" },
  { key: "statement", label: "Admin Statement" },
  { key: "qrcodes", label: "QR Codes" },
  { key: "qr-name-entry", label: "QR Name Entry" },
  { key: "qr-gallery", label: "QR Gallery" },
  { key: "headlines", label: "Add Announcement" },
  { key: "commission", label: "Set Commission" },
  { key: "service-slabs", label: "Service Slabs" },
  { key: "banks", label: "Bank Entry" },
  { key: "kyc", label: "KYC Requests" },
  { key: "reasons", label: "Reason Entry" },
  { key: "audit", label: "Audit Logs" },
  { key: "change-password", label: "Change Password" },
  { key: "settings", label: "Settings" },
  { key: "policies", label: "Rules & Policies" }
];

export default function AdminManagement() {
  const { user } = useAuth();
  const isSuperAdmin = user?.email?.toLowerCase() === "jigs.vanani@gmail.com";
  
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [frozen, setFrozen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/admins");
      setAdmins(res.data || []);
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Failed to load admins list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const openCreateModal = () => {
    setEditingAdmin(null);
    setFullName("");
    setEmail("");
    setPassword("");
    setSelectedPermissions(PERMISSIONS_LIST.map(p => p.key)); // Default full access
    setFrozen(false);
    setModalOpen(true);
  };

  const openEditModal = (admin) => {
    setEditingAdmin(admin);
    setFullName(admin.full_name);
    setEmail(admin.email);
    setPassword(""); // Clear password field
    setSelectedPermissions(admin.permissions || []);
    setFrozen(admin.frozen);
    setModalOpen(true);
  };

  const handlePermissionToggle = (key) => {
    setSelectedPermissions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllPermissions = () => {
    if (selectedPermissions.length === PERMISSIONS_LIST.length) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions(PERMISSIONS_LIST.map(p => p.key));
    }
  };

  const handleBlockToggle = async (admin) => {
    const updatedStatus = !admin.frozen;
    try {
      await api.put(`/admin/admins/${admin.id}`, {
        frozen: updatedStatus
      });
      toast.success(`${admin.email} has been ${updatedStatus ? "blocked" : "unblocked"}`);
      fetchAdmins();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Failed to update block status");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error("Full Name and Email are required");
      return;
    }
    
    setBusy(true);
    try {
      if (editingAdmin) {
        // Edit existing admin
        await api.put(`/admin/admins/${editingAdmin.id}`, {
          full_name: fullName,
          password: password.trim() ? password : undefined,
          permissions: selectedPermissions,
          frozen: frozen
        });
        toast.success("Admin updated successfully");
      } else {
        // Create new admin
        if (!password.trim()) {
          toast.error("Password is required for new accounts");
          setBusy(false);
          return;
        }
        await api.post("/admin/admins", {
          full_name: fullName,
          email: email,
          password: password,
          permissions: selectedPermissions,
          frozen: frozen
        });
        toast.success("Admin user created successfully");
      }
      setModalOpen(false);
      fetchAdmins();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Failed to save administrator");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (admin) => {
    if (!isSuperAdmin) {
      toast.error("Access Denied: Only Super Admin can delete administrator accounts");
      return;
    }
    if (!window.confirm(`Are you absolutely sure you want to delete ${admin.email}? This action is permanent.`)) {
      return;
    }
    
    try {
      await api.delete(`/admin/admins/${admin.id}`);
      toast.success("Admin account deleted successfully");
      fetchAdmins();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Failed to delete admin");
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="mfp-card p-12 text-center space-y-3">
        <ShieldAlert className="h-12 w-12 mx-auto text-rose-500" />
        <div className="text-lg font-bold text-neutral-800">Access Denied</div>
        <p className="text-sm text-neutral-500 font-normal">
          Only the Super Admin (jigs.vanani@gmail.com) can access Administrator Management.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Admin Management" 
        subtitle="Configure sub-admin operator accounts, customize sidebar access permissions, and manage active status." 
      />

      <div className="flex justify-between items-center">
        <div className="text-sm text-neutral-400">
          Showing <span className="font-semibold text-white">{admins.length}</span> administrator account(s)
        </div>
        <button 
          onClick={openCreateModal}
          className="mfp-btn-primary flex items-center gap-2"
        >
          <PlusCircle className="h-4.5 w-4.5" /> Add Sub-Admin
        </button>
      </div>

      {admins.length === 0 && !loading ? (
        <div className="mfp-card p-12 text-center text-neutral-400">
          No sub-admin accounts created yet.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {admins.map((admin) => (
            <div 
              key={admin.id} 
              className={`mfp-card relative flex flex-col justify-between overflow-hidden border transition-all ${
                admin.frozen ? "border-rose-500/20 bg-rose-950/5" : "border-white/5 bg-[#0F172A]/40"
              }`}
            >
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <h3 className="font-bold text-white text-base truncate max-w-[200px]" title={admin.full_name}>
                      {admin.full_name}
                    </h3>
                    <p className="text-xs text-neutral-400 truncate max-w-[200px]" title={admin.email}>
                      {admin.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`mfp-pill ${admin.frozen ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                      {admin.frozen ? "Blocked" : "Active"}
                    </span>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4 space-y-2.5">
                  <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                    Permissions ({admin.permissions?.length || 0} of {PERMISSIONS_LIST.length})
                  </div>
                  <div>
                    {admin.permissions?.length === PERMISSIONS_LIST.length ? (
                      <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1.5 rounded-lg text-xs font-semibold select-none">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span>Full Admin Access (All Screens)</span>
                      </div>
                    ) : admin.permissions && admin.permissions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 select-none custom-scrollbar">
                        {admin.permissions.map(pKey => {
                          const match = PERMISSIONS_LIST.find(p => p.key === pKey);
                          return (
                            <span key={pKey} className="text-[10px] bg-indigo-500/5 border border-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-md font-semibold">
                              {match ? match.label : pKey}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-rose-400 italic">No permissions assigned</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/5 bg-black/10 px-6 py-3.5 flex justify-between items-center gap-4">
                <button
                  onClick={() => handleBlockToggle(admin)}
                  className={`flex items-center gap-1.5 text-xs font-semibold transition-all ${
                    admin.frozen ? "text-emerald-400 hover:text-emerald-300" : "text-rose-400 hover:text-rose-300"
                  }`}
                  title={admin.frozen ? "Activate Account" : "Block Account"}
                >
                  {admin.frozen ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                  {admin.frozen ? "Unblock" : "Block"}
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openEditModal(admin)}
                    className="text-neutral-400 hover:text-white transition-all p-1"
                    title="Edit Admin Account"
                  >
                    <Edit className="h-4.5 w-4.5" />
                  </button>
                  {isSuperAdmin && (
                    <button
                      onClick={() => handleDelete(admin)}
                      className="text-rose-400 hover:text-rose-300 transition-all p-1"
                      title="Delete Admin Account"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create Dialog Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-3xl mfp-card border border-white/10 !bg-[#0b0d13] p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar">
            <button 
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Shield className="h-5.5 w-5.5 text-indigo-400" />
                {editingAdmin ? "Edit Administrator Account" : "Create New Administrator"}
              </h2>
              <p className="text-xs text-neutral-400">
                {editingAdmin ? "Update administrator name, credentials, and page navigation access." : "Establish a new sub-admin operator and assign their permitted dashboard screens."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="mfp-label">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter full name"
                    className="mfp-input"
                    required
                  />
                </div>
                <div>
                  <label className="mfp-label">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="mfp-input"
                    disabled={!!editingAdmin}
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="mfp-label">
                    {editingAdmin ? "Change Password (Optional)" : "Password"}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editingAdmin ? "Leave blank to keep unchanged" : "Enter account password"}
                    className="mfp-input"
                    required={!editingAdmin}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex flex-col justify-end pb-1">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setFrozen(!frozen)}
                      className="flex items-center gap-2 text-xs font-semibold text-neutral-200 hover:text-white"
                    >
                      {frozen ? (
                        <ToggleRight className="h-6 w-6 text-rose-500" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-neutral-400" />
                      )}
                      <span>Block / Suspend Admin Access</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    Screen Access Permissions
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAllPermissions}
                    className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-all"
                  >
                    {selectedPermissions.length === PERMISSIONS_LIST.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 p-1 bg-black/20 rounded-xl border border-white/5">
                  {PERMISSIONS_LIST.map((permission) => {
                    const isChecked = selectedPermissions.includes(permission.key);
                    return (
                      <button
                        key={permission.key}
                        type="button"
                        onClick={() => handlePermissionToggle(permission.key)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all border ${
                          isChecked 
                            ? "bg-indigo-500/10 border-indigo-500/30 text-white font-medium shadow-sm" 
                            : "bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10"
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="h-4.5 w-4.5 text-indigo-400 shrink-0" />
                        ) : (
                          <Square className="h-4.5 w-4.5 text-neutral-500 shrink-0" />
                        )}
                        <span className="truncate">{permission.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="mfp-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="mfp-btn-primary flex items-center gap-2"
                >
                  <Save className="h-4.5 w-4.5" />
                  {busy ? "Saving…" : editingAdmin ? "Save Changes" : "Create Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
