import React from "react";

/**
 * Official Bharat Connect (BBPS) Icon Emblem
 * Precision-crafted vertical 'B' letter emblem matching NPCI branding.
 */
export default function BbpsIcon({ className = "h-[18px] w-[18px]", color = "#3469C7", strokeWidth, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 inline-block align-middle`}
      {...props}
    >
      {/* Top D-Loop of B */}
      <path
        d="M 3 1 H 13 C 17.5 1 21 4.5 21 8.5 C 21 11.5 18.5 11.5 16 11.5 H 3 V 1 Z"
        fill={color}
      />
      {/* Top Arrow Cut (White) */}
      <path
        d="M 1 8.5 H 10.5 L 16.5 2.5"
        stroke="#FFFFFF"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom D-Loop of B */}
      <path
        d="M 3 12.5 H 16 C 18.5 12.5 21 12.5 21 15.5 C 21 19.5 17.5 23 13 23 H 3 V 12.5 Z"
        fill={color}
      />
      {/* Bottom Arrow Cut (White) */}
      <path
        d="M 23 15.5 H 13.5 L 7.5 21.5"
        stroke="#FFFFFF"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
