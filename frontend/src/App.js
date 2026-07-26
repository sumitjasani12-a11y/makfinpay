import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import DashboardLayout from "@/components/DashboardLayout";
import PageTitle from "@/components/PageTitle";

import AdminOverview from "@/pages/admin/Overview";
import AdminMasterDistributors from "@/pages/admin/MasterDistributors";
import AdminDistributors from "@/pages/admin/Distributors";
import AdminAgents from "@/pages/admin/Agents";
import AdminRecharges from "@/pages/admin/Recharges";
import AdminWithdrawals from "@/pages/admin/Withdrawals";
import AdminTransactions from "@/pages/admin/Transactions";
import AdminQRCodes from "@/pages/admin/QRCodes";
import AdminCommission from "@/pages/admin/Commission";
import AdminKyc from "@/pages/admin/Kyc";
import AdminAudit from "@/pages/admin/Audit";
import AdminBackups from "@/pages/admin/Backups";
import AdminQrNameEntry from "@/pages/admin/QrNameEntry";
import AdminServiceSlabs from "@/pages/admin/ServiceSlabs";
import AdminBanks from "@/pages/admin/Banks";

import DistOverview from "@/pages/distributor/Overview";
import DistAgents from "@/pages/distributor/Agents";
import DistRecharges from "@/pages/distributor/Recharges";
import DistWithdrawal from "@/pages/distributor/Withdrawal";

import MdOverview from "@/pages/md/Overview";
import MdDistributors from "@/pages/md/Distributors";
import MdAgents from "@/pages/md/Agents";
import MdRecharges from "@/pages/md/Recharges";
import MdWithdrawal from "@/pages/md/Withdrawal";

import AgentOverview from "@/pages/agent/Overview";
import AgentRecharge from "@/pages/agent/Recharge";
import AgentBillPay from "@/pages/agent/BillPay";
import AgentHistory from "@/pages/agent/History";
import AgentLedger from "@/pages/agent/Ledger";
import AgentWithdrawal from "@/pages/agent/Withdrawal";

import ChangePassword from "@/pages/ChangePassword";

import "@/App.css";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-neutral-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "master_distributor") return <Navigate to="/md" replace />;
  if (user.role === "distributor") return <Navigate to="/distributor" replace />;
  return <Navigate to="/agent" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PageTitle />
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={<Protected><RoleHome /></Protected>} />

          {/* Admin */}
          <Route path="/admin" element={<Protected roles={["admin"]}><DashboardLayout /></Protected>}>
            <Route index element={<AdminOverview />} />
            <Route path="master-distributors" element={<AdminMasterDistributors />} />
            <Route path="distributors" element={<AdminDistributors />} />
            <Route path="agents" element={<AdminAgents />} />
            <Route path="recharges" element={<AdminRecharges />} />
            <Route path="withdrawals" element={<AdminWithdrawals />} />
            <Route path="transactions" element={<AdminTransactions />} />
            <Route path="qrcodes" element={<AdminQRCodes />} />
            <Route path="qr-name-entry" element={<AdminQrNameEntry />} />
            <Route path="commission" element={<AdminCommission />} />
            <Route path="service-slabs" element={<AdminServiceSlabs />} />
            <Route path="banks" element={<AdminBanks />} />
            <Route path="kyc" element={<AdminKyc />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="backups" element={<AdminBackups />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>

          {/* Distributor */}
          <Route path="/distributor" element={<Protected roles={["distributor"]}><DashboardLayout /></Protected>}>
            <Route index element={<DistOverview />} />
            <Route path="agents" element={<DistAgents />} />
            <Route path="recharges" element={<DistRecharges />} />
            <Route path="withdrawal" element={<DistWithdrawal />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>

          {/* Master Distributor */}
          <Route path="/md" element={<Protected roles={["master_distributor"]}><DashboardLayout /></Protected>}>
            <Route index element={<MdOverview />} />
            <Route path="distributors" element={<MdDistributors />} />
            <Route path="agents" element={<MdAgents />} />
            <Route path="recharges" element={<MdRecharges />} />
            <Route path="withdrawal" element={<MdWithdrawal />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>

          {/* Agent */}
          <Route path="/agent" element={<Protected roles={["agent"]}><DashboardLayout /></Protected>}>
            <Route index element={<AgentOverview />} />
            <Route path="recharge" element={<AgentRecharge />} />
            <Route path="billpay" element={<AgentBillPay />} />
            <Route path="history" element={<AgentHistory />} />
            <Route path="ledger" element={<AgentLedger />} />
            <Route path="withdrawal" element={<AgentWithdrawal />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
