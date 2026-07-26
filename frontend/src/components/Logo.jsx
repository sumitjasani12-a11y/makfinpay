import React from "react";

/**
 * MAK FIN PAY logo icon.
 *
 *   - variant="dark"  → /assets/makfinpay-logo.png  (NEW colored shield + rupee + orange lock)
 *                       PNG ships with a BLACK background, hidden via `mix-blend-mode: multiply`
 *                       so it blends seamlessly on any LIGHT surface.
 *   - variant="light" → /assets/makfinpay-white.svg (transparent white logo for DARK panels)
 *
 *   - size: pixel size (default 36)
 *   - className: extra Tailwind classes (e.g. responsive helpers)
 */
export default function Logo({ variant = "dark", size = 36, className = "" }) {
  const isLight = variant === "light";
  const src = isLight ? "/assets/makfinpay-white.svg" : "/assets/makfinpay-logo.png";
  const blendStyle = isLight ? undefined : { mixBlendMode: "multiply" };
  return (
    <img
      src={src}
      alt="MAK FIN PAY logo"
      width={size}
      height={size}
      style={blendStyle}
      className={`shrink-0 select-none object-contain ${className}`}
      draggable={false}
      data-testid="brand-logo"
    />
  );
}
