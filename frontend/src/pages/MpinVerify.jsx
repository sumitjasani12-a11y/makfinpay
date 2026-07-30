import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api, formatErr } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, LogIn, ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";

export default function MpinVerify() {
  const { completeLogin } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  
  const preAuthToken = location.state?.pre_auth_token;
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!preAuthToken) {
      toast.error("Pre-auth session expired or invalid. Please log in again.");
      nav("/login");
    }
  }, [preAuthToken, nav]);

  const handleChange = (index, value) => {
    if (isNaN(value)) return;
    
    const newDigits = [...digits];
    // Keep only the last character entered
    newDigits[index] = value.substring(value.length - 1);
    setDigits(newDigits);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Backspace focuses previous input
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    if (!/^\d{6}$/.test(pastedData)) return;

    const newDigits = pastedData.split("");
    setDigits(newDigits);
    inputRefs.current[5].focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    const mpin = digits.join("");
    if (mpin.length !== 6) {
      return toast.error("Please enter a valid 6-digit MPIN");
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/verify-mpin", {
        pre_auth_token: preAuthToken,
        mpin
      });

      if (res.data?.status === "success") {
        toast.success(`Access granted! Welcome.`);
        completeLogin(res.data.token, res.data.user);
        
        const path = res.data.user.role === "master_distributor" ? "/md"
                   : res.data.user.role === "distributor" ? "/distributor"
                   : "/agent";
        nav(path);
      } else {
        toast.error("Failed to verify MPIN. Please try again.");
      }
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Incorrect MPIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex login-side-panel flex-col justify-between p-12 bg-[#1B4332] text-white">
        <Link to="/" className="flex items-center gap-2">
          <Logo variant="light" size={40} />
          <div className="leading-tight">
            <div className="text-base font-semibold">MAK FIN PAY</div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-[#E8E5D7]/70">Operator Portal</div>
          </div>
        </Link>
        <div>
          <div className="mfp-overline text-[#E8E5D7]/80">Secure verification</div>
          <h1 className="text-4xl lg:text-5xl tracking-tight leading-none font-medium mt-3">
            Two-Step<br />Verification.
          </h1>
          <p className="mt-6 text-[#E8E5D7]/80 max-w-md leading-relaxed">
            Enter your personal 6-digit Mobile PIN to unlock your operator profile and protect wallet funds.
          </p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-[#E8E5D7]/60">Simple Payments. Trusted Service.</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-neutral-600 mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to Login
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShieldCheck className="h-6 w-6 stroke-[1.8]" />
            </div>
            <h2 className="text-3xl font-medium tracking-tight">Enter MPIN</h2>
          </div>
          <p className="text-neutral-600 mt-2">Verify your identity with your 6-digit secure MPIN.</p>

          <form onSubmit={submit} className="mt-8 space-y-6">
            <div className="flex justify-between gap-2.5" onPaste={handlePaste}>
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  autoComplete="one-time-code"
                  className="w-full h-14 bg-slate-50 border-2 border-slate-200/80 focus:border-indigo-500 focus:bg-white text-center text-xl font-bold rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all text-slate-800"
                  required
                />
              ))}
            </div>

            <button type="submit" disabled={loading} className="mfp-btn-primary w-full h-12 flex items-center justify-center gap-2 mt-4">
              <LogIn className="h-4 w-4" /> {loading ? "Verifying..." : "Verify & Log In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
