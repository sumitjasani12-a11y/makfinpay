import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { 
  KeyRound, ShieldCheck, Hourglass, PartyPopper, CheckCircle2, AlertCircle
} from "lucide-react";

function PasswordGate({ user, onDone }) {
  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!pwForm.password || pwForm.password.length < 8) {
      return toast.error("New password must be at least 8 characters");
    }
    if (pwForm.password !== pwForm.confirm) {
      return toast.error("Passwords do not match");
    }
    setPwBusy(true);
    try {
      await api.post("/agent/change-first-password", { password: pwForm.password });
      toast.success("Password changed successfully! Welcome to your secure account.");
      onDone();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail));
    } finally {
      setPwBusy(false);
    }
  };
  return (
    <div className="max-w-md mx-auto my-16 p-8 bg-white border border-black/5 rounded-3xl shadow-xl text-center">
      <div className="h-14 w-14 rounded-2xl bg-amber-50 text-amber-600 grid place-items-center mx-auto mb-6">
        <KeyRound className="h-7 w-7 animate-bounce" />
      </div>
      <h2 className="text-xl font-bold text-neutral-800">Secure Your Account</h2>
      <p className="text-sm text-neutral-500 mt-2 mb-6">
        You are logged in with temporary credentials. Please set a new secure password to activate your portal.
      </p>
      <form onSubmit={handlePasswordSubmit} className="space-y-4 text-left">
        <div>
          <label className="mfp-label">New Password</label>
          <input
            type="password"
            className="mfp-input"
            value={pwForm.password}
            onChange={(e) => setPwForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Min 8 characters"
            required
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="mfp-label">Confirm New Password</label>
          <input
            type="password"
            className="mfp-input"
            value={pwForm.confirm}
            onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
            placeholder="Confirm new password"
            required
            autoComplete="new-password"
          />
        </div>
        <button type="submit" disabled={pwBusy} className="mfp-btn-primary w-full py-2.5 mt-2 font-semibold">
          {pwBusy ? "Saving..." : "Change Password & Continue"}
        </button>
      </form>
    </div>
  );
}

export default function KycPasswordGate({ children }) {
  const { user, setUser } = useAuth();
  const [kycForm, setKycForm] = useState({
    aadhaar_path: "",
    aadhaar_back_path: "",
    pan_path: "",
    selfie_path: "",
    cheque_path: "",
    firm_front_path: ""
  });
  const [kycBusy, setKycBusy] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const reloadUser = async () => {
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (user && user.kyc_status === "approved" && !user.welcome_shown) {
      setShowWelcome(true);
    }
  }, [user]);

  const handleKycSubmit = async (e) => {
    e.preventDefault();
    if (
      !kycForm.aadhaar_path ||
      !kycForm.aadhaar_back_path ||
      !kycForm.pan_path ||
      !kycForm.selfie_path ||
      !kycForm.cheque_path ||
      !kycForm.firm_front_path
    ) {
      return toast.error("Please upload all 6 required documents");
    }
    setKycBusy(true);
    try {
      await api.post("/agent/submit-kyc", kycForm);
      toast.success("KYC documents submitted successfully!");
      reloadUser();
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail));
    } finally {
      setKycBusy(false);
    }
  };

  const dismissWelcome = async () => {
    try {
      await api.post("/agent/dismiss-welcome");
      setShowWelcome(false);
      reloadUser();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  if (!user) return null;

  // 1. Password Change Gate
  if (user.first_login) {
    return <PasswordGate user={user} onDone={reloadUser} />;
  }

  // 2. KYC Submission or Re-submission form
  if (user.kyc_status === "not_submitted" || user.kyc_status === "rejected") {
    return (
      <div className="max-w-4xl mx-auto my-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-neutral-800">Submit KYC Verification</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Compliance requires verifying your identity and business storefront details.
          </p>
        </div>

        {user.kyc_status === "rejected" && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-800" data-testid="kyc-rejected-view">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">KYC Verification Rejected</div>
              <div className="text-sm mt-1">Reason: {user.kyc_rejection_reason || "Invalid documents submitted. Please re-upload correct copies."}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleKycSubmit} className="mfp-card p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

            <div>
              <label className="mfp-label mb-2">Firm Front Photo (Shop/Entrance)</label>
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
      </div>
    );
  }

  return (
    <>
      {children}

      {showWelcome && (
        <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4 animate-fade-in" data-testid="kyc-welcome-modal">
          <div className="bg-white rounded-3xl max-w-md w-full border border-black/5 shadow-2xl p-6 text-center relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-green-600" />
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-6 mt-2">
              <PartyPopper className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold text-neutral-800">KYC Verification Approved!</h3>
            <p className="text-sm text-neutral-600 mt-3 mb-6 leading-relaxed">
              Welcome to the team! Your business verification is completed. Your digital wallet and operations are now fully activated.
            </p>
            <button
              onClick={dismissWelcome}
              className="w-full py-3 bg-[#2D6A4F] hover:bg-[#2D6A4F]/90 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-emerald-700/10 inline-flex items-center justify-center gap-2"
              data-testid="welcome-close"
            >
              <CheckCircle2 className="h-4 w-4" /> Get Started
            </button>
          </div>
        </div>
      )}
    </>
  );
}
