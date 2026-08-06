import React from "react";

/**
 * Official Bharat Connect (BBPS) Icon Emblem
 * Precision-crafted on 24x24 grid to perfectly match Lucide sidebar icons.
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
      {/* Top B Segment - Official Blue */}
      <path
        d="M 2 3.5 C 2 2.12 3.12 1 4.5 1 H 13.5 C 18.2 1 22 4.8 22 9.5 C 22 10.33 21.33 11 20.5 11 H 4.5 C 3.12 11 2 9.88 2 8.5 V 3.5 Z"
        fill={color}
      />
      {/* Top Arrow Cutout - Pure White */}
      <path
        d="M 1 7.5 H 9.5 L 16 1"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom B Segment - Official Blue */}
      <path
        d="M 2 13 H 20.5 C 21.33 13 22 13.67 22 14.5 C 22 19.2 18.2 23 13.5 23 H 4.5 C 3.12 23 2 21.88 2 20.5 V 13 Z"
        fill={color}
      />
      {/* Bottom Arrow Cutout - Pure White */}
      <path
        d="M 23 16.5 H 14.5 L 8 23"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
