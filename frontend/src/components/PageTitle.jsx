// Centralized browser tab title + per-route meta-description + canonical link manager.
// Mount <PageTitle /> once at the router root; it watches the current pathname
// and updates document.title, the <meta name="description"> tag, and the
// <link rel="canonical"> href accordingly. Keeps page components clean.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const DEFAULT_TITLE = "MAK FIN PAY | Digital Utility Services";
const DEFAULT_DESCRIPTION =
  "MAK FIN PAY is an India-based digital utility services platform for agent-led mobile, DTH, electricity and credit card bill payments via a secure pre-funded wallet.";

// Per-route SEO config. Only public routes get a unique description; authenticated
// dashboard routes inherit the default (they are noindexed via robots.txt anyway).
const ROUTE_META = {
  "/": {
    title: "MAK FIN PAY | Digital Utility Services",
    description:
      "MAK FIN PAY is an India-based digital utility services platform for agent-led mobile, DTH, electricity and credit card bill payments via a secure pre-funded wallet.",
  },
  "/login": {
    title: "Login | MAK FIN PAY",
    description:
      "Sign in to the MAK FIN PAY operator portal — for admins, distributors and agents managing wallet recharges and utility bill payments across India.",
  },

  // Admin
  "/admin": { title: "Dashboard | MAK FIN PAY" },
  "/admin/distributors": { title: "Distributors | MAK FIN PAY" },
  "/admin/agents": { title: "Agents | MAK FIN PAY" },
  "/admin/recharges": { title: "Recharge Approvals | MAK FIN PAY" },
  "/admin/withdrawals": { title: "Withdrawals | MAK FIN PAY" },
  "/admin/transactions": { title: "Transactions | MAK FIN PAY" },
  "/admin/qrcodes": { title: "QR Codes | MAK FIN PAY" },
  "/admin/commission": { title: "Commission Settings | MAK FIN PAY" },
  "/admin/kyc": { title: "KYC Review | MAK FIN PAY" },
  "/admin/audit": { title: "Audit Logs | MAK FIN PAY" },
  "/admin/backups": { title: "Backup & Restore | MAK FIN PAY" },
  "/admin/change-password": { title: "Change Password | MAK FIN PAY" },

  // Distributor
  "/distributor": { title: "Dashboard | MAK FIN PAY" },
  "/distributor/agents": { title: "My Agents | MAK FIN PAY" },
  "/distributor/recharges": { title: "Recharge Activity | MAK FIN PAY" },
  "/distributor/withdrawal": { title: "Withdrawal | MAK FIN PAY" },
  "/distributor/change-password": { title: "Change Password | MAK FIN PAY" },

  // Agent
  "/agent": { title: "Wallet | MAK FIN PAY" },
  "/agent/recharge": { title: "Recharge Wallet | MAK FIN PAY" },
  "/agent/billpay": { title: "Credit Card Bill | MAK FIN PAY" },
  "/agent/history": { title: "Transaction History | MAK FIN PAY" },
  "/agent/ledger": { title: "Wallet Ledger | MAK FIN PAY" },
  "/agent/withdrawal": { title: "Withdrawal | MAK FIN PAY" },
  "/agent/change-password": { title: "Change Password | MAK FIN PAY" },
};

const CANONICAL_ORIGIN = "https://makfinpay.com";

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setProperty(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = ROUTE_META[pathname] || {};
    const title = meta.title || DEFAULT_TITLE;
    const description = meta.description || DEFAULT_DESCRIPTION;
    const canonical = `${CANONICAL_ORIGIN}${pathname === "/" ? "/" : pathname}`;

    document.title = title;
    setMeta("description", description);
    setCanonical(canonical);
    setProperty("og:title", title);
    setProperty("og:description", description);
    setProperty("og:url", canonical);
  }, [pathname]);
  return null;
}
