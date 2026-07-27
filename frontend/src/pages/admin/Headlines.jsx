import React, { useEffect, useState, useMemo } from "react";
import { api, formatErr, fileUrl } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { ScrollText, RefreshCw, Trash2, Loader2, Plus, GripVertical, Image as ImageIcon, Upload, Eye, X } from "lucide-react";

export default function AdminHeadlines() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);

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
      await api.post("/admin/headlines", { message: message.trim(), type: "text" });
      toast.success("New headline message added");
      setMessage("");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to add headline");
    } finally {
      setBusy(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/uploads", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      await api.post("/admin/headlines", {
        message: data.path,
        type: "image"
      });
      toast.success("Image headline added successfully");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to upload image headline");
    } finally {
      setBusy(false);
      // Reset input value to allow uploading same file again
      e.target.value = "";
    }
  };

  const toggleHeadline = async (id) => {
    try {
      const res = await api.put(`/admin/headlines/${id}/toggle`);
      toast.success(`Announcement state updated`);
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
      toast.success("Announcement deleted");
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to delete headline");
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e, index, listType) => {
    setDraggedIndex({ index, listType });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index, listType) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex.listType !== listType || draggedIndex.index === index) return;
    
    const subList = listType === "text" 
      ? items.filter(h => h.type === "text" || !h.type) 
      : items.filter(h => h.type === "image");
      
    const draggedItem = subList[draggedIndex.index];
    subList.splice(draggedIndex.index, 1);
    subList.splice(index, 0, draggedItem);
    
    const otherList = listType === "text"
      ? items.filter(h => h.type === "image")
      : items.filter(h => h.type === "text" || !h.type);
      
    const newList = listType === "text" ? [...subList, ...otherList] : [...otherList, ...subList];
    
    setDraggedIndex({ index, listType });
    setItems(newList);
  };

  const handleDragEnd = async (listType) => {
    setDraggedIndex(null);
    const subList = listType === "text"
      ? items.filter(h => h.type === "text" || !h.type)
      : items.filter(h => h.type === "image");
      
    const orderedIds = subList.map((h) => h.id);
    try {
      await api.put("/admin/headlines/reorder", { ids: orderedIds });
      toast.success("Priority order updated");
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

  const textHeadlines = useMemo(() => {
    return items.filter(h => h.type === "text" || !h.type);
  }, [items]);

  const imageHeadlines = useMemo(() => {
    return items.filter(h => h.type === "image");
  }, [items]);

  return (
    <div className="w-full min-h-screen pb-12 animate-fadeIn">
      <PageHeader
        title="Headline Management"
        subtitle="Manage scrolling marquee messages and image banner announcements for the user dashboard."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: TEXT HEADLINES (COL SPAN 2) */}
        <div className="lg:col-span-2 space-y-6">
          {/* NEW TEXT HEADLINE MESSAGE CARD */}
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

          {/* TEXT HEADLINES CARD */}
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
              💡 Drag and drop text rows by their handles to set priority/number-wise order.
            </p>

            {loading ? (
              <div className="space-y-3 py-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-neutral-50 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : textHeadlines.length === 0 ? (
              <div className="text-center py-12 text-xs text-neutral-400 font-medium">
                No text headlines created yet
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {textHeadlines.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx, "text")}
                    onDragOver={(e) => handleDragOver(e, idx, "text")}
                    onDragEnd={() => handleDragEnd("text")}
                    className={`flex items-center justify-between py-4 first:pt-0 last:pb-0 gap-6 transition-all duration-150 rounded-xl px-2 -mx-2 ${
                      draggedIndex && draggedIndex.listType === "text" && draggedIndex.index === idx 
                        ? "opacity-30 bg-neutral-100 scale-[0.99]" 
                        : "hover:bg-neutral-50/50"
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

        {/* RIGHT COLUMN: IMAGE HEADLINES (COL SPAN 1) */}
        <div className="space-y-6">
          {/* UPLOAD IMAGE HEADLINE CARD */}
          <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm">
            <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block mb-3.5">
              Upload Image Headline
            </span>
            <label className="block cursor-pointer">
              <div className="border-2 border-dashed border-black/15 hover:border-[#4F46E5] bg-neutral-50 rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center space-y-2.5">
                <Upload className="h-6 w-6 text-neutral-400" />
                <span className="text-xs font-bold text-neutral-600">
                  {busy ? "Uploading image..." : "Upload Banner Image"}
                </span>
                <span className="text-[10px] text-neutral-400 font-semibold">
                  Supports PNG, JPG (Horizontal format recommended)
                </span>
              </div>
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* ACTIVE IMAGE HEADLINES LIST CARD */}
          <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-black/5 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4.5 w-4.5 text-[#1B4332]" />
                <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                  Image Headlines
                </span>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 py-6">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-20 bg-neutral-50 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : imageHeadlines.length === 0 ? (
              <div className="text-center py-12 text-xs text-neutral-400 font-medium">
                No image headlines uploaded yet
              </div>
            ) : (
              <div className="space-y-4">
                {imageHeadlines.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx, "image")}
                    onDragOver={(e) => handleDragOver(e, idx, "image")}
                    onDragEnd={() => handleDragEnd("image")}
                    className={`border border-black/5 rounded-2xl p-3 flex items-center justify-between gap-4 transition-all duration-150 ${
                      draggedIndex && draggedIndex.listType === "image" && draggedIndex.index === idx 
                        ? "opacity-30 bg-neutral-100 scale-[0.99]" 
                        : "hover:shadow-sm bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <GripVertical className="h-4.5 w-4.5 text-neutral-300 cursor-grab active:cursor-grabbing shrink-0" />
                      <div className="relative h-12 w-20 bg-neutral-50 border border-black/5 rounded-lg overflow-hidden shrink-0 group">
                        <img
                          src={fileUrl(item.message)}
                          alt="Banner"
                          className="h-full w-full object-cover"
                        />
                        <button
                          onClick={() => setPreviewImageUrl(fileUrl(item.message))}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all rounded-lg"
                        >
                          <Eye className="h-4 w-4 text-white" />
                        </button>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-neutral-400 font-bold block">
                          Image Announcement
                        </span>
                        <span className="text-[9px] text-neutral-400 font-semibold block truncate max-w-[100px]">
                          {formatDateTime(item.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleHeadline(item.id)}
                        className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all select-none border ${
                          item.active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100"
                            : "bg-neutral-50 text-neutral-400 border-neutral-200/40 hover:bg-neutral-100"
                        }`}
                      >
                        {item.active ? "Active" : "Inactive"}
                      </button>
                      <button
                        onClick={() => deleteHeadline(item.id)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all border border-rose-100/50"
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

      </div>

      {/* FULLSIZE IMAGE PREVIEW MODAL */}
      {previewImageUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0" onClick={() => setPreviewImageUrl(null)} />
          <div className="relative bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl z-10 border border-black/5 animate-scaleUp">
            <div className="p-4 border-b border-black/5 flex items-center justify-between">
              <h4 className="text-xs font-black text-neutral-800 uppercase tracking-widest">
                Image Banner Preview
              </h4>
              <button
                onClick={() => setPreviewImageUrl(null)}
                className="p-1.5 hover:bg-neutral-100 rounded-xl text-neutral-500 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 bg-neutral-50 flex items-center justify-center overflow-y-auto">
              <img
                src={previewImageUrl}
                alt="Fullsize Banner Preview"
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
