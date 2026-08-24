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
    <div className="min-h-screen w-screen relative overflow-hidden bg-[#07080A] flex flex-col md:flex-row font-sans select-none">
      <style>{`
        @keyframes float-slow-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.15); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes float-slow-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-40px, 40px) scale(1.2); }
        }
        @keyframes float-slow-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          40% { transform: translate(50px, 20px) scale(0.85); }
        }
        .animate-float-1 { animation: float-slow-1 20s infinite ease-in-out; }
        .animate-float-2 { animation: float-slow-2 24s infinite ease-in-out; }
        .animate-float-3 { animation: float-slow-3 22s infinite ease-in-out; }
      `}</style>

      {/* LEFT SIDE: Multi-color Animation Panel */}
      <div className="hidden md:flex md:w-1/2 relative bg-[#0B0D13] border-r border-white/[0.04] flex-col justify-between p-16 overflow-hidden select-none">
        
        {/* Floating Orbs behind a blur layer */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[10%] left-[15%] w-[25vw] h-[25vw] rounded-full bg-violet-600/15 blur-[90px] animate-float-1" />
          <div className="absolute bottom-[15%] right-[10%] w-[30vw] h-[30vw] rounded-full bg-emerald-500/10 blur-[110px] animate-float-2" />
          <div className="absolute top-[35%] right-[25%] w-[22vw] h-[22vw] rounded-full bg-blue-600/15 blur-[100px] animate-float-3" />
        </div>

        {/* Technical Grid Pattern Overlay */}
        <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.005)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.005)_1px,transparent_1px)] bg-[size:25px_25px] pointer-events-none opacity-40" />

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col justify-between h-full w-full">
          {/* Header Link */}
          <Link to="/" className="flex items-center gap-3">
            <div className="h-32 flex items-center justify-start">
              <Logo variant="light" className="h-28 w-auto object-contain" />
            </div>
          </Link>

          {/* Slogan */}
          <div className="max-w-md my-auto">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#00E676]">
              Secure Verification
            </span>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1.1] mt-4">
              Two-Step{" "}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
                Verification.
              </span>
            </h1>
            <p className="mt-6 text-neutral-400 text-xs sm:text-sm leading-relaxed max-w-sm">
              Enter your personal 6-digit Mobile PIN to unlock your operator profile and protect wallet funds.
            </p>
          </div>

          {/* Footer Text */}
          <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">
            Simple Payments. Trusted Service.
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: MPIN Verification Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-16 relative overflow-hidden">
        
        {/* Mobile background bubbles */}
        <div className="md:hidden absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/[0.05] blur-[80px]" />
          <div className="absolute bottom-[20%] right-[10%] w-[50vw] h-[50vw] rounded-full bg-emerald-500/[0.04] blur-[80px]" />
        </div>

        <div className="relative z-10 w-full max-w-md">
          {/* Back button */}
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-xs font-bold text-neutral-400 mb-8 border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/5 transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
          </Link>

          {/* Form Glassmorphic Card */}
          <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/[0.06] rounded-3xl p-8 sm:p-10 shadow-[0_24px_80px_rgba(0,0,0,0.5)] flex flex-col relative overflow-hidden">
            
            {/* Top border glowing overlay */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

            {/* Mobile Header Logo */}
            <div className="md:hidden flex flex-col items-center mb-8 select-none">
              <div className="h-12 w-full flex items-center justify-center overflow-hidden mb-2">
                <Logo variant="light" className="h-8 w-full object-contain scale-[1.65] translate-x-[2%]" />
              </div>
              <span className="text-[9px] font-extrabold uppercase tracking-[0.25em] text-emerald-400">
                Operator Portal
              </span>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
                <ShieldCheck className="h-6 w-6 stroke-[1.8]" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Enter MPIN</h2>
            </div>
            <p className="text-neutral-400 text-xs mt-1 leading-relaxed">Verify your identity with your 6-digit secure MPIN.</p>

            <form onSubmit={submit} className="mt-8 space-y-6">
              <div className="flex justify-between gap-2 sm:gap-2.5" onPaste={handlePaste}>
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    autoComplete="one-time-code"
                    className="w-11 sm:w-12 h-14 bg-white/[0.03] border border-white/[0.1] focus:border-emerald-400/80 focus:bg-white/[0.06] text-center text-xl font-bold rounded-2xl outline-none focus:ring-4 focus:ring-emerald-400/10 transition-all text-white shadow-inner"
                    required
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-500 text-white font-extrabold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer mt-4"
              >
                <LogIn className="h-4 w-4" /> {loading ? "Verifying..." : "Verify & Log In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
