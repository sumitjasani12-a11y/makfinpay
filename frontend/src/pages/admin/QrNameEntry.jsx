import React, { useEffect, useState } from "react";
import { api, formatErr, fileUrl } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { Trash2, Edit3, Search, GripVertical, FileText } from "lucide-react";

const COLORS = {
  Red: { bg: "bg-red-50 border-red-200", text: "text-red-700", pill: "bg-red-100 text-red-800" },
  Pink: { bg: "bg-pink-50 border-pink-200", text: "text-pink-700", pill: "bg-pink-100 text-pink-800" },
  Blue: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", pill: "bg-blue-100 text-blue-800" },
  Green: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", pill: "bg-emerald-100 text-emerald-800" }
};

export default function AdminQrNameEntry() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("Blue");
  const [mobile, setMobile] = useState("");
  const [upi, setUpi] = useState("");
  const [minAmt, setMinAmt] = useState(0);
  const [maxAmt, setMaxAmt] = useState(0);
  const [path, setPath] = useState("");
  
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);

  const reload = () => api.get("/admin/qr-name-entries").then((r) => setItems(r.data || []));
  useEffect(() => { reload(); }, []);

  const save = async () => {
    if (!name || !mobile || !upi || !path) {
      return toast.error("Please fill all required fields (Name, Mobile, UPI ID, QR Image)");
    }
    
    const payload = {
      name,
      color,
      mobile_number: mobile,
      upi_id: upi,
      min_amount: Number(minAmt || 0),
      max_amount: Number(maxAmt || 0),
      image_path: path
    };

    try {
      if (editingId) {
        await api.put(`/admin/qr-name-entries/${editingId}`, payload);
        toast.success("Entry updated successfully");
      } else {
        await api.post("/admin/qr-name-entries", payload);
        toast.success("Entry created successfully");
      }
      clearForm();
      reload();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const clearForm = () => {
    setName("");
    setColor("Blue");
    setMobile("");
    setUpi("");
    setMinAmt(0);
    setMaxAmt(0);
    setPath("");
    setEditingId(null);
  };

  const startEdit = (item) => {
    setName(item.name);
    setColor(item.color || "Blue");
    setMobile(item.mobile_number);
    setUpi(item.upi_id);
    setMinAmt(item.min_amount || 0);
    setMaxAmt(item.max_amount || 0);
    setPath(item.image_path);
    setEditingId(item.id);
  };

  const toggleActive = async (id) => {
    try {
      await api.patch(`/admin/qr-name-entries/${id}/toggle`);
      toast.success("Status updated");
      reload();
    } catch (e) {
      toast.error("Failed to toggle status");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Are you sure you want to delete this entry?")) return;
    try {
      await api.delete(`/admin/qr-name-entries/${id}`);
      toast.success("Entry deleted");
      reload();
    } catch (e) {
      toast.error("Failed to delete entry");
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const reordered = [...items];
    const itemToMove = reordered[draggedIndex];
    reordered.splice(draggedIndex, 1);
    reordered.splice(index, 0, itemToMove);
    
    setDraggedIndex(index);
    setItems(reordered);
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);
    try {
      const ids = items.map(item => item.id);
      await api.put("/admin/qr-name-entries/reorder", { ids });
    } catch (err) {
      toast.error("Failed to save ordering");
    }
  };

  const filteredItems = items.filter(item => 
    item.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.mobile_number?.includes(search)
  );

  return (
    <div>
      <PageHeader title="QR Name Entry" subtitle="Configure and manage custom QR Name mapping." />
      
      <div className="grid lg:grid-cols-10 gap-6">
        {/* Left Form: Add/Edit Entry */}
        <div className="lg:col-span-4">
          <div className="mfp-card p-6 sticky top-6">
            <h3 className="text-lg font-medium mb-5">{editingId ? "Edit Entry" : "+ Add New Entry"}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="mfp-label font-medium">QR Name</label>
                <input 
                  className="mfp-input" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g. PhonePe_Main" 
                />
              </div>

              <div>
                <label className="mfp-label font-medium mb-2">Container Color</label>
                <div className="flex gap-2">
                  {Object.keys(COLORS).map((cName) => (
                    <button
                      key={cName}
                      type="button"
                      onClick={() => setColor(cName)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                        color === cName 
                          ? `${COLORS[cName].bg} ${COLORS[cName].text} ring-2 ring-offset-1 ring-[#1B4332]/20 border-transparent` 
                          : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      {cName}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mfp-label font-medium">Mobile Number</label>
                <input 
                  className="mfp-input" 
                  type="tel"
                  value={mobile} 
                  onChange={(e) => setMobile(e.target.value)} 
                  placeholder="e.g. 9876543210" 
                />
              </div>

              <div>
                <label className="mfp-label font-medium">UPI ID</label>
                <input 
                  className="mfp-input" 
                  value={upi} 
                  onChange={(e) => setUpi(e.target.value)} 
                  placeholder="e.g. name@upi" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mfp-label font-medium">Min Amount</label>
                  <input 
                    className="mfp-input" 
                    type="number"
                    value={minAmt} 
                    onChange={(e) => setMinAmt(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="mfp-label font-medium">Max Amount</label>
                  <input 
                    className="mfp-input" 
                    type="number"
                    value={maxAmt} 
                    onChange={(e) => setMaxAmt(e.target.value)} 
                  />
                </div>
              </div>

              <div className="pt-2">
                <FileUpload onUploaded={setPath} label="QR Image" />
                {path && (
                  <div className="mt-2 p-2 border border-neutral-100 rounded-xl bg-neutral-50 flex items-center justify-between">
                    <span className="text-xs text-emerald-700 font-medium">QR Uploaded Successfully ✓</span>
                    <a href={fileUrl(path)} target="_blank" rel="noreferrer" className="text-xs text-[#1B4332] underline">View</a>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button className="mfp-btn-primary flex-1" onClick={save}>
                  {editingId ? "Update Entry" : "Save Entry"}
                </button>
                {editingId && (
                  <button className="mfp-btn-outline" onClick={clearForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right List: Display & Drag-and-Drop */}
        <div className="lg:col-span-6">
          <div className="mfp-card p-6">
            {/* Search and Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  className="mfp-input pl-10"
                  placeholder="Search by name or mobile..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider tabular-nums">
                Total Entries: {filteredItems.length}
              </div>
            </div>

            {/* List */}
            <div className="space-y-3">
              {filteredItems.length === 0 ? (
                <EmptyState>No entries found. Try creating a new QR Name entry.</EmptyState>
              ) : (
                filteredItems.map((item, index) => {
                  const style = COLORS[item.color] || COLORS.Blue;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-4 p-4 border rounded-2xl transition-all cursor-default ${style.bg} ${
                        draggedIndex === index ? "opacity-40 scale-[0.98]" : "hover:shadow-sm"
                      }`}
                    >
                      {/* Drag handle */}
                      <div className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 transition-colors p-1">
                        <GripVertical className="h-5 w-5" />
                      </div>

                      {/* Image Thumbnail */}
                      <div className="h-14 w-14 rounded-xl border border-black/5 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.image_path ? (
                          <img src={fileUrl(item.image_path)} alt={item.name} className="h-full w-full object-contain" />
                        ) : (
                          <FileText className="h-6 w-6 text-neutral-400" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-800 truncate">{item.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 font-bold rounded-full uppercase tracking-wider ${style.pill}`}>
                            {item.color || "Blue"}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-600 mt-1 flex flex-col sm:flex-row sm:gap-x-4 sm:gap-y-1">
                          <span>Mobile: <strong className="text-neutral-800">{item.mobile_number}</strong></span>
                          <span className="truncate">UPI: <strong className="text-neutral-800">{item.upi_id}</strong></span>
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-1">
                          Limits: {item.min_amount} - {item.max_amount} Rs
                        </div>
                      </div>

                      {/* Actions: Toggle switch, edit, delete */}
                      <div className="flex items-center gap-3">
                        {/* Toggle active switch */}
                        <button
                          type="button"
                          onClick={() => toggleActive(item.id)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            item.active ? "bg-emerald-600" : "bg-neutral-300"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              item.active ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>

                        <button
                          className="text-neutral-500 hover:text-neutral-800 p-1.5 hover:bg-black/5 rounded-xl transition-colors"
                          onClick={() => startEdit(item)}
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        
                        <button
                          className="text-rose-600 hover:text-rose-800 p-1.5 hover:bg-rose-50 rounded-xl transition-colors"
                          onClick={() => del(item.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
