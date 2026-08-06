import React from "react";
import BbpsIcon from "./BbpsIcon";

export default function BharatConnectLogo({ className = "", iconClassName = "h-10 w-10" }) {
  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* Blue BB Icon Mark */}
      <div className="shrink-0 text-[#2B65EC]">
        <BbpsIcon className={iconClassName} />
      </div>

      {/* Bharat Connect Text */}
      <div className="flex flex-col leading-[0.9] tracking-tight font-black text-[#F26522]">
        <span className="text-[20px] font-extrabold tracking-tight font-sans">Bharat</span>
        <span className="text-[20px] font-extrabold tracking-tight font-sans">Connect</span>
      </div>
    </div>
  );
}
