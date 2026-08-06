import React from "react";

export default function BbpsIcon({ className = "h-[18px] w-[18px]", ...props }) {
  return (
    <svg
      viewBox="0 0 100 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Top B Shape */}
      <path
        d="M 32 8 H 53.5 C 65.37 8 75 17.63 75 29.5 C 75 41.37 65.37 51 53.5 51 H 25 V 15 C 25 11.13 28.13 8 32 8 Z"
        fill="currentColor"
      />
      {/* Top Arrow Cutout (White) */}
      <path
        d="M 25 29.5 H 46 L 57.5 41"
        stroke="#ffffff"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom B Shape */}
      <path
        d="M 25 57 H 53.5 C 65.37 57 75 66.63 75 78.5 C 75 90.37 65.37 100 53.5 100 H 32 C 28.13 100 25 96.87 25 93 V 57 Z"
        fill="currentColor"
      />
      {/* Bottom Arrow Cutout (White) */}
      <path
        d="M 75 78.5 H 54 L 42.5 90"
        stroke="#ffffff"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
