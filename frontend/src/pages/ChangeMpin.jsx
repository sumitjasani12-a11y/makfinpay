import React, { useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, CheckCircle2, ShieldCheck } from "lucide-react";

function MpinField({ label, value, onChange, placeholder, error }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mfp-label">{label}</label>
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
          <Lock className="h-4 w-4 text-neutral-400" />
        </span>
        <input
          type={show ? "text" : "password"}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={value}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "" || (/^\d+$/.test(val) && val.length <= 6)) {
              onChange(val);
            }
          }}
          placeholder={placeholder}
          className={`mfp-input !pl-11 !pr-11 ${error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""}`}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-neutral-400 hover:text-[#1B4332]"
          aria-label={show ? "Hide PIN" : "Show PIN"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <div className="mt-1.5 text-xs text-rose-600">{error}</div>}
    </div>
  );
}

function validateChangeMpin({ current, next, confirm, isFirstMpin }) {
  const e = {};
  if (!isFirstMpin && !current) e.current = "Enter your current MPIN";
  else if (!isFirstMpin && current.length !== 6) e.current = "Current MPIN must be exactly 6 digits";
  
  if (!next) e.next = "Enter a new MPIN";
  else if (next.length !== 6) e.next = "New MPIN must be exactly 6 digits";
  else if (!isFirstMpin && next === current) e.next = "New MPIN must be different from current MPIN";
  
  if (!confirm) e.confirm = "Confirm your new MPIN";
  else if (next && confirm !== next) e.confirm = "MPINs do not match";
  return e;
}

export default function ChangeMpin() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  // If the user does not have an MPIN set up yet (fallback case)
  const isFirstMpin = !user?.mpin_hash;

  const submit = async (ev) => {
    ev.preventDefault();
    setSuccess(false);
    
    const validationErrors = validateChangeMpin({ current, next, confirm, isFirstMpin });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setBusy(true);
    try {
      await api.post("/auth/change-mpin", {
        current_mpin: current,
        new_mpin: next,
      });
      setSuccess(true);
      setErrors({});
      setCurrent(""); 
      setNext(""); 
      setConfirm("");
      toast.success("MPIN updated successfully");
    } catch (err) {
      const msg = formatErr(err.response?.data?.detail) || err.message;
      setErrors({ form: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Change MPIN" 
        subtitle="Manage your 6-digit login MPIN code. This security PIN protects your account from unauthorized logins." 
      />
      <div className="grid lg:grid-cols-3 gap-6 max-w-5xl">
        <form onSubmit={submit} className="mfp-card p-6 lg:p-8 lg:col-span-2 space-y-5">
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> MPIN updated successfully
            </div>
          )}
          {errors.form && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">{errors.form}</div>
          )}

          {!isFirstMpin && (
            <MpinField
              label="Current 6-Digit MPIN"
              value={current} onChange={setCurrent}
              placeholder="Enter current 6-digit MPIN"
              error={errors.current}
            />
          )}
          <MpinField
            label="New 6-Digit MPIN"
            value={next} onChange={setNext}
            placeholder="Enter new 6-digit MPIN"
            error={errors.next}
          />
          <MpinField
            label="Confirm New 6-Digit MPIN"
            value={confirm} onChange={setConfirm}
            placeholder="Confirm new 6-digit MPIN"
            error={errors.confirm}
          />

          <button type="submit" disabled={busy} className="mfp-btn-primary w-full sm:w-auto">
            <ShieldCheck className="h-4 w-4" /> {busy ? "Updating…" : "Update MPIN"}
          </button>
        </form>

        <aside className="mfp-card p-6 lg:p-8 !bg-[#1B4332] text-white border-0">
          <div className="text-xs uppercase tracking-[0.2em] text-white/80">Account Security</div>
          <div className="mt-3 text-lg font-medium text-white">{user?.full_name}</div>
          <div className="text-sm text-white/90 break-all">{user?.email}</div>
          <div className="mt-2 mfp-pill bg-white/15 text-white capitalize">{user?.role}</div>

          <div className="mt-8 space-y-3 text-sm text-white">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Must be exactly 6 digits
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Numeric digits only (0-9)
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Must differ from current PIN
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> All PIN changes are audited
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
