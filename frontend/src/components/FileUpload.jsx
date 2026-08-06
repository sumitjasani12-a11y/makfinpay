import React, { useState } from "react";
import { api, formatErr } from "@/lib/api";
import { toast } from "sonner";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";

// Browser-side image compressor for instant uploads
async function compressImage(file) {
  if (!file.type.startsWith("image/") || file.size < 500 * 1024) {
    return file;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 1280;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.75
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

export default function FileUpload({
  onUploaded,
  onFileSelected,
  accept = "image/*,application/pdf",
  label = "Upload file",
  testid = "file-upload"
}) {
  const [busy, setBusy] = useState(false);
  const [previewName, setPreviewName] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadedPath, setUploadedPath] = useState(null);

  const handle = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    // 1. INSTANT visual feedback (0ms delay)
    setPreviewName(f.name);
    if (f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    }
    onFileSelected?.(f);
    setBusy(true);

    try {
      // 2. Compress image in browser canvas (fast!)
      const fileToUpload = await compressImage(f);

      // 3. Upload to server
      const fd = new FormData();
      fd.append("file", fileToUpload);
      const { data } = await api.post("/uploads", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setUploadedPath(data.path);
      onUploaded?.(data.path);
      toast.success(`${f.name} selected ✓`);
    } catch (err) {
      const serverMsg = err.response?.data?.detail;
      const formatted = formatErr(serverMsg);
      const errorMsg =
        formatted && formatted !== "Something went wrong. Please try again."
          ? formatted
          : err.response
          ? `Server Error (${err.response.status}): ${err.response.statusText || "Request failed"}`
          : err.message;
      toast.error(errorMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="block cursor-pointer group">
      <div className={`border-2 border-dashed rounded-2xl p-4 transition-all text-center relative overflow-hidden ${
        uploadedPath || previewName
          ? "border-emerald-500 bg-emerald-50/60 shadow-sm"
          : "border-neutral-200 bg-white hover:border-[#1B4332]/40"
      }`}>
        {previewUrl ? (
          <div className="flex items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <img
                src={previewUrl}
                alt="preview"
                className="h-11 w-11 object-cover rounded-xl border border-emerald-300 shadow-sm shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-xs font-black text-emerald-900 truncate">
                  <span className="truncate">{previewName}</span>
                </div>
                <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                  {busy ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                      <span>Saving image...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Ready ✓</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : previewName ? (
          <div className="flex items-center justify-between text-left p-1">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-bold text-emerald-900 truncate">{previewName}</span>
            </div>
            <span className="text-[10px] text-emerald-600 font-bold">
              {busy ? "Uploading..." : "✓"}
            </span>
          </div>
        ) : (
          <>
            <Upload className="h-5 w-5 mx-auto text-neutral-400 group-hover:scale-110 transition-transform" />
            <div className="text-xs mt-1.5 font-extrabold text-neutral-800">{label}</div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Click to choose photo</div>
          </>
        )}
      </div>
      <input type="file" accept={accept} className="hidden" onChange={handle} data-testid={testid} />
    </label>
  );
}
