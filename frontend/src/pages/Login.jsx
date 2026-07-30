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
    <div className="min-h-screen w-screen relative overflow-hidden bg-[#0A0F0D] flex items-center justify-center p-4 sm:p-6 font-sans">
      <style>{`
        @keyframes float-slow-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(40px, -60px) scale(1.15); }
          66% { transform: translate(-30px, 30px) scale(0.9); }
        }
        @keyframes float-slow-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-50px, 50px) scale(1.2); }
        }
        @keyframes float-slow-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          40% { transform: translate(60px, 30px) scale(0.85); }
        }
        .animate-float-1 { animation: float-slow-1 25s infinite ease-in-out; }
        .animate-float-2 { animation: float-slow-2 30s infinite ease-in-out; }
        .animate-float-3 { animation: float-slow-3 28s infinite ease-in-out; }
      `}</style>

      {/* Background Animated Blobs */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[20%] w-[35vw] h-[35vw] rounded-full bg-emerald-600/10 blur-[120px] animate-float-1" />
        <div className="absolute bottom-[15%] right-[15%] w-[40vw] h-[40vw] rounded-full bg-teal-600/10 blur-[130px] animate-float-2" />
        <div className="absolute top-[40%] right-[30%] w-[30vw] h-[30vw] rounded-full bg-indigo-600/10 blur-[110px] animate-float-3" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.005)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.005)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-40" />

      {/* Glow Center Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-radial-glow bg-emerald-500/[0.02] blur-[150px] pointer-events-none" />

      {/* Card Wrapper */}
      <div className="relative z-10 w-full max-w-md">
        <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/[0.06] rounded-3xl p-8 sm:p-10 shadow-[0_24px_80px_rgba(0,0,0,0.4)] flex flex-col relative overflow-hidden">
          
          {/* Top border glowing overlay */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

          {/* Logo & Header */}
          <div className="flex flex-col items-center mb-8 select-none">
            <div className="h-14 w-full flex items-center justify-center overflow-hidden mb-2">
              <Logo variant="light" className="h-10 w-full object-contain scale-[1.65] translate-x-[2%]" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-emerald-400">
              Operator Portal
            </span>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-white">Welcome Back</h2>
            <p className="text-xs text-neutral-400 mt-1.5">Enter your operator credentials to sign in</p>
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
                  className="w-full bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.05] border border-white/[0.08] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-4 py-3.5 pl-11 text-sm text-white placeholder-white/20 transition-all outline-none"
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
                  className="w-full bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.05] border border-white/[0.08] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-4 py-3.5 pl-11 text-sm text-white placeholder-white/20 transition-all outline-none"
                  placeholder="••••••••"
                  data-testid="login-password-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 flex items-center justify-center gap-2 text-neutral-900 bg-emerald-400 hover:bg-emerald-300 font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed select-none mt-6"
              data-testid="login-submit-btn"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-neutral-900 border-t-transparent" />
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
          <div className="mt-8 text-center text-[10px] text-neutral-500 font-medium tracking-widest uppercase select-none">
            Secure Encryption • Protected Session
          </div>
        </div>
      </div>
    </div>
  );
}
