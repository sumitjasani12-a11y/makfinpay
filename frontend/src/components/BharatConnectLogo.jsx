import React from "react";
import BbpsIcon from "./BbpsIcon";

/**
 * Exact Official Bharat Connect Logo
 * Matches Image 3 uploaded by user (Blue Double-B Emblem + Orange Text).
 */
export default function BharatConnectLogo({ className = "", iconClassName = "h-8 w-8" }) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none shrink-0 ${className}`}>
      {/* Blue Double B Icon Emblem */}
      <div className="shrink-0">
        <BbpsIcon className={iconClassName} color="#3469C7" />
      </div>

      {/* Bharat Connect Text in Official Orange */}
      <div className="flex flex-col leading-[0.9] tracking-tight font-sans">
        <span className="text-[17px] font-extrabold tracking-[0.01em] text-[#F0652B]">Bharat</span>
        <span className="text-[17px] font-extrabold tracking-[0.01em] text-[#F0652B]">Connect</span>
      </div>
    </div>
  );
}
