import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api, formatErr } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Lock, Mail, LogIn, AlertCircle, Eye, EyeOff, KeyRound, X, CheckCircle2, RefreshCw } from "lucide-react";
import Logo from "@/components/Logo";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kycMessage, setKycMessage] = useState("");

  // Forgot Password States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [showForgotPw, setShowForgotPw] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let t;
    if (resendTimer > 0) {
      t = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(t);
  }, [resendTimer]);

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Please enter your registered email address.");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await api.post("/auth/forgot-password/request", { email: forgotEmail.trim() });
      toast.success(res.data?.message || "OTP has been sent to your email!");
      setForgotStep(2);
      setResendTimer(60);
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Failed to send OTP.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!forgotOtp.trim()) {
      toast.error("Please enter the 6-digit OTP.");
      return;
    }
    if (forgotNewPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await api.post("/auth/forgot-password/reset", {
        email: forgotEmail.trim(),
        otp: forgotOtp.trim(),
        new_password: forgotNewPassword,
        confirm_password: forgotConfirmPassword,
      });
      toast.success(res.data?.message || "Password reset successful! Please log in.");
      setShowForgotModal(false);
      setEmail(forgotEmail);
      setPassword("");
      setForgotStep(1);
      setForgotOtp("");
      setForgotNewPassword("");
      setForgotConfirmPassword("");
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Failed to reset password.");
    } finally {
      setForgotLoading(false);
    }
  };

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
      let msg = formatErr(e.response?.data?.detail);
      if (!msg || msg.includes("404")) {
        if (status === 401) {
          msg = "Invalid email or password. Please check your credentials.";
        } else if (status === 404) {
          msg = "User account not found. Please check your email address.";
        } else if (!e.response) {
          msg = "Unable to connect to backend server. Please refresh and try again.";
        } else {
          msg = e.message || "Login failed. Please try again.";
        }
      }
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
            <div className="h-32 flex items-center justify-start">
              <Logo variant="light" className="h-28 w-auto object-contain" />
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
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-extrabold text-neutral-400 uppercase tracking-wider block">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setShowForgotModal(true);
                      setForgotStep(1);
                    }}
                    className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                    data-testid="forgot-password-link"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Lock className="h-4 w-4 text-neutral-500" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-4 py-3.5 pl-11 pr-11 text-sm text-white placeholder-white/20 transition-all outline-none"
                    placeholder="••••••••"
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-neutral-400 hover:text-white transition-colors"
                    tabIndex="-1"
                    data-testid="login-password-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
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

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[#0D0F17] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Reset Password</h3>
                  <p className="text-xs text-neutral-400">
                    {forgotStep === 1 ? "Enter registered email for OTP" : "Enter OTP and set new password"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Step 1: Send OTP */}
            {forgotStep === 1 ? (
              <form onSubmit={handleSendOtp} className="mt-5 space-y-4">
                <div>
                  <label className="text-[11px] font-extrabold text-neutral-400 uppercase tracking-wider block mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <Mail className="h-4 w-4 text-neutral-500" />
                    </span>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 pl-11 text-sm text-white placeholder-white/20 outline-none"
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  {forgotLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Sending OTP...</span>
                    </>
                  ) : (
                    <span>Send Verification Code</span>
                  )}
                </button>
              </form>
            ) : (
              /* Step 2: Verify OTP & Set New Password */
              <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
                <div>
                  <label className="text-[11px] font-extrabold text-neutral-400 uppercase tracking-wider block mb-1.5">
                    6-Digit Verification Code (OTP)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 text-center text-lg tracking-widest font-mono font-bold text-indigo-400 placeholder-white/20 outline-none"
                      placeholder="123456"
                    />
                    <button
                      type="button"
                      disabled={forgotLoading || resendTimer > 0}
                      onClick={handleSendOtp}
                      className="px-3 py-3 text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:text-neutral-600 border border-indigo-500/20 rounded-xl bg-indigo-500/5 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {resendTimer > 0 ? `${resendTimer}s` : "Resend"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold text-neutral-400 uppercase tracking-wider block mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <Lock className="h-4 w-4 text-neutral-500" />
                    </span>
                    <input
                      type={showForgotPw ? "text" : "password"}
                      required
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 pl-11 pr-11 text-sm text-white placeholder-white/20 outline-none"
                      placeholder="At least 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotPw(!showForgotPw)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-neutral-400 hover:text-white"
                    >
                      {showForgotPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold text-neutral-400 uppercase tracking-wider block mb-1.5">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <Lock className="h-4 w-4 text-neutral-500" />
                    </span>
                    <input
                      type={showForgotPw ? "text" : "password"}
                      required
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 pl-11 text-sm text-white placeholder-white/20 outline-none"
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="w-1/3 py-3 text-xs font-semibold text-neutral-400 hover:text-white border border-white/10 rounded-xl transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-2/3 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
                  >
                    {forgotLoading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Reset Password</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
