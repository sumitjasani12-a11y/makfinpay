import React from "react";
import { useAuth } from "@/lib/auth";
import { fileUrl } from "@/lib/api";

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
 *   - collapsed: boolean to render smaller collapsed logo version
 */
export default function Logo({ variant = "dark", size, className = "", collapsed = false }) {
  const auth = useAuth();
  const branding = auth?.branding;
  const isLight = variant === "light";

  let src = isLight ? "/assets/makfinpay-white.svg" : "/assets/makfinpay-logo.png";
  let blendStyle = isLight ? undefined : { mixBlendMode: "multiply" };

  if (collapsed && branding?.logo_collapsed_path) {
    src = fileUrl(branding.logo_collapsed_path);
    blendStyle = undefined;
  } else if (!collapsed && branding?.logo_path) {
    src = fileUrl(branding.logo_path);
    blendStyle = undefined;
  }

  const height = size || (collapsed ? 28 : 44);
  const width = size || (collapsed ? 28 : undefined);

  return (
    <img
      src={src}
      alt="MAK FIN PAY logo"
      style={{
        ...blendStyle,
        maxWidth: collapsed ? "28px" : "80%",
        maxHeight: collapsed ? "28px" : "44px",
      }}
      className={`shrink-0 select-none object-contain ${className}`}
      draggable={false}
      data-testid="brand-logo"
    />
  );
}
