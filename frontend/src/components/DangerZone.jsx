import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatErr } from "@/lib/api";
import { AlertTriangle, Loader2, X, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Danger Zone for the seeded super admin only.
 * - Big red "Reset Demo Data" button
 * - Typed-confirmation modal ("RESET" exactly)
 * - Backend `/admin/system/reset-demo-data` wipes user/transactional data
 *   and preserves admin + commission + QR codes
 */
export default function DangerZone({ adminEmail }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const canConfirm = confirmText === "RESET";

  const close = () => {
    if (busy) return;
    setOpen(false);
    setConfirmText("");
    setDone(false);
  };

  const runReset = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await api.post("/admin/system/reset-demo-data", { confirm: "RESET" });
      setDone(true);
      toast.success("Demo data reset successfully");
      setTimeout(() => { close(); nav("/admin"); window.location.reload(); }, 3000);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="mt-12 border border-rose-200 bg-rose-50/40 rounded-2xl p-6" data-testid="danger-zone">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-rose-100 text-rose-700 grid place-items-center shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="mfp-overline text-rose-700">Danger Zone</div>
            <h3 className="text-lg font-medium tracking-tight mt-1">Reset Demo Data</h3>
            <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
              Permanently wipe all distributors, agents, wallets, transactions, recharges,
              withdrawals, KYC and audit data. The admin account, commission settings and QR codes are preserved.
            </p>
            <p className="text-xs text-rose-700 mt-2">Available to {adminEmail} only · This action cannot be undone.</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 shrink-0"
            data-testid="open-reset-modal"
          >
            <AlertTriangle className="h-4 w-4" /> Reset Demo Data
          </button>
        </div>
      </section>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4"
          onClick={close}
          data-testid="reset-modal-overlay"
        >
          <div
            className="bg-[#FDFCF8] rounded-2xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
            data-testid="reset-modal"
          >
            <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
              <div className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" /> Reset Demo Data
              </div>
              <button onClick={close} className="mfp-btn-ghost p-2" disabled={busy} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {done ? (
              <div className="p-6 text-center space-y-3" data-testid="reset-success">
                <div className="h-12 w-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 grid place-items-center">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h4 className="text-base font-medium">Demo data reset successfully</h4>
                <p className="text-sm text-neutral-600">Platform is now clean and ready. Redirecting…</p>
              </div>
            ) : busy ? (
              <div className="p-8 text-center space-y-3" data-testid="reset-loading">
                <Loader2 className="h-7 w-7 animate-spin text-[#1B4332] mx-auto" />
                <div className="text-sm text-neutral-700">Resetting data... Please wait</div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <p className="text-sm text-neutral-700 leading-relaxed">
                  This will permanently delete <span className="font-semibold">ALL data</span> including
                  distributors, agents, wallets, transactions, recharges, withdrawals, KYC records, and audit logs.
                </p>
                <p className="text-sm font-semibold text-rose-700">This action CANNOT be undone.</p>
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs space-y-1 text-emerald-900">
                  <div className="font-semibold uppercase tracking-wide">The following will be KEPT:</div>
                  <div>✓ Admin account ({adminEmail})</div>
                  <div>✓ Commission settings</div>
                  <div>✓ QR Codes (all)</div>
                </div>
                <div>
                  <label className="mfp-label text-rose-700">Type RESET to confirm</label>
                  <input
                    className="mfp-input font-mono tracking-widest"
                    placeholder="Type RESET to confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoFocus
                    data-testid="reset-confirm-input"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={close} className="mfp-btn-outline flex-1" data-testid="reset-cancel">
                    Cancel
                  </button>
                  <button
                    onClick={runReset}
                    disabled={!canConfirm}
                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${canConfirm ? "bg-rose-600 hover:bg-rose-700" : "bg-rose-300 cursor-not-allowed"}`}
                    data-testid="reset-confirm"
                  >
                    Confirm Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
