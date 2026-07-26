import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtMoney, fmtDate, formatErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { 
  Wallet, ArrowRight, FilePlus2, CreditCard, ArrowUpFromLine, KeyRound,
  ShieldCheck, UploadCloud, Hourglass, PartyPopper, CheckCircle2, AlertCircle
} from "lucide-react";

export default function AgentOverview() {
  const { user, setUser } = useAuth();
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState([]);
  const [showWelcome, setShowWelcome] = useState(false);
  
  // State for password change form
  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);

  // State for KYC files upload
  const [kycForm, setKycForm] = useState({
    aadhaar_path: "",
    aadhaar_back_path: "",
    pan_path: "",
    selfie_path: "",
    cheque_path: "",
    firm_front_path: ""
  });
  const [kycBusy, setKycBusy] = useState(false);

  const reloadUser = async () => {
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Only load stats if the agent is approved and has changed password
    if (user.kyc_status === "approved" && !user.first_login) {
      api.get("/wallet").then((r) => setBalance(Number(r.data?.balance ?? 0))).catch(() => {});
      api.get("/wallet/ledger").then((r) => setLedger((r.data || []).slice(0, 6))).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    // Show welcome modal if approved and welcome not shown
    if (user.kyc_status === "approved" && !user.welcome_shown && !user.first_login) {
      setShowWelcome(true);
    }
  }, [user]);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!pwForm.password) return toast.error("New password is required");
    if (pwForm.password !== pwForm.confirm) return toast.error("Passwords do not match");
    if (pwForm.password.length < 6) return toast.error("Password must be at least 6 characters long");

    setPwBusy(true);
    try {
      await api.post("/agent/change-first-password", { password: pwForm.password });
      toast.success("Password changed successfully");
      await reloadUser();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || err.message);
    } finally {
      setPwBusy(false);
    }
  };

  const handleKycSubmit = async (e) => {
    e.preventDefault();
    const missing = Object.entries(kycForm).filter(([k, v]) => !v);
    if (missing.length > 0) {
      return toast.error("All 7 KYC documents are compulsory to upload");
    }

    setKycBusy(true);
    try {
      await api.post("/agent/submit-kyc", kycForm);
      toast.success("KYC documents submitted successfully");
      await reloadUser();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || err.message);
    } finally {
      setKycBusy(false);
    }
  };

  const dismissWelcome = async () => {
    try {
      await api.post("/agent/dismiss-welcome");
      setShowWelcome(false);
      await reloadUser();
    } catch (err) {
      setShowWelcome(false);
    }
  };

  // 1. Password change gate
  if (user.first_login) {
    return (
      <div className="max-w-md mx-auto my-12" data-testid="first-login-view">
        <div className="text-center mb-6">
          <div className="h-12 w-12 rounded-full bg-emerald-50 text-[#1B4332] grid place-items-center mx-auto mb-3">
            <KeyRound className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold text-neutral-800">Secure Your Account</h2>
          <p className="text-sm text-neutral-500 mt-2">
            This is your first login. You must set a new secure password before proceeding.
          </p>
        </div>

        <form onSubmit={handlePasswordSubmit} className="mfp-card p-6 space-y-4">
          <div>
            <label className="mfp-label">New Password</label>
            <input
              type="password"
              className="mfp-input"
              value={pwForm.password}
              onChange={(e) => setPwForm({ ...pwForm, password: e.target.value })}
              required
              placeholder="Min 6 characters"
              data-testid="first-login-pass"
            />
          </div>
          <div>
            <label className="mfp-label">Confirm New Password</label>
            <input
              type="password"
              className="mfp-input"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              required
              placeholder="Repeat password"
              data-testid="first-login-confirm"
            />
          </div>
          <button type="submit" disabled={pwBusy} className="mfp-btn-primary w-full">
            {pwBusy ? "Updating..." : "Save Password & Proceed"}
          </button>
        </form>
      </div>
    );
  }

  // 2. KYC upload form (if not submitted or rejected)
  if (user.kyc_status === "not_submitted" || user.kyc_status === "rejected") {
    return (
      <div className="max-w-4xl mx-auto my-6" data-testid="kyc-upload-view">
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-full bg-emerald-50 text-[#1B4332] grid place-items-center mx-auto mb-3">
            <UploadCloud className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold text-neutral-800">Submit KYC Documents</h2>
          <p className="text-sm text-neutral-500 mt-2">
            Upload the following 7 required documents to activate your agent portal.
          </p>
        </div>

        {user.kyc_status === "rejected" && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl flex gap-3 text-rose-800" data-testid="kyc-rejection-banner">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">KYC Verification Rejected</div>
              <div className="text-sm mt-1">Reason: {user.kyc_rejection_reason || "Invalid documents submitted. Please re-upload correct copies."}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleKycSubmit} className="mfp-card p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="mfp-label mb-2">Aadhaar Card (Front)</label>
              <FileUpload
                onUploaded={(p) => setKycForm((f) => ({ ...f, aadhaar_path: p }))}
                label="Upload Aadhaar Front"
                testid="kyc-aadhaar-front"
              />
              {kycForm.aadhaar_path && <div className="text-xs text-emerald-700 mt-1 font-semibold">Aadhaar Front Uploaded ✓</div>}
            </div>

            <div>
              <label className="mfp-label mb-2">Aadhaar Card (Back)</label>
              <FileUpload
                onUploaded={(p) => setKycForm((f) => ({ ...f, aadhaar_back_path: p }))}
                label="Upload Aadhaar Back"
                testid="kyc-aadhaar-back"
              />
              {kycForm.aadhaar_back_path && <div className="text-xs text-emerald-700 mt-1 font-semibold">Aadhaar Back Uploaded ✓</div>}
            </div>

            <div>
              <label className="mfp-label mb-2">PAN Card (Front)</label>
              <FileUpload
                onUploaded={(p) => setKycForm((f) => ({ ...f, pan_path: p }))}
                label="Upload PAN Front"
                testid="kyc-pan-front"
              />
              {kycForm.pan_path && <div className="text-xs text-emerald-700 mt-1 font-semibold">PAN Front Uploaded ✓</div>}
            </div>

            <div>
              <label className="mfp-label mb-2">Selfie Photo</label>
              <FileUpload
                onUploaded={(p) => setKycForm((f) => ({ ...f, selfie_path: p }))}
                label="Upload Selfie"
                testid="kyc-selfie"
              />
              {kycForm.selfie_path && <div className="text-xs text-emerald-700 mt-1 font-semibold">Selfie Uploaded ✓</div>}
            </div>

            <div>
              <label className="mfp-label mb-2">Cancelled Cheque / Passbook</label>
              <FileUpload
                onUploaded={(p) => setKycForm((f) => ({ ...f, cheque_path: p }))}
                label="Upload Cheque / Passbook"
                testid="kyc-cheque"
              />
              {kycForm.cheque_path && <div className="text-xs text-emerald-700 mt-1 font-semibold">Cheque Uploaded ✓</div>}
            </div>

            <div className="md:col-span-2">
              <label className="mfp-label mb-2">Firm Front Photo (Shop/Business Entrance)</label>
              <FileUpload
                onUploaded={(p) => setKycForm((f) => ({ ...f, firm_front_path: p }))}
                label="Upload Firm Front Photo"
                testid="kyc-firm-front"
              />
              {kycForm.firm_front_path && <div className="text-xs text-emerald-700 mt-1 font-semibold">Firm Photo Uploaded ✓</div>}
            </div>
          </div>

          <button type="submit" disabled={kycBusy} className="mfp-btn-primary w-full py-3">
            {kycBusy ? "Submitting..." : "Submit KYC Documents"}
          </button>
        </form>
      </div>
    );
  }

  // 3. KYC Pending verification view
  if (user.kyc_status === "pending") {
    return (
      <div className="max-w-md mx-auto my-16 text-center" data-testid="kyc-pending-view">
        <div className="relative inline-block mb-4">
          <div className="h-16 w-16 rounded-full bg-amber-50 text-amber-600 grid place-items-center mx-auto">
            <Hourglass className="h-8 w-8 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <span className="absolute top-0 right-0 h-4 w-4 bg-amber-400 border-2 border-white rounded-full animate-ping" />
        </div>
        <h2 className="text-2xl font-semibold text-neutral-800">Verification Under Review</h2>
        <p className="text-sm text-neutral-500 mt-3 leading-relaxed">
          Your KYC documents have been submitted and are currently being reviewed by our compliance team.
          This process normally takes <strong>2-4 business hours</strong>.
        </p>
        <div className="mt-8 p-4 bg-amber-50/50 border border-amber-100 rounded-xl text-xs text-amber-800 text-left">
          <div className="font-semibold mb-1">Upload Summary:</div>
          <ul className="list-disc list-inside space-y-1 text-amber-700/90">
            <li>Aadhaar Card (Front & Back)</li>
            <li>PAN Card (Front & Back)</li>
            <li>Selfie & Cancelled Cheque</li>
            <li>Firm Front Photo</li>
          </ul>
        </div>
      </div>
    );
  }

  // 4. Normal Approved Dashboard View
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="overflow-x-hidden relative">
      <PageHeader title={`Welcome, ${user.full_name}`} subtitle={`Firm: ${user.firm_name || "MAK FIN PAY Partner"}`} />

      {/* Two-column hero: wallet (70%) + date/time (30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 mb-5">
        <div className="mfp-card p-8 !bg-[#1B4332] text-white relative overflow-hidden lg:col-span-7" data-testid="wallet-hero">
          <div className="text-xs uppercase tracking-[0.2em] text-white/80">Wallet Balance</div>
          <div className="mt-4 text-4xl sm:text-5xl font-medium tracking-tight text-white" data-testid="wallet-balance">
            {fmtMoney(balance)}
          </div>
          <Wallet className="absolute -right-8 -bottom-8 h-44 w-44 text-white/5" />
        </div>
        <div className="mfp-card p-6 lg:col-span-3 flex flex-col justify-center" data-testid="datetime-card">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Today</div>
          <div className="mt-3 text-2xl sm:text-3xl font-medium tracking-tight text-[#1B4332]" data-testid="now-date">{dateStr}</div>
          <div className="mt-3 text-xs text-neutral-500">Live data updates instantly</div>
        </div>
      </div>

      <div className="mfp-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Recent ledger</h3>
          <Link to="/agent/ledger" className="text-sm text-[#1B4332] hover:underline inline-flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full mfp-table">
            <thead><tr><th>Kind</th><th>Amount</th><th>Balance</th><th>Note</th><th>Time</th></tr></thead>
            <tbody>
              {ledger.length === 0 && <tr><td colSpan="5" className="text-center text-neutral-500 py-8">No activity yet. Start by adding money to your wallet.</td></tr>}
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="capitalize">{l.kind}</td>
                  <td className={l.kind === "debit" ? "text-rose-700" : "text-emerald-700"}>{l.kind === "debit" ? "-" : "+"}{fmtMoney(l.amount)}</td>
                  <td>{fmtMoney(l.balance_after)}</td>
                  <td className="text-neutral-600 max-w-[240px] truncate">{l.note}</td>
                  <td className="text-xs text-neutral-500">{fmtDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Welcome popup overlay */}
      {showWelcome && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4">
          <div className="bg-[#FDFCF8] rounded-3xl p-8 max-w-md w-full border border-black/5 shadow-2xl text-center relative overflow-hidden animate-bounce-once">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-green-500" />
            <div className="h-16 w-16 rounded-full bg-emerald-50 text-[#1B4332] grid place-items-center mx-auto mb-4 mt-2">
              <PartyPopper className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold text-neutral-800 mb-2">Welcome to MAK FIN PAY!</h3>
            <p className="text-sm text-neutral-500 mb-6 px-2 leading-relaxed">
              Your KYC verification has been successfully approved. Your agent portal is now active! You can now access your dashboard services, load funds, and transact.
            </p>
            
            <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl mb-6 text-left flex gap-3 text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm">Account Status: Active</div>
                <div className="text-xs text-emerald-700/90 mt-0.5">Welcome aboard! Feel free to reach support if you need any assistance.</div>
              </div>
            </div>
            
            <button 
              type="button"
              className="mfp-btn-primary w-full py-3 text-sm font-semibold rounded-xl"
              onClick={dismissWelcome}
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
