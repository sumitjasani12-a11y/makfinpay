import React from "react";

/**
 * Official Bharat Connect (BBPS) Icon Emblem
 * Renders the two distinctive 'B' shapes with white directional arrows.
 */
export default function BbpsIcon({ className = "h-5 w-5", ...props }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 inline-block align-middle`}
      {...props}
    >
      {/* Top B Symbol - Electric Blue */}
      <path
        d="M 28 6 H 54 C 67.2 6 78 16.8 78 30 C 78 43.2 67.2 54 54 54 H 20 V 14 C 20 9.58 23.58 6 28 6 Z"
        fill="#0066FF"
      />
      {/* Top Arrow Cutout - Pure White */}
      <path
        d="M 20 30 H 44 L 56 42"
        stroke="#FFFFFF"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom B Symbol - Vibrant Orange */}
      <path
        d="M 20 46 H 54 C 67.2 46 78 56.8 78 70 C 78 83.2 67.2 94 54 94 H 28 C 23.58 94 20 90.42 20 86 V 46 Z"
        fill="#FF5500"
      />
      {/* Bottom Arrow Cutout - Pure White */}
      <path
        d="M 78 70 H 54 L 42 82"
        stroke="#FFFFFF"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
