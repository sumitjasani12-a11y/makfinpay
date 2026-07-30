import React, { useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, CheckCircle2, ShieldCheck } from "lucide-react";

function PasswordField({ label, value, onChange, placeholder, testid, error }) {
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`mfp-input !pl-11 !pr-11 ${error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""}`}
          data-testid={testid}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-neutral-400 hover:text-[#1B4332]"
          data-testid={`${testid}-toggle`}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <div className="mt-1.5 text-xs text-rose-600" data-testid={`${testid}-error`}>{error}</div>}
    </div>
  );
}

function validateChangePassword({ current, next, confirm }) {
  const e = {};
  if (!current) e.current = "Enter your current password";
  if (!next) e.next = "Enter a new password";
  else if (next.length < 8) e.next = "New password must be at least 8 characters long";
  else if (next === current) e.next = "New password must be different from current password";
  if (!confirm) e.confirm = "Confirm your new password";
  else if (next && confirm !== next) e.confirm = "Passwords do not match";
  return e;
}

function mapServerErrorToField(msg) {
  const lower = msg.toLowerCase();
  if (lower.includes("current password")) return { current: msg };
  if (lower.includes("at least 8") || lower.includes("different from current")) return { next: msg };
  if (lower.includes("do not match")) return { confirm: msg };
  return { form: msg };
}

export default function ChangePassword() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault();
    setSuccess(false);
    const validationErrors = validateChangePassword({ current, next, confirm });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: current,
        new_password: next,
        confirm_password: confirm,
      });
      setSuccess(true);
      setErrors({});
      setCurrent(""); setNext(""); setConfirm("");
      toast.success("Password updated successfully");
    } catch (err) {
      const msg = formatErr(err.response?.data?.detail) || err.message;
      setErrors(mapServerErrorToField(msg));
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Change Password" subtitle="Update the password for your account. You'll stay signed in after the change." />
      <div className="grid lg:grid-cols-3 gap-6 max-w-5xl">
        <form onSubmit={submit} className="mfp-card p-6 lg:p-8 lg:col-span-2 space-y-5" data-testid="change-password-form">
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm flex items-center gap-2" data-testid="change-password-success">
              <CheckCircle2 className="h-4 w-4" /> Password updated successfully
            </div>
          )}
          {errors.form && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm" data-testid="change-password-form-error">{errors.form}</div>
          )}

          <PasswordField
            label="Current Password"
            value={current} onChange={setCurrent}
            placeholder="Enter current password"
            testid="cp-current"
            error={errors.current}
          />
          <PasswordField
            label="New Password"
            value={next} onChange={setNext}
            placeholder="Enter new password"
            testid="cp-new"
            error={errors.next}
          />
          <PasswordField
            label="Confirm New Password"
            value={confirm} onChange={setConfirm}
            placeholder="Confirm new password"
            testid="cp-confirm"
            error={errors.confirm}
          />

          <button type="submit" disabled={busy} className="mfp-btn-primary w-full sm:w-auto" data-testid="cp-submit">
            <ShieldCheck className="h-4 w-4" /> {busy ? "Updating…" : "Update Password"}
          </button>
        </form>

        <aside className={`mfp-card p-6 lg:p-8 text-white border-0 ${user?.role === "admin" ? "!bg-slate-850 bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg border border-slate-700/50" : "!bg-[#1B4332]"}`}>
          <div className="text-xs uppercase tracking-[0.2em] text-white/80">Account</div>
          <div className="mt-3 text-lg font-medium text-white">{user?.full_name}</div>
          <div className="text-sm text-white/90 break-all">{user?.email}</div>
          <div className="mt-2 mfp-pill bg-white/15 text-white capitalize">{user?.role}</div>

          <div className="mt-8 space-y-3 text-sm text-white">
            <div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Minimum 8 characters</div>
            <div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Must differ from current</div>
            <div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> 5 attempts per hour limit</div>
            <div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Every attempt is audited</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
