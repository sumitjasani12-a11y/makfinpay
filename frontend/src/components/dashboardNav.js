import {
  LayoutDashboard, Users, UserCog, ArrowDownToLine, ArrowUpFromLine, Wallet,
  QrCode, Percent, FileCheck2, ScrollText, CreditCard, History,
  FilePlus2, KeyRound, DatabaseBackup, Crown,
} from "lucide-react";

/** Static navigation map per role — referenced by DashboardLayout. */
export const NAV = {
  admin: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/admin/master-distributors", label: "Master Distributors", icon: Crown },
    { to: "/admin/distributors", label: "Distributors", icon: Users },
    { to: "/admin/agents", label: "Agents", icon: UserCog },
    { to: "/admin/recharges", label: "Recharge Approvals", icon: ArrowDownToLine },
    { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
    { to: "/admin/transactions", label: "Transactions", icon: CreditCard },
    { to: "/admin/qrcodes", label: "QR Codes", icon: QrCode },
    { to: "/admin/commission", label: "Commission", icon: Percent },
    { to: "/admin/kyc", label: "KYC Review", icon: FileCheck2 },
    { to: "/admin/audit", label: "Audit Logs", icon: ScrollText },
    { to: "/admin/backups", label: "Backup & Restore", icon: DatabaseBackup },
    { to: "/admin/change-password", label: "Change Password", icon: KeyRound },
  ],
  master_distributor: [
    { to: "/md", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/md/distributors", label: "My Distributors", icon: Users },
    { to: "/md/agents", label: "My Agents", icon: UserCog },
    { to: "/md/recharges", label: "Recharge Activity", icon: ArrowDownToLine },
    { to: "/md/withdrawal", label: "Withdrawal", icon: ArrowUpFromLine },
    { to: "/md/change-password", label: "Change Password", icon: KeyRound },
  ],
  distributor: [
    { to: "/distributor", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/distributor/agents", label: "My Agents", icon: UserCog },
    { to: "/distributor/recharges", label: "Recharge Activity", icon: ArrowDownToLine },
    { to: "/distributor/withdrawal", label: "Withdrawal", icon: ArrowUpFromLine },
    { to: "/distributor/change-password", label: "Change Password", icon: KeyRound },
  ],
  agent: [
    { to: "/agent", label: "Wallet", icon: Wallet, end: true },
    { to: "/agent/recharge", label: "Recharge Wallet", icon: FilePlus2 },
    { to: "/agent/billpay", label: "Credit Card Bill", icon: CreditCard },
    { to: "/agent/history", label: "Transaction History", icon: History },
    { to: "/agent/ledger", label: "Wallet Ledger", icon: ScrollText },
    { to: "/agent/withdrawal", label: "Withdrawal", icon: ArrowUpFromLine },
    { to: "/agent/change-password", label: "Change Password", icon: KeyRound },
  ],
};
