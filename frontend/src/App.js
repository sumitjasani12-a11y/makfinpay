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
import AdminLiveBillHistory from "@/pages/admin/LiveBillHistory";
import AdminQRCodes from "@/pages/admin/QRCodes";
import AdminCommission from "@/pages/admin/Commission";
import AdminKyc from "@/pages/admin/Kyc";
import AdminAudit from "@/pages/admin/Audit";
import AdminQrNameEntry from "@/pages/admin/QrNameEntry";
import AdminQRGallery from "@/pages/admin/QRGallery";
import AdminHeadlines from "@/pages/admin/Headlines";
import AdminServiceSlabs from "@/pages/admin/ServiceSlabs";
import AdminBanks from "@/pages/admin/Banks";
import AdminCcBillers from "@/pages/admin/CcBillers";
import AdminSettings from "@/pages/admin/Settings";
import AdminReasons from "@/pages/admin/Reasons";
import AdminPolicies from "@/pages/admin/Policies";
import AdminStatement from "@/pages/admin/Statement";
import AdminManagement from "@/pages/admin/AdminManagement";
import UserPolicies from "@/pages/UserPolicies";
import Maintenance from "@/pages/Maintenance";


import DistOverview from "@/pages/distributor/Overview";
import DistAgents from "@/pages/distributor/Agents";
import DistRecharges from "@/pages/distributor/Recharges";
import DistWithdrawal from "@/pages/distributor/Withdrawal";

import MdOverview from "@/pages/md/Overview";
import MdDistributors from "@/pages/md/Distributors";
import MdRecharges from "@/pages/md/Recharges";
import MdWithdrawal from "@/pages/md/Withdrawal";

import AgentOverview from "@/pages/agent/Overview";
import AgentRecharge from "@/pages/agent/Recharge";
import AgentBillPay from "@/pages/agent/BillPay";
import AgentLiveBillPay from "@/pages/agent/LiveBillPay";
import AgentLiveBillHistory from "@/pages/agent/LiveBillHistory";
import AgentLedger from "@/pages/agent/Ledger";
import AgentWithdrawal from "@/pages/agent/Withdrawal";

import ChangePassword from "@/pages/ChangePassword";
import ChangeMpin from "@/pages/ChangeMpin";
import MpinVerify from "@/pages/MpinVerify";
import MpinSetup from "@/pages/MpinSetup";
import ChangeTpin from "@/pages/agent/ChangeTpin";

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

function GlobalRealtimeListener() {
  const { user } = useAuth();

  React.useEffect(() => {
    const handleSettingsUpdated = (e) => {
      const data = e.detail || {};
      if (data.maintenance_mode !== undefined) {
        if (data.maintenance_mode) {
          if (user && user.role !== "admin") {
            if (window.location.pathname !== "/maintenance") {
              window.location.href = "/maintenance";
            }
          }
        } else {
          if (window.location.pathname === "/maintenance") {
            window.location.href = user ? "/app" : "/login";
          }
        }
      }
    };

    window.addEventListener("ws:settings_updated", handleSettingsUpdated);

    // Direct Supabase Realtime channel subscription
    let channel = null;
    try {
      const supabase = getSupabase();
      if (supabase) {
        channel = supabase
          .channel("public:settings:realtime")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "settings" },
            (payload) => {
              const newRec = payload.new || {};
              if (newRec.maintenance_mode !== undefined) {
                if (newRec.maintenance_mode) {
                  if (user && user.role !== "admin") {
                    if (window.location.pathname !== "/maintenance") {
                      window.location.href = "/maintenance";
                    }
                  }
                } else {
                  if (window.location.pathname === "/maintenance") {
                    window.location.href = user ? "/app" : "/login";
                  }
                }
              }
            }
          )
          .subscribe();
      }
    } catch (err) {
      console.warn("Supabase realtime subscription error:", err);
    }

    return () => {
      window.removeEventListener("ws:settings_updated", handleSettingsUpdated);
      if (channel) {
        try {
          const supabase = getSupabase();
          if (supabase) supabase.removeChannel(channel);
        } catch (e) {}
      }
    };
  }, [user]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <GlobalRealtimeListener />
        <PageTitle />
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/login/mpin-verify" element={<MpinVerify />} />
          <Route path="/login/mpin-setup" element={<MpinSetup />} />
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
            <Route path="live-bill-history" element={<AdminLiveBillHistory />} />
            <Route path="qrcodes" element={<AdminQRCodes />} />
            <Route path="qr-name-entry" element={<AdminQrNameEntry />} />
            <Route path="qr-gallery" element={<AdminQRGallery />} />
            <Route path="headlines" element={<AdminHeadlines />} />
            <Route path="commission" element={<AdminCommission />} />
            <Route path="service-slabs" element={<AdminServiceSlabs />} />
            <Route path="banks" element={<AdminBanks />} />
            <Route path="cc-billers" element={<AdminCcBillers />} />
            <Route path="kyc" element={<AdminKyc />} />
            <Route path="reasons" element={<AdminReasons />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="change-password" element={<ChangePassword />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="policies" element={<AdminPolicies />} />
            <Route path="statement" element={<AdminStatement />} />
            <Route path="admins" element={<AdminManagement />} />
          </Route>

          {/* Distributor */}
          <Route path="/distributor" element={<Protected roles={["distributor"]}><DashboardLayout /></Protected>}>
            <Route index element={<DistOverview />} />
            <Route path="agents" element={<DistAgents />} />
            <Route path="recharges" element={<DistRecharges />} />
            <Route path="withdrawal" element={<DistWithdrawal />} />
            <Route path="change-password" element={<ChangePassword />} />
            <Route path="change-mpin" element={<ChangeMpin />} />
            <Route path="policies" element={<UserPolicies />} />
          </Route>

          {/* Master Distributor */}
          <Route path="/md" element={<Protected roles={["master_distributor"]}><DashboardLayout /></Protected>}>
            <Route index element={<MdOverview />} />
            <Route path="distributors" element={<MdDistributors />} />
            <Route path="recharges" element={<MdRecharges />} />
            <Route path="withdrawal" element={<MdWithdrawal />} />
            <Route path="change-password" element={<ChangePassword />} />
            <Route path="change-mpin" element={<ChangeMpin />} />
            <Route path="policies" element={<UserPolicies />} />
          </Route>

          {/* Agent */}
          <Route path="/agent" element={<Protected roles={["agent"]}><DashboardLayout /></Protected>}>
            <Route index element={<AgentOverview />} />
            <Route path="recharge" element={<AgentRecharge />} />
            <Route path="billpay" element={<AgentBillPay />} />
            <Route path="live-billpay" element={<AgentLiveBillPay />} />
            <Route path="live-billpay/history" element={<AgentLiveBillHistory />} />
            <Route path="ledger" element={<AgentLedger />} />
            <Route path="withdrawal" element={<AgentWithdrawal />} />
            <Route path="change-password" element={<ChangePassword />} />
            <Route path="change-mpin" element={<ChangeMpin />} />
            <Route path="change-tpin" element={<ChangeTpin />} />
            <Route path="policies" element={<UserPolicies />} />
          </Route>

          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
