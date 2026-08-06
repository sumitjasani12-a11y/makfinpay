import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import {
  Plus, Edit, Trash2, ChevronDown, ChevronUp, X, MessageSquare, Filter, HelpCircle
} from "lucide-react";

export default function AdminReasons() {
  const [categories, setCategories] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("mfp_cache_rejection_categories") || "[]");
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => !localStorage.getItem("mfp_cache_rejection_categories"));
  
  // Collapse/Expand state for each category ID
  const [expandedCats, setExpandedCats] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("mfp_cache_rejection_categories") || "[]");
      const initial = {};
      cached.forEach(cat => { initial[cat.id] = true; });
      return initial;
    } catch {
      return {};
    }
  });

  // Modals state
  const [catModal, setCatModal] = useState(null); // { mode: 'create' } or { mode: 'edit', category }
  const [reasonModal, setReasonModal] = useState(null); // { mode: 'create', category } or { mode: 'edit', category, reason }

  // Form states
  const [catName, setCatName] = useState("");
  const [showBill, setShowBill] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showKyc, setShowKyc] = useState(false);
  const [showWithdrawal, setShowWithdrawal] = useState(false);

  const [reasonText, setReasonText] = useState("");

  const reload = (silent = false) => {
    if (!silent && (!categories || categories.length === 0)) setLoading(true);
    api.get("/admin/rejection-categories")
      .then((r) => {
        const data = r.data || [];
        setCategories(data);
        try {
          localStorage.setItem("mfp_cache_rejection_categories", JSON.stringify(data));
        } catch {}
        const initialExpanded = {};
        data.forEach(cat => {
          initialExpanded[cat.id] = true;
        });
        setExpandedCats(prev => ({ ...initialExpanded, ...prev }));
      })
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to fetch rejection reasons"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload(categories.length > 0);
  }, []);

  const toggleExpand = (id) => {
    setExpandedCats(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Category Actions
  const handleOpenCreateCat = () => {
    setCatName("");
    setShowBill(false);
    setShowQr(false);
    setShowKyc(false);
    setShowWithdrawal(false);
    setCatModal({ mode: "create" });
  };

  const handleOpenEditCat = (cat) => {
    setCatName(cat.name);
    setShowBill(cat.show_bill || false);
    setShowQr(cat.show_qr || false);
    setShowKyc(cat.show_kyc || false);
    setShowWithdrawal(cat.show_withdrawal || false);
    setCatModal({ mode: "edit", category: cat });
  };

  const handleSaveCat = async (e) => {
    e.preventDefault();
    if (!catName.trim()) return toast.error("Category name is required");

    try {
      const payload = {
        name: catName,
        show_bill: showBill,
        show_qr: showQr,
        show_kyc: showKyc,
        show_withdrawal: showWithdrawal
      };

      if (catModal.mode === "create") {
        await api.post("/admin/rejection-categories", payload);
        toast.success("Category created successfully");
      } else {
        await api.put(`/admin/rejection-categories/${catModal.category.id}`, payload);
        toast.success("Category updated successfully");
      }
      setCatModal(null);
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Operation failed");
    }
  };

  const handleDeleteCat = async (id) => {
    if (!window.confirm("Are you sure you want to delete this category? All reasons inside will also be deleted.")) return;
    try {
      await api.delete(`/admin/rejection-categories/${id}`);
      toast.success("Category deleted");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Delete failed");
    }
  };

  // Reason Actions
  const handleOpenAddReason = (cat) => {
    setReasonText("");
    setReasonModal({ mode: "create", category: cat });
  };

  const handleOpenEditReason = (cat, reason) => {
    setReasonText(reason.reason_text);
    setReasonModal({ mode: "edit", category: cat, reason });
  };

  const handleSaveReason = async (e) => {
    e.preventDefault();
    if (!reasonText.trim()) return toast.error("Reason text is required");

    try {
      if (reasonModal.mode === "create") {
        await api.post("/admin/rejection-reasons", {
          category_id: reasonModal.category.id,
          reason_text: reasonText
        });
        toast.success("Reason added successfully");
      } else {
        await api.put(`/admin/rejection-reasons/${reasonModal.reason.id}`, {
          reason_text: reasonText
        });
        toast.success("Reason updated successfully");
      }
      setReasonModal(null);
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Operation failed");
    }
  };

  const handleToggleReasonActive = async (rid) => {
    try {
      const res = await api.put(`/admin/rejection-reasons/${rid}/toggle`);
      toast.success(`Reason ${res.data.active ? "enabled" : "disabled"}`);
      setCategories(prev => prev.map(cat => ({
        ...cat,
        reasons: cat.reasons.map(r => r.id === rid ? { ...r, active: res.data.active } : r)
      })));
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Toggle failed");
    }
  };

  const handleDeleteReason = async (rid) => {
    if (!window.confirm("Are you sure you want to delete this reason?")) return;
    try {
      await api.delete(`/admin/rejection-reasons/${rid}`);
      toast.success("Reason deleted");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Delete failed");
    }
  };

  return (
    <div className="overflow-x-hidden relative">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Reason Entry Management"
          subtitle="Configure rejection reasons categorized for better organization."
        />
        <button
          onClick={handleOpenCreateCat}
          className="bg-white border border-neutral-200 hover:bg-neutral-50 px-4 py-2.5 rounded-xl text-xs font-bold text-neutral-700 flex items-center gap-1.5 shadow-sm active:scale-98 transition-all"
        >
          <Plus className="h-4 w-4 text-[#4F46E5]" /> New Category
        </button>
      </div>

      {loading && categories.length === 0 ? (
        <div className="text-center py-20 text-xs text-neutral-400 font-bold">
          Loading reasons categories...
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 bg-white border border-black/5 rounded-3xl text-xs text-neutral-400">
          No reasons categories created yet. Click "New Category" to start.
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => {
            const isExpanded = !!expandedCats[cat.id];
            const reasonCount = cat.reasons?.length || 0;

            return (
              <div
                key={cat.id}
                className="bg-white border border-black/5 rounded-3xl p-5 shadow-sm space-y-4 animate-fadeIn"
              >
                {/* Category Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#EEF2FF] text-[#4F46E5] rounded-2xl border border-indigo-50">
                      <Filter className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-neutral-800 tracking-wide">
                        {cat.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-neutral-400 font-black tracking-wider uppercase">
                          {reasonCount} {reasonCount === 1 ? "REASON" : "REASONS"}
                        </span>
                        <div className="flex gap-1">
                          {cat.show_bill && (
                            <span className="text-[8px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-widest">
                              Bill
                            </span>
                          )}
                          {cat.show_kyc && (
                            <span className="text-[8px] font-black bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-100 uppercase tracking-widest">
                              KYC
                            </span>
                          )}
                          {cat.show_qr && (
                            <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-widest">
                              QR
                            </span>
                          )}
                          {cat.show_withdrawal && (
                            <span className="text-[8px] font-black bg-rose-50 text-rose-600 px-2 py-0.5 rounded border border-rose-100 uppercase tracking-widest">
                              Withdrawal
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Category Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenAddReason(cat)}
                      className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-md shadow-[#4F46E5]/10 flex items-center gap-1 active:scale-98 transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Reason
                    </button>
                    <button
                      onClick={() => handleOpenEditCat(cat)}
                      title="Edit Category"
                      className="p-2 hover:bg-neutral-50 border border-neutral-100 rounded-xl text-neutral-500 transition-colors"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCat(cat.id)}
                      title="Delete Category"
                      className="p-2 hover:bg-neutral-50 border border-neutral-100 rounded-xl text-neutral-500 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleExpand(cat.id)}
                      className="p-2 hover:bg-neutral-50 rounded-xl text-neutral-500 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Collapse/Expand Reasons List */}
                {isExpanded && (
                  <div className="pt-3 border-t border-black/5 space-y-2">
                    {reasonCount === 0 ? (
                      <p className="text-xs text-neutral-400 italic py-2 pl-2">
                        No rejection reasons configured for this category. Click "+ Add Reason" to create one.
                      </p>
                    ) : (
                      cat.reasons.map((reason) => (
                        <div
                          key={reason.id}
                          className="flex items-center justify-between bg-neutral-50/50 hover:bg-neutral-50 border border-neutral-200/40 rounded-2xl p-4 transition-colors"
                        >
                          <div className="flex items-center gap-3.5 flex-1 pr-4">
                            <div className="p-2 bg-indigo-50 text-indigo-500 rounded-xl">
                              <MessageSquare className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-bold text-neutral-700 tracking-wide break-words uppercase">
                              {reason.reason_text}
                            </span>
                          </div>

                          {/* Reason Status Toggle & Edit/Delete */}
                          <div className="flex items-center gap-3">
                            {/* Toggle Switch */}
                            <button
                              onClick={() => handleToggleReasonActive(reason.id)}
                              className={`w-9 h-5 rounded-full relative transition-colors duration-200 ${
                                reason.active ? "bg-[#10B981]" : "bg-neutral-200"
                              }`}
                            >
                              <span
                                className={`w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform duration-200 ${
                                  reason.active ? "translate-x-4" : ""
                                }`}
                              />
                            </button>

                            <button
                              onClick={() => handleOpenEditReason(cat, reason)}
                              title="Edit Reason"
                              className="p-1.5 hover:bg-white rounded-lg border border-neutral-200/50 text-neutral-400 hover:text-neutral-600 transition-colors"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteReason(reason.id)}
                              title="Delete Reason"
                              className="p-1.5 hover:bg-white rounded-lg border border-neutral-200/50 text-neutral-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* NEW/EDIT CATEGORY MODAL */}
      {catModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0" onClick={() => setCatModal(null)} />
          <form
            onSubmit={handleSaveCat}
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl z-10 border border-black/5 animate-scaleUp"
          >
            <div className="p-5 border-b border-black/5 flex items-center justify-between">
              <h4 className="text-sm font-bold text-neutral-800">
                {catModal.mode === "create" ? "New Category" : "Edit Category"}
              </h4>
              <button
                type="button"
                onClick={() => setCatModal(null)}
                className="p-1.5 hover:bg-neutral-100 rounded-xl text-neutral-500 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Category Name Input */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Identity Verification"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#4F46E5] transition-all"
                />
              </div>

              {/* Show in Pages Switches */}
              <div className="space-y-3">
                <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider block">
                  Show in Pages
                </span>
                
                {[
                  ["Bill Payment Page", showBill, setShowBill],
                  ["QR Payment Page", showQr, setShowQr],
                  ["KYC / Verification Page", showKyc, setShowKyc],
                  ["Pay Withdrawal Page", showWithdrawal, setShowWithdrawal],
                ].map(([label, val, setVal]) => (
                  <div
                    key={label}
                    onClick={() => setVal(!val)}
                    className={`flex items-center justify-between p-3.5 bg-[#F8F9FA] rounded-2xl border transition-all cursor-pointer ${
                      val ? "border-[#4F46E5]/30 bg-[#EEF2FF]/20" : "border-black/5 hover:bg-neutral-100/50"
                    }`}
                  >
                    <span className="text-xs font-bold text-neutral-700">{label}</span>
                    <div
                      className={`w-9 h-5 rounded-full relative transition-colors duration-200 ${
                        val ? "bg-[#10B981]" : "bg-neutral-200"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform duration-200 ${
                          val ? "translate-x-4" : ""
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-black/5 flex items-center justify-end gap-3 bg-neutral-50/50">
              <button
                type="button"
                onClick={() => setCatModal(null)}
                className="px-4 py-2.5 rounded-xl border border-black/5 hover:bg-neutral-100 text-xs font-bold text-neutral-500 transition-all active:scale-98"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-xl text-xs font-bold shadow-md shadow-[#4F46E5]/10 active:scale-98 transition-all"
              >
                {catModal.mode === "create" ? "Create" : "Update"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADD/EDIT REASON MODAL */}
      {reasonModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0" onClick={() => setReasonModal(null)} />
          <form
            onSubmit={handleSaveReason}
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl z-10 border border-black/5 animate-scaleUp"
          >
            <div className="p-5 border-b border-black/5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-neutral-800">
                  {reasonModal.mode === "create" ? "Add Reason" : "Edit Reason"}
                </h4>
                <p className="text-[8px] text-[#4F46E5] font-black uppercase tracking-widest mt-0.5">
                  Category: {reasonModal.category.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                className="p-1.5 hover:bg-neutral-100 rounded-xl text-neutral-500 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Reason Text */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
                  Reason Text
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter the rejection reason clearly..."
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#4F46E5] transition-all resize-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-black/5 flex items-center justify-end gap-3 bg-neutral-50/50">
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                className="px-4 py-2.5 rounded-xl border border-black/5 hover:bg-neutral-100 text-xs font-bold text-neutral-500 transition-all active:scale-98"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-xl text-xs font-bold shadow-md shadow-[#4F46E5]/10 active:scale-98 transition-all"
              >
                {reasonModal.mode === "create" ? "Save Reason" : "Update"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
