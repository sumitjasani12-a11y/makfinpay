import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, formatErr, fmtDate } from "@/lib/api";
import { PageHeader, DataTable } from "@/components/Shared";
import { toast } from "sonner";
import { Camera, Download, RotateCcw, Trash2, Upload, AlertTriangle, X, Loader2 } from "lucide-react";

function fmtBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function TypeBadge({ kind }) {
  const map = {
    automatic: ["Automatic", "bg-blue-50 text-blue-700"],
    manual: ["Manual", "bg-emerald-50 text-emerald-700"],
    "pre-restore-safety": ["Safety", "bg-amber-50 text-amber-700"],
    upload: ["Upload", "bg-neutral-100 text-neutral-700"],
  };
  const [label, cls] = map[kind] || [kind, "bg-neutral-100 text-neutral-700"];
  return <span className={`mfp-pill ${cls}`}>{label}</span>;
}

function StatusBadge({ status, restoreStatus, error }) {
  // Restore status takes priority for the visual state of a row currently being restored
  if (restoreStatus === "in_progress") {
    return <span className="mfp-pill bg-amber-100 text-amber-800 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Restoring…</span>;
  }
  if (restoreStatus === "failed") {
    return <span className="mfp-pill bg-rose-100 text-rose-700" title={error || ""}>Restore failed</span>;
  }
  const map = {
    in_progress: ["In progress", "bg-amber-100 text-amber-800", true],
    completed: ["Completed", "bg-emerald-50 text-emerald-700", false],
    failed: ["Failed", "bg-rose-100 text-rose-700", false],
  };
  const entry = map[status] || ["Completed", "bg-emerald-50 text-emerald-700", false];
  const [label, cls, spin] = entry;
  return (
    <span className={`mfp-pill ${cls} inline-flex items-center gap-1`} title={error || ""}>
      {spin && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </span>
  );
}

function RestoreModal({ targetLabel, onClose, onConfirm }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = text === "RESTORE";
  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-[#FDFCF8] rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="restore-modal">
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <div className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-600" /> Restore Database?</div>
          {!busy && <button onClick={onClose} className="mfp-btn-ghost p-2"><X className="h-4 w-4" /></button>}
        </div>
        {busy ? (
          <div className="p-8 text-center space-y-3">
            <Loader2 className="h-7 w-7 animate-spin text-[#1B4332] mx-auto" />
            <div className="text-sm text-neutral-700">Starting restore…</div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-sm text-neutral-700">This will <span className="font-semibold">REPLACE all current data</span> with {targetLabel}.</p>
            <p className="text-sm text-neutral-700">A safety snapshot of the current state will be created first — so you can undo this if needed.</p>
            <div>
              <label className="mfp-label text-rose-700">Type RESTORE to confirm</label>
              <input className="mfp-input font-mono tracking-widest" value={text} onChange={(e) => setText(e.target.value)} autoFocus data-testid="restore-confirm-input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="mfp-btn-outline flex-1">Cancel</button>
              <button
                disabled={!ok}
                onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white ${ok ? "bg-rose-600 hover:bg-rose-700" : "bg-rose-300 cursor-not-allowed"}`}
                data-testid="restore-confirm-btn"
              >Confirm Restore</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminBackups() {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [file, setFile] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const pollRef = useRef(null);
  // Track which restore_status fields we've already announced so polling doesn't
  // re-fire the same toast on every refresh.
  const announcedRef = useRef(new Set());

  const reload = useCallback(() => Promise.all([
    api.get("/admin/backups").then((r) => setItems(r.data)),
    api.get("/admin/backups/settings").then((r) => setSettings(r.data)),
  ]), []);
  useEffect(() => { reload(); }, [reload]);

  // Poll every 4s while anything is in_progress (backup or restore).
  useEffect(() => {
    const hasInProgress = items.some(
      (b) => b.status === "in_progress" || b.restore_status === "in_progress",
    );
    if (hasInProgress) {
      if (!pollRef.current) {
        pollRef.current = setInterval(reload, 4000);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {};
  }, [items, reload]);

  // Fire-once toasts when a backup/restore transitions out of in_progress.
  useEffect(() => {
    items.forEach((b) => {
      const bk = `backup:${b.id}:${b.status}`;
      if ((b.status === "completed" || b.status === "failed") && !announcedRef.current.has(bk)) {
        announcedRef.current.add(bk);
        if (b.status === "completed") {
          toast.success(`Backup completed — ${b.label} (${fmtBytes(b.size_bytes)})`);
        } else {
          toast.error(`Backup failed — ${b.error || "Unknown error"}`);
        }
      }
      const rk = `restore:${b.id}:${b.restore_status}`;
      if ((b.restore_status === "completed" || b.restore_status === "failed") && !announcedRef.current.has(rk)) {
        announcedRef.current.add(rk);
        if (b.restore_status === "completed") {
          const f = b.restore_result?.files_restored ?? 0;
          toast.success(`Restore complete — all data and files verified (${f} file(s)).`);
        } else {
          toast.error(`Restore failed — ${b.restore_error || "Verification failed"}`);
        }
      }
    });
  }, [items]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const saveSettings = async (next) => {
    try {
      await api.put("/admin/backups/settings", next);
      setSettings((s) => ({ ...s, ...next }));
      toast.success("Backup settings updated");
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const createSnapshot = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await api.post("/admin/backups", { label: label.trim() });
      setLabel("");
      toast.success("Backup started. This may take a while for large datasets — you can keep using the app.");
      await reload();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setTimeout(() => setCreating(false), 1500); }
  };

  const download = async (b) => {
    if (b.status !== "completed") {
      return toast.error("Backup is not ready yet — please wait until status is Completed.");
    }
    try {
      const r = await api.get(`/admin/backups/${b.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/gzip" }));
      const a = document.createElement("a"); a.href = url; a.download = b.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const runRestoreFromHistory = async () => {
    try {
      await api.post(`/admin/backups/${restoreTarget.backup.id}/restore`, { confirm: "RESTORE" });
      toast.success("Restore started. A safety backup is being created first — you can keep using the app.");
      setRestoreTarget(null);
      await reload();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); throw e; }
  };

  const runRestoreFromUpload = async () => {
    const fd = new FormData();
    fd.append("file", restoreTarget.file);
    fd.append("confirm", "RESTORE");
    try {
      await api.post(`/admin/backups/restore-upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Restore started from uploaded file. Safety backup in progress.");
      setRestoreTarget(null);
      setFile(null);
      await reload();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); throw e; }
  };

  const del = async (b) => {
    if (b.status === "in_progress" || b.restore_status === "in_progress") {
      return toast.error("Cannot delete a backup while it is in progress.");
    }
    if (!window.confirm("Delete this backup permanently? (Cannot be undone)")) return;
    try { await api.delete(`/admin/backups/${b.id}`); toast.success("Backup deleted"); await reload(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader title="Backup & Restore" subtitle="Protect your platform data with automatic and manual backups." />

      {/* SETTINGS */}
      <section className="mfp-card p-6 mb-6" data-testid="backup-settings-card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-base font-medium">Automatic Daily Backup</h3>
            <p className="text-sm text-neutral-600 mt-1">A full backup is created automatically every day at 12:00 AM IST.</p>
          </div>
          <label className="inline-flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox" className="h-4 w-4 accent-[#1B4332]"
              checked={!!settings?.enabled}
              onChange={(e) => saveSettings({ enabled: e.target.checked, retention_days: settings?.retention_days ?? 30 })}
              data-testid="backup-toggle"
            />
            <span className="text-sm">{settings?.enabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
        {settings && (
          <div className="grid sm:grid-cols-3 gap-4 mt-5 text-sm">
            <div><div className="mfp-overline">Last automatic</div><div>{settings.last_automatic_at ? fmtDate(settings.last_automatic_at) : "—"}</div></div>
            <div><div className="mfp-overline">Next scheduled</div><div>{fmtDate(settings.next_scheduled_at)}</div></div>
            <div>
              <div className="mfp-overline">Keep automatic backups for</div>
              <select
                className="mfp-input mt-1"
                value={settings.retention_days}
                onChange={(e) => saveSettings({ enabled: settings.enabled, retention_days: parseInt(e.target.value) })}
                data-testid="retention-select"
              >
                <option value={7}>7 days</option><option value={14}>14 days</option>
                <option value={30}>30 days</option><option value={60}>60 days</option>
                <option value={0}>Forever</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* MANUAL SNAPSHOT */}
      <section className="mfp-card p-6 mb-6">
        <h3 className="text-base font-medium">Create Manual Backup</h3>
        <p className="text-sm text-neutral-600 mt-1">Take an instant snapshot of the entire database right now. Runs in the background — you can keep using the app.</p>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 mt-4">
          <input className="mfp-input" placeholder="Label this backup (e.g. Before commission update)" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="manual-label" />
          <button
            onClick={createSnapshot}
            disabled={creating}
            className="mfp-btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            data-testid="create-snapshot"
          >
            {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating backup…</> : <><Camera className="h-4 w-4" /> Create Snapshot Now</>}
          </button>
        </div>
      </section>

      {/* HISTORY */}
      <section className="mb-6">
        <h3 className="text-base font-medium mb-3">Backup History</h3>
        <DataTable
          columns={[
            { key: "created_at", label: "Date & Time", render: (r) => fmtDate(r.created_at) },
            { key: "kind", label: "Type", render: (r) => <TypeBadge kind={r.kind} /> },
            { key: "label", label: "Label" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} restoreStatus={r.restore_status} error={r.error || r.restore_error} /> },
            { key: "size_bytes", label: "Size", render: (r) => r.status === "in_progress" ? "—" : fmtBytes(r.size_bytes) },
            { key: "created_by_name", label: "Created By" },
            { key: "actions", label: "Action", render: (r) => {
              const ready = r.status === "completed";
              const busyRestore = r.restore_status === "in_progress";
              return (
                <div className="flex gap-1.5">
                  <button
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${ready && !busyRestore ? "bg-[#1B4332]/10 text-[#1B4332] hover:bg-[#1B4332]/20" : "bg-neutral-100 text-neutral-400 cursor-not-allowed"}`}
                    onClick={() => download(r)}
                    disabled={!ready || busyRestore}
                    data-testid={`download-${r.id}`}
                  ><Download className="h-3 w-3" /> Download</button>
                  <button
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${ready && !busyRestore ? "bg-amber-50 text-amber-800 hover:bg-amber-100" : "bg-neutral-100 text-neutral-400 cursor-not-allowed"}`}
                    onClick={() => setRestoreTarget({ kind: "history", backup: r })}
                    disabled={!ready || busyRestore}
                    data-testid={`restore-${r.id}`}
                  ><RotateCcw className="h-3 w-3" /> Restore</button>
                  <button
                    className={`rounded-lg p-1.5 ${ready && !busyRestore ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-neutral-100 text-neutral-400 cursor-not-allowed"}`}
                    onClick={() => del(r)}
                    disabled={!ready || busyRestore}
                    data-testid={`delete-${r.id}`}
                    title="Delete"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              );
            } },
          ]}
          rows={items}
          empty="No backups yet — create your first snapshot above."
        />
      </section>

      {/* UPLOAD & RESTORE */}
      <section className="mfp-card p-6">
        <h3 className="text-base font-medium">Restore from Backup File</h3>
        <p className="text-sm text-neutral-600 mt-1">Upload a previously downloaded backup file to restore your database to that point.</p>
        <label className="mt-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-black/15 rounded-xl py-8 cursor-pointer hover:border-[#1B4332]/40 transition-colors" data-testid="upload-zone">
          <Upload className="h-6 w-6 text-[#1B4332]" />
          <div className="text-sm font-medium">Upload Backup File</div>
          <div className="text-xs text-neutral-500">{file ? file.name : "Click to choose a file or drag & drop (.zip / .json / .gz)"}</div>
          <input type="file" className="hidden" accept=".zip,.json,.gz" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="upload-input" />
        </label>
        <button
          disabled={!file}
          onClick={() => setRestoreTarget({ kind: "upload", file })}
          className="mt-4 mfp-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="restore-upload-btn"
        >Restore from File</button>
      </section>

      {restoreTarget && (
        <RestoreModal
          targetLabel={restoreTarget.kind === "history"
            ? `the backup from ${fmtDate(restoreTarget.backup.created_at)}`
            : `the uploaded file "${restoreTarget.file.name}"`}
          onClose={() => setRestoreTarget(null)}
          onConfirm={restoreTarget.kind === "history" ? runRestoreFromHistory : runRestoreFromUpload}
        />
      )}
    </div>
  );
}
