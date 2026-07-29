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
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex login-side-panel flex-col justify-between p-12 bg-[#1B4332] text-white">
        <Link to="/" className="flex items-center gap-2" data-testid="login-back-home">
          <Logo variant="light" size={40} />
          <div className="leading-tight">
            <div className="text-base font-semibold">MAK FIN PAY</div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-[#E8E5D7]/70">Operator Portal</div>
          </div>
        </Link>
        <div>
          <div className="mfp-overline text-[#E8E5D7]/80">Secure login</div>
          <h1 className="text-4xl lg:text-5xl tracking-tight leading-none font-medium mt-3">
            Sign in to your<br />operator dashboard.
          </h1>
          <p className="mt-6 text-[#E8E5D7]/80 max-w-md leading-relaxed">
            Secure email and password sign-in for Admin, Distributor and Agent accounts.
          </p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-[#E8E5D7]/60">Simple Payments. Trusted Service.</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="md:hidden inline-flex items-center gap-2 text-sm text-neutral-600 mb-6"><ArrowLeft className="h-4 w-4" /> Back</Link>
          <h2 className="text-3xl font-medium tracking-tight">Welcome back</h2>
          <p className="text-neutral-600 mt-2">Enter your credentials to access the dashboard.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="mfp-label">Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Mail className="h-4 w-4 text-neutral-400" />
                </span>
                <input
                  type="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="mfp-input !pl-11" placeholder="you@example.com"
                  data-testid="login-email-input"
                />
              </div>
            </div>
            <div>
              <label className="mfp-label">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <Lock className="h-4 w-4 text-neutral-400" />
                </span>
                <input
                  type="password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="mfp-input !pl-11" placeholder="Enter password"
                  data-testid="login-password-input"
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className="mfp-btn-primary w-full" data-testid="login-submit-btn">
              <LogIn className="h-4 w-4" /> {loading ? "Signing in…" : "Sign In"}
            </button>
            {kycMessage && (
              <div
                className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm"
                role="alert"
                data-testid="login-kyc-error"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{kycMessage}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
