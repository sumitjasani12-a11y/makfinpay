import React, { useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, CheckCircle2, ShieldCheck, KeyRound } from "lucide-react";

function InputField({ label, value, onChange, placeholder, error, isNumeric = true, maxLength = 4 }) {
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
          inputMode={isNumeric ? "numeric" : "text"}
          pattern={isNumeric ? "[0-9]*" : undefined}
          maxLength={maxLength || undefined}
          value={value}
          onChange={(e) => {
            const val = e.target.value;
            if (!isNumeric || val === "" || (/^\d+$/.test(val) && val.length <= 4)) {
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
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <div className="mt-1.5 text-xs text-rose-600">{error}</div>}
    </div>
  );
}

function validateTpinForm({ current, password, next, confirm, isFirstTpin, isResetMode }) {
  const e = {};
  if (isResetMode) {
    if (!password) e.password = "Enter your account password";
  } else if (!isFirstTpin) {
    if (!current) e.current = "Enter your current TPIN";
    else if (current.length !== 4) e.current = "Current TPIN must be exactly 4 digits";
  }
  
  if (!next) e.next = "Enter a new TPIN";
  else if (next.length !== 4) e.next = "New TPIN must be exactly 4 digits";
  else if (!isFirstTpin && !isResetMode && next === current) e.next = "New TPIN must be different from current TPIN";
  
  if (!confirm) e.confirm = "Confirm your new TPIN";
  else if (next && confirm !== next) e.confirm = "TPINs do not match";
  return e;
}

export default function ChangeTpin() {
  const { user, setUser } = useAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const isFirstTpin = !user?.tpin_hash;

  const submit = async (ev) => {
    ev.preventDefault();
    setSuccess(false);
    
    const validationErrors = validateTpinForm({ current, password, next, confirm, isFirstTpin, isResetMode });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setBusy(true);
    try {
      if (isFirstTpin) {
        await api.post("/auth/setup-tpin", {
          tpin: next,
        });
        toast.success("TPIN set up successfully");
      } else if (isResetMode) {
        await api.post("/auth/reset-tpin", {
          password: password,
          new_tpin: next,
        });
        toast.success("TPIN reset successfully using Account Password");
      } else {
        await api.post("/auth/change-tpin", {
          current_tpin: current,
          new_tpin: next,
        });
        toast.success("TPIN updated successfully");
      }
      
      setSuccess(true);
      setErrors({});
      setCurrent("");
      setPassword("");
      setNext(""); 
      setConfirm("");
      
      // Update local context user so that frontend knows TPIN is configured
      setUser({
        ...user,
        tpin_hash: "configured"
      });
    } catch (err) {
      const msg = formatErr(err.response?.data?.detail) || err.message;
      setErrors({ form: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const getTitle = () => {
    if (isFirstTpin) return "Create TPIN";
    if (isResetMode) return "Reset TPIN (Forgot TPIN)";
    return "Change TPIN";
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title={getTitle()} 
        subtitle="Manage your 4-digit transaction TPIN code. This PIN is required when performing payments and wallet transfers." 
      />
      <div className="grid lg:grid-cols-3 gap-6 max-w-5xl">
        <form onSubmit={submit} className="mfp-card p-6 lg:p-8 lg:col-span-2 space-y-5">
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {isFirstTpin ? "TPIN created successfully" : isResetMode ? "TPIN reset successfully" : "TPIN updated successfully"}
            </div>
          )}
          {errors.form && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">{errors.form}</div>
          )}

          {!isFirstTpin && !isResetMode && (
            <div>
              <InputField
                label="Current 4-Digit TPIN"
                value={current} onChange={setCurrent}
                placeholder="Enter current 4-digit TPIN"
                error={errors.current}
                isNumeric={true}
                maxLength={4}
              />
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setIsResetMode(true); setErrors({}); setSuccess(false); }}
                  className="text-xs text-[#00966B] font-bold hover:underline flex items-center gap-1"
                >
                  <KeyRound className="h-3 w-3" /> Forgot TPIN? Reset using Account Password
                </button>
              </div>
            </div>
          )}

          {!isFirstTpin && isResetMode && (
            <div>
              <InputField
                label="Account Password"
                value={password} onChange={setPassword}
                placeholder="Enter your account login password"
                error={errors.password}
                isNumeric={false}
                maxLength={100}
              />
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setIsResetMode(false); setErrors({}); setSuccess(false); }}
                  className="text-xs text-[#00966B] font-bold hover:underline flex items-center gap-1"
                >
                  <Lock className="h-3 w-3" /> Remember current TPIN? Change using Current TPIN
                </button>
              </div>
            </div>
          )}

          <InputField
            label="New 4-Digit TPIN"
            value={next} onChange={setNext}
            placeholder="Enter new 4-digit TPIN"
            error={errors.next}
            isNumeric={true}
            maxLength={4}
          />
          <InputField
            label="Confirm New 4-Digit TPIN"
            value={confirm} onChange={setConfirm}
            placeholder="Confirm new 4-digit TPIN"
            error={errors.confirm}
            isNumeric={true}
            maxLength={4}
          />

          <button type="submit" disabled={busy} className="mfp-btn-primary w-full sm:w-auto">
            <ShieldCheck className="h-4 w-4" /> {busy ? "Saving…" : isFirstTpin ? "Create TPIN" : isResetMode ? "Reset TPIN" : "Update TPIN"}
          </button>
        </form>

        <aside className="mfp-card p-6 lg:p-8 !bg-[#1B4332] text-white border-0">
          <div className="text-xs uppercase tracking-[0.2em] text-white/80">Transaction Security</div>
          <div className="mt-3 text-lg font-medium text-white">{user?.full_name}</div>
          <div className="text-sm text-white/90 break-all">{user?.email}</div>
          <div className="mt-2 mfp-pill bg-white/15 text-white capitalize">{user?.role}</div>

          <div className="mt-8 space-y-3 text-sm text-white">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Must be exactly 4 digits
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Numeric digits only (0-9)
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Reset using your login password if forgotten
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#FFE4C7] shrink-0" /> Protects wallet balance
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
