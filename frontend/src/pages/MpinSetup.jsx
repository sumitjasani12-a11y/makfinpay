import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api, formatErr } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, Plus, ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";

export default function MpinSetup() {
  const { completeLogin } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  
  const preAuthToken = location.state?.pre_auth_token;
  const [pin, setPin] = useState(Array(6).fill(""));
  const [confirmPin, setConfirmPin] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  
  const pinRefs = useRef([]);
  const confirmRefs = useRef([]);

  useEffect(() => {
    if (!preAuthToken) {
      toast.error("Pre-auth session expired or invalid. Please log in again.");
      nav("/login");
    }
  }, [preAuthToken, nav]);

  const handlePinChange = (index, value) => {
    if (isNaN(value)) return;
    const newPin = [...pin];
    newPin[index] = value.substring(value.length - 1);
    setPin(newPin);

    if (value && index < 5) {
      pinRefs.current[index + 1].focus();
    }
  };

  const handleConfirmChange = (index, value) => {
    if (isNaN(value)) return;
    const newConfirm = [...confirmPin];
    newConfirm[index] = value.substring(value.length - 1);
    setConfirmPin(newConfirm);

    if (value && index < 5) {
      confirmRefs.current[index + 1].focus();
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      pinRefs.current[index - 1].focus();
    }
  };

  const handleConfirmKeyDown = (index, e) => {
    if (e.key === "Backspace" && !confirmPin[index] && index > 0) {
      confirmRefs.current[index - 1].focus();
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const pinStr = pin.join("");
    const confirmStr = confirmPin.join("");

    if (pinStr.length !== 6 || confirmStr.length !== 6) {
      return toast.error("Please enter a 6-digit PIN in both fields");
    }

    if (pinStr !== confirmStr) {
      return toast.error("PIN and Confirm PIN do not match");
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/setup-mpin", {
        pre_auth_token: preAuthToken,
        mpin: pinStr
      });

      if (res.data?.status === "success") {
        toast.success("Security MPIN set up successfully!");
        completeLogin(res.data.token, res.data.user);
        
        const path = res.data.user.role === "master_distributor" ? "/md"
                   : res.data.user.role === "distributor" ? "/distributor"
                   : "/agent";
        nav(path);
      } else {
        toast.error("Failed to setup MPIN. Please try again.");
      }
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Error setting up MPIN");
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
          <div className="mfp-overline text-[#E8E5D7]/80">Setup credentials</div>
          <h1 className="text-4xl lg:text-5xl tracking-tight leading-none font-medium mt-3">
            Secure Your<br />Account.
          </h1>
          <p className="mt-6 text-[#E8E5D7]/80 max-w-md leading-relaxed">
            Please define a 6-digit secure MPIN. This MPIN will be required every time you sign in to protect your balance and logs.
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
            <h2 className="text-3xl font-medium tracking-tight">Setup MPIN</h2>
          </div>
          <p className="text-neutral-600 mt-2">Create a secure 6-digit PIN for quick login access.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="mfp-label mb-2">New 6-Digit MPIN</label>
              <div className="flex justify-between gap-2.5">
                {pin.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (pinRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={digit}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    autoComplete="one-time-code"
                    className="w-full h-12 bg-slate-50 border-2 border-slate-200/80 focus:border-indigo-500 focus:bg-white text-center text-lg font-bold rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all text-slate-800"
                    required
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="mfp-label mb-2 mt-4 block">Confirm 6-Digit MPIN</label>
              <div className="flex justify-between gap-2.5">
                {confirmPin.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (confirmRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={digit}
                    onChange={(e) => handleConfirmChange(index, e.target.value)}
                    onKeyDown={(e) => handleConfirmKeyDown(index, e)}
                    autoComplete="one-time-code"
                    className="w-full h-12 bg-slate-50 border-2 border-slate-200/80 focus:border-indigo-500 focus:bg-white text-center text-lg font-bold rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all text-slate-800"
                    required
                  />
                ))}
              </div>
            </div>

            <button type="submit" disabled={loading} className="mfp-btn-primary w-full h-12 flex items-center justify-center gap-2 mt-6">
              <Plus className="h-4 w-4" /> {loading ? "Saving..." : "Set & Confirm MPIN"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
