import React from "react";
import BbpsIcon from "./BbpsIcon";

/**
 * Official Bharat Connect Logo Banner Component
 */
export default function BharatConnectLogo({ className = "", iconClassName = "h-7 w-7" }) {
  return (
    <div className={`inline-flex items-center gap-2.5 bg-white shadow-sm border border-slate-200/90 px-3.5 py-1.5 rounded-2xl select-none shrink-0 ${className}`}>
      <BbpsIcon className={iconClassName} />
      <div className="flex flex-col leading-none font-sans font-black">
        <span className="text-[14px] font-black tracking-tight text-[#0A2540]">Bharat</span>
        <span className="text-[14px] font-black tracking-tight text-[#FF5500]">Connect</span>
      </div>
    </div>
  );
}
