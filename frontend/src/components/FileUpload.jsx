import React, { useState } from "react";
import { api, formatErr } from "@/lib/api";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export default function FileUpload({ onUploaded, accept = "image/*,application/pdf", label = "Upload file", testid = "file-upload" }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const handle = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(f.name);
      onUploaded?.(data.path);
      toast.success("File uploaded");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="block cursor-pointer">
      <div className="border-2 border-dashed border-black/15 rounded-xl p-5 bg-white hover:border-[#1B4332]/40 transition-colors text-center">
        <Upload className="h-5 w-5 mx-auto text-neutral-500" />
        <div className="text-sm mt-2 font-medium">{busy ? "Uploading…" : label}</div>
        <div className="text-xs text-neutral-500 mt-1">{preview || "Click to choose a file"}</div>
      </div>
      <input type="file" accept={accept} className="hidden" onChange={handle} data-testid={testid} />
    </label>
  );
}
