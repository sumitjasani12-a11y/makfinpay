import React from "react";
import BbpsIcon from "./BbpsIcon";

export default function BharatConnectLogo({ className = "", iconClassName = "h-8 w-8" }) {
  return (
    <div className={`inline-flex items-center gap-2.5 bg-white px-3.5 py-1.5 rounded-2xl border border-black/10 shadow-xs select-none ${className}`}>
      {/* Blue BB Icon Mark */}
      <div className="shrink-0">
        <BbpsIcon className={iconClassName} color="#2B65EC" />
      </div>

      {/* Bharat Connect Text */}
      <div className="flex flex-col leading-[0.95] tracking-tight font-black">
        <span className="text-[15px] font-black tracking-tight text-[#0A2540] font-sans">Bharat</span>
        <span className="text-[15px] font-black tracking-tight text-[#F26522] font-sans">Connect</span>
      </div>
    </div>
  );
}
