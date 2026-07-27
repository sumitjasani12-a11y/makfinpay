import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { Plus, Edit, Trash2, X, FileText, Check, ShieldAlert } from "lucide-react";

export default function AdminPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState(null); // null for create, id for edit

  const reload = () => {
    setLoading(true);
    api.get("/admin/policies")
      .then((r) => setPolicies(r.data || []))
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to fetch policies"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      return toast.error("Please fill in both title and content");
    }

    try {
      const payload = { title: title.trim(), content: content.trim() };
      if (editingId) {
        await api.put(`/admin/policies/${editingId}`, payload);
        toast.success("Policy updated successfully");
      } else {
        await api.post("/admin/policies", payload);
        toast.success("Policy created successfully");
      }
      handleCancel();
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Operation failed");
    }
  };

  const handleEditClick = (p) => {
    setTitle(p.title);
    setContent(p.content);
    setEditingId(p.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancel = () => {
    setTitle("");
    setContent("");
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this policy?")) return;
    try {
      await api.delete(`/admin/policies/${id}`);
      toast.success("Policy deleted");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Delete failed");
    }
  };

  return (
    <div className="overflow-x-hidden relative">
      <PageHeader
        title="Rules & Policy Management"
        subtitle="Manage terms, conditions, and operational policies for users."
      />

      {/* CREATE / EDIT FORM */}
      <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm mb-6 animate-fadeIn">
        <h3 className="text-xs uppercase font-black tracking-widest text-[#4F46E5] mb-4">
          {editingId ? "Edit Policy" : "Create New Policy"}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
              Policy Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Withdrawal Rules, KYC Terms..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#4F46E5] transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
              Policy Content
            </label>
            <textarea
              required
              rows={6}
              placeholder="Enter policy details here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#4F46E5] transition-all resize-y min-h-[140px]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {editingId && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2.5 rounded-xl border border-black/5 hover:bg-neutral-100 text-xs font-bold text-neutral-500 transition-all active:scale-98"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-xl text-xs font-bold shadow-md shadow-[#4F46E5]/10 flex items-center gap-1.5 active:scale-98 transition-all"
            >
              {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Update Policy" : "Add Policy"}
            </button>
          </div>
        </form>
      </div>

      {/* ACTIVE POLICIES LIST */}
      <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm">
        <h3 className="text-xs uppercase font-black tracking-widest text-neutral-400 mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-neutral-400" /> Active Policies
        </h3>

        {loading && policies.length === 0 ? (
          <div className="text-center py-10 text-xs text-neutral-400 font-bold">
            Loading policies...
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-10 text-xs text-neutral-400 italic">
            No policies created yet. Use the form above to add terms & conditions.
          </div>
        ) : (
          <div className="divide-y divide-black/5 space-y-5">
            {policies.map((p, idx) => (
              <div
                key={p.id}
                className={`pt-5 first:pt-0 flex flex-col md:flex-row md:items-start justify-between gap-5 animate-fadeIn`}
              >
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <h4 className="text-sm font-black text-neutral-800 tracking-wide uppercase">
                      {p.title}
                    </h4>
                    {p.active && (
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-widest">
                        Visible
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 font-medium whitespace-pre-wrap leading-relaxed">
                    {p.content}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleEditClick(p)}
                    title="Edit Policy"
                    className="p-2 hover:bg-neutral-50 border border-neutral-100 rounded-xl text-neutral-500 transition-colors"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    title="Delete Policy"
                    className="p-2 hover:bg-neutral-50 border border-neutral-100 rounded-xl text-neutral-500 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
