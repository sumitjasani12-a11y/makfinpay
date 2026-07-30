import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { formatErr } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Lock, Mail, LogIn, AlertCircle } from "lucide-react";
import Logo from "@/components/Logo";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [kycMessage, setKycMessage] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setKycMessage("");
    try {
      const res = await login(email.trim(), password);
      if (res.status === "success") {
        toast.success(`Welcome back, ${res.user.full_name}`);
        const path = res.user.role === "admin" ? "/admin"
                   : res.user.role === "master_distributor" ? "/md"
                   : res.user.role === "distributor" ? "/distributor"
                   : "/agent";
        nav(path);
      } else if (res.status === "mpin_required") {
        toast.info("Please enter your 6-digit MPIN to log in.");
        nav("/login/mpin-verify", { state: { pre_auth_token: res.pre_auth_token } });
      } else if (res.status === "setup_mpin_required") {
        toast.warning("Secure MPIN setup required. Please define your 6-digit MPIN.");
        nav("/login/mpin-setup", { state: { pre_auth_token: res.pre_auth_token } });
      }
    } catch (e) {
      const status = e.response?.status;
      const msg = formatErr(e.response?.data?.detail) || e.message;
      // Surface KYC-block messages inline so the agent sees them clearly on the form
      if (status === 403 && /kyc/i.test(msg)) {
        setKycMessage(msg);
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen relative overflow-hidden bg-[#07080A] flex flex-col md:flex-row font-sans">
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
            <div className="h-16 flex items-center justify-start">
              <Logo variant="light" className="h-12 w-auto object-contain" />
            </div>
          </Link>

          {/* Slogan */}
          <div className="max-w-md my-auto">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#00E676]">
              Secure Operator Access
            </span>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1.1] mt-4">
              Sign in to your{" "}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
                operator console.
              </span>
            </h1>
            <p className="mt-6 text-neutral-400 text-xs sm:text-sm leading-relaxed max-w-sm">
              Access the secure dashboard for Admin, Distributor, and Agent accounts to manage recharges, utility bill payments, and statements.
            </p>
          </div>

          {/* Footer Text */}
          <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">
            Simple Payments. Trusted Service.
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Login Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-16 relative overflow-hidden">
        
        {/* Mobile background bubbles (so mobile also looks premium) */}
        <div className="md:hidden absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/[0.05] blur-[80px]" />
          <div className="absolute bottom-[20%] right-[10%] w-[50vw] h-[50vw] rounded-full bg-emerald-500/[0.04] blur-[80px]" />
        </div>

        <div className="relative z-10 w-full max-w-md">
          {/* Back button (Mobile only) */}
          <Link
            to="/"
            className="md:hidden inline-flex items-center gap-2 text-xs font-bold text-neutral-400 mb-8 border border-white/[0.08] px-3.5 py-1.5 rounded-full hover:bg-white/5 transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back Home
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

            <div className="mb-8 md:mt-2">
              <h2 className="text-2xl font-black tracking-tight text-white">Welcome Back</h2>
              <p className="text-xs text-neutral-400 mt-2">Enter your operator credentials to sign in</p>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-neutral-400 uppercase tracking-wider block">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Mail className="h-4 w-4 text-neutral-500" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-4 py-3.5 pl-11 text-sm text-white placeholder-white/20 transition-all outline-none"
                    placeholder="name@example.com"
                    data-testid="login-email-input"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-neutral-400 uppercase tracking-wider block">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Lock className="h-4 w-4 text-neutral-500" />
                  </span>
                  <input
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ WebkitTextSecurity: "disc" }}
                    className="w-full bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-4 py-3.5 pl-11 text-sm text-white placeholder-white/20 transition-all outline-none"
                    placeholder="••••••••"
                    data-testid="login-password-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 flex items-center justify-center gap-2 text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-500 hover:from-violet-500 hover:via-indigo-500 hover:to-emerald-400 font-extrabold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed select-none mt-6"
                data-testid="login-submit-btn"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 stroke-[2.5]" />
                    <span>Sign In</span>
                  </>
                )}
              </button>

              {kycMessage && (
                <div
                  className="flex items-start gap-3 rounded-xl border border-amber-500/10 bg-amber-500/5 text-amber-300 px-4 py-3 text-xs leading-relaxed mt-4"
                  role="alert"
                  data-testid="login-kyc-error"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{kycMessage}</span>
                </div>
              )}
            </form>

            {/* Bottom Footer Info */}
            <div className="mt-8 text-center text-[9px] text-neutral-600 font-medium tracking-widest uppercase select-none">
              Secure Encryption • Protected Session
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
