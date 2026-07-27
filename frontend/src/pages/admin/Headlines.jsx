import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { ScrollText, RefreshCw, Trash2, Loader2, Plus, GripVertical } from "lucide-react";

export default function AdminHeadlines() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);

  const reload = () => {
    setLoading(true);
    api.get("/admin/headlines")
      .then((r) => setItems(r.data || []))
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load headlines"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const addHeadline = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      await api.post("/admin/headlines", { message: message.trim() });
      toast.success("New headline message added");
      setMessage("");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to add headline");
    } finally {
      setBusy(false);
    }
  };

  const toggleHeadline = async (id) => {
    try {
      const res = await api.put(`/admin/headlines/${id}/toggle`);
      toast.success(`Headline state updated`);
      // Update local state directly for instant feedback
      setItems((prev) =>
        prev.map((h) => (h.id === id ? { ...h, active: res.data.active } : h))
      );
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to toggle headline");
    }
  };

  const deleteHeadline = async (id) => {
    if (!window.confirm("Are you sure you want to delete this headline?")) return;
    try {
      await api.delete(`/admin/headlines/${id}`);
      toast.success("Headline deleted");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to delete headline");
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const list = [...items];
    const draggedItem = list[draggedIndex];
    list.splice(draggedIndex, 1);
    list.splice(index, 0, draggedItem);
    
    setDraggedIndex(index);
    setItems(list);
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);
    const orderedIds = items.map((h) => h.id);
    try {
      await api.put("/admin/headlines/reorder", { ids: orderedIds });
      toast.success("Headline priority order updated");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update priority order");
      reload();
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const time = date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    return `${day}/${month}/${year} at ${time}`;
  };

  return (
    <div className="w-full min-h-screen pb-12">
      <PageHeader
        title="Headline Management"
        subtitle="Manage scrolling marquee messages for the user dashboard."
      />

      <div className="space-y-6 max-w-4xl">
        {/* NEW HEADLINE MESSAGE CARD */}
        <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm">
          <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block mb-3.5">
            New Headline Message
          </span>
          <form onSubmit={addHeadline} className="flex gap-4">
            <input
              type="text"
              required
              disabled={busy}
              placeholder="Type your marquee message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1 bg-neutral-50 border border-black/5 hover:border-black/10 focus:border-neutral-300 focus:bg-white transition-all px-5 py-3 rounded-2xl text-sm outline-none text-neutral-700 placeholder:text-neutral-400"
            />
            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="bg-[#4F46E5] hover:bg-[#4338CA] text-white px-6 py-3 rounded-2xl text-sm font-bold transition-all shadow-md shadow-[#4F46E5]/10 flex items-center gap-1.5 shrink-0 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add Headline
            </button>
          </form>
        </div>

        {/* ACTIVE HEADLINES CARD */}
        <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-black/5 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4.5 w-4.5 text-[#1B4332]" />
              <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                Active Headlines
              </span>
            </div>
            <button
              onClick={reload}
              disabled={loading}
              className="p-2 hover:bg-neutral-50 rounded-xl text-neutral-400 hover:text-neutral-600 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-[#1B4332]" : ""}`} />
            </button>
          </div>

          <p className="text-[10px] font-semibold text-neutral-400 mb-3 bg-neutral-50 px-3.5 py-2 rounded-xl border border-black/5 inline-block">
            💡 Drag and drop headline rows by their handles to set priority/number-wise order.
          </p>

          {loading ? (
            <div className="space-y-3 py-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 bg-neutral-50 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-xs text-neutral-400 font-medium">
              No headlines created yet
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between py-4 first:pt-0 last:pb-0 gap-6 transition-all duration-150 rounded-xl px-2 -mx-2 ${
                    draggedIndex === idx ? "opacity-30 bg-neutral-100 scale-[0.99]" : "hover:bg-neutral-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <GripVertical className="h-4.5 w-4.5 text-neutral-300 shrink-0 cursor-grab active:cursor-grabbing hover:text-neutral-500 transition-colors" />
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <p className="text-sm font-bold text-neutral-800 break-words leading-relaxed">
                        {item.message}
                      </p>
                      <span className="text-[10px] text-neutral-400 font-semibold block">
                        Added on {formatDateTime(item.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0" draggable={false} onDragStart={(e) => e.preventDefault()}>
                    <button
                      onClick={() => toggleHeadline(item.id)}
                      className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all select-none border ${
                        item.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100"
                          : "bg-neutral-50 text-neutral-400 border-neutral-200/40 hover:bg-neutral-100"
                      }`}
                    >
                      {item.active ? "Active" : "Inactive"}
                    </button>
                    <button
                      onClick={() => deleteHeadline(item.id)}
                      className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all border border-rose-100/50 active:scale-95"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
