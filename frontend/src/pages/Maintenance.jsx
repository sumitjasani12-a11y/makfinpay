import React from "react";
import { Wrench, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fileUrl } from "@/lib/api";

export default function Maintenance() {
  const { branding } = useAuth();

  const handleRefresh = () => {
    window.location.href = "/app";
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden select-none">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.08),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.08),transparent_50%)]" />
      
      <div className="w-full max-w-md relative z-10 text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          {branding?.logo_path ? (
            <img src={fileUrl(branding.logo_path)} alt="MAK FIN PAY" className="h-12 object-contain" />
          ) : (
            <span className="text-2xl font-black tracking-wider text-white">MAK FIN PAY</span>
          )}
        </div>

        {/* Wrench Card */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 space-y-6 shadow-2xl">
          <div className="flex justify-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full w-16 h-16 animate-pulse" />
              <div className="relative p-4 bg-gradient-to-tr from-amber-500 to-orange-500 text-white rounded-3xl shadow-lg shadow-amber-500/25">
                <Wrench className="h-7 w-7 animate-[spin_4s_linear_infinite]" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-black text-white tracking-tight">
              અન્ડર મેન્ટેનન્સ (Under Maintenance)
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
              અત્યારે એપ્લિકેશનનું મેન્ટેનન્સ ચાલી રહ્યું છે. કૃપા કરીને થોડીવાર પછી ફરીથી પ્રયાસ કરો.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={handleRefresh}
              className="w-full py-3 px-4 flex items-center justify-center gap-2 text-slate-900 text-sm font-bold bg-white hover:bg-slate-100 rounded-xl transition-all shadow-md active:scale-95"
            >
              <RefreshCw className="h-4 w-4" /> ફરી પ્રયાસ કરો (Try Again)
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">
          © {new Date().getFullYear()} {branding?.app_name || "MAK FIN PAY"}. All Rights Reserved.
        </p>
      </div>
    </div>
  );
}
