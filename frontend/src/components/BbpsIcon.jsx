import React from "react";

/**
 * Exact Official Bharat Connect (BBPS) Double 'B' Emblem
 * Matches user uploaded image with exact vector geometry and zero cropping.
 */
export default function BbpsIcon({ className = "h-5 w-auto", color = "#3469C7", ...props }) {
  return (
    <svg
      viewBox="-15 -15 230 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 inline-block align-middle overflow-visible`}
      {...props}
    >
      {/* Top B Segment */}
      <path
        d="M 0 35 C 0 15.67 15.67 0 35 0 H 105 C 157.47 0 200 42.53 200 95 C 200 106.05 191.05 115 180 115 H 35 C 15.67 115 0 99.33 0 80 V 35 Z"
        fill={color}
      />
      {/* Top Arrow Cutout */}
      <path
        d="M -10 75 H 85 L 145 15"
        stroke="#FFFFFF"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom B Segment */}
      <path
        d="M 0 125 H 180 C 191.05 125 200 133.95 200 145 C 200 197.47 157.47 240 105 240 H 35 C 15.67 240 0 224.33 0 205 V 125 Z"
        fill={color}
      />
      {/* Bottom Arrow Cutout */}
      <path
        d="M 210 165 H 125 L 65 225"
        stroke="#FFFFFF"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
