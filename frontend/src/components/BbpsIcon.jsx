import React from "react";

/**
 * Exact Official Bharat Connect (BBPS) Double 'B' Emblem
 * Clean, uncropped SVG with proper padding around all boundaries.
 */
export default function BbpsIcon({ className = "h-6 w-6", color = "#3469C7", ...props }) {
  return (
    <svg
      viewBox="-15 -10 130 135"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 inline-block align-middle overflow-visible`}
      {...props}
    >
      {/* Top B Segment */}
      <path
        d="M 0 14 C 0 6.27 6.27 0 14 0 H 52 C 77.4 0 98 20.6 98 46 C 98 51.5 93.5 56 88 56 H 14 C 6.27 56 0 49.73 0 42 V 14 Z"
        fill={color}
      />
      {/* Top Arrow Cutout */}
      <path
        d="M -5 37 H 40 L 70 7"
        stroke="#FFFFFF"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom B Segment */}
      <path
        d="M 0 59 H 88 C 93.5 59 98 63.5 98 69 C 98 94.4 77.4 115 52 115 H 14 C 6.27 115 0 108.7 0 101 V 59 Z"
        fill={color}
      />
      {/* Bottom Arrow Cutout */}
      <path
        d="M 105 78 H 60 L 30 108"
        stroke="#FFFFFF"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
