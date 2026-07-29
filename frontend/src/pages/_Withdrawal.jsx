import React, { useCallback, useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import BankDetailsCard from "@/components/BankDetailsCard";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

export default function Withdrawal() {
  const { user } = useAuth();
  const isDistributor = user?.role === "distributor";
  const isMd = user?.role === "master_distributor";
  const isEarningsRole = isDistributor || isMd;
  const [items, setItems] = useState([]);
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankStatus, setBankStatus] = useState(null); // {is_complete, missing_fields}
  const [withdrawalEnabled, setWithdrawalEnabled] = useState(true);

  const reload = useCallback(async () => {
    const statsEndpoint = isMd ? "/master-distributor/stats"
                        : isDistributor ? "/distributor/stats"
                        : "/wallet";
    const [list, balData, bankData] = await Promise.all([
      api.get("/withdrawals/mine"),
      api.get(statsEndpoint),
      api.get("/bank"),
    ]);
    setItems(list.data);
    if (isEarningsRole) {
      setBalance(balData.data.available_for_withdrawal ?? 0);
    } else {
      setBalance(balData.data.balance ?? 0);
    }
    setBankStatus({
      is_complete: Boolean(bankData.data?.is_complete),
      missing_fields: bankData.data?.missing_fields || [],
      has_any: Boolean(bankData.data?.account_holder),
    });
  }, [isDistributor, isMd, isEarningsRole]);

  useEffect(() => {
    reload();

    const fetchConfig = () => {
      api.get("/settings/recharge-limits-public")
        .then((r) => {
          setWithdrawalEnabled(r.data.withdrawal_enabled ?? true);
        })
        .catch((e) => console.log("Failed to fetch settings config:", e.message));
    };

    fetchConfig();
    const interval = setInterval(fetchConfig, 4000);
    return () => clearInterval(interval);
  }, [reload]);

  const submit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!bankStatus?.is_complete) return toast.error("Please complete all your bank details (including phone number) before requesting a withdrawal.");
    setIsSubmitting(true);
    try {
      await api.post("/withdrawals", { amount: parseFloat(amount) });
      toast.success("Withdrawal requested");
      setAmount("");
      reload();
      setTimeout(() => setIsSubmitting(false), 1500);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
      setIsSubmitting(false);
    }
  };

  const balanceLabel = isEarningsRole ? "Available Earnings" : "Available Wallet Balance";
  const fieldLabel = (k) => ({
    account_holder: "Account Holder",
    account_number: "Account Number",
    ifsc: "IFSC",
    bank_name: "Bank Name",
    phone_number: "Phone Number",
  }[k] || k);
  const missingList = bankStatus?.missing_fields?.map(fieldLabel).join(", ") || "";

  return (
    <div>
      <PageHeader title="Withdrawal Requests" subtitle="Funds are held until admin approves." />

      {!withdrawalEnabled ? (
        <div className="bg-white border border-black/5 rounded-3xl p-10 lg:p-16 shadow-lg shadow-indigo-500/5 flex flex-col items-center justify-center text-center space-y-5 max-w-[800px] mx-auto mb-8 animate-fadeIn">
          <div className="bg-rose-50 text-rose-600 p-5 rounded-full border border-rose-200/50 animate-pulse">
            <AlertCircle className="h-12 w-12 stroke-1" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-neutral-800">Withdrawal Service Paused</h3>
            <p className="text-sm text-neutral-500 max-w-md leading-relaxed mx-auto">
              Withdrawal requests are temporarily disabled by the administrator. 
              Please contact support if you have any questions or require immediate settlement assistance.
            </p>
          </div>
          <div className="text-[10px] text-neutral-400 font-mono bg-neutral-50 px-3 py-1.5 rounded-full border border-neutral-100">
            SERVICE_STATUS: PAUSED
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 mb-8 items-stretch">
          {/* LEFT — withdrawal request card */}
          <form onSubmit={submit} className="mfp-card p-6 h-full flex flex-col justify-between" data-testid="withdraw-form">
            <div className="flex-1">
              <h3 className="text-base font-medium mb-4">Request Withdrawal</h3>
              <div
                className="mb-4 flex items-center justify-between rounded-lg bg-white border border-black/5 px-4 py-3"
                data-testid="withdraw-available-balance"
              >
                <span className="mfp-overline">{balanceLabel}</span>
                <span className="text-base font-medium text-[#CC5500]" data-testid="withdraw-available-amount">
                  {balance === null ? "—" : fmtMoney(balance)}
                </span>
              </div>
              {bankStatus && !bankStatus.is_complete && (
                <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800" data-testid="withdraw-bank-warning">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    {bankStatus.has_any
                      ? <>Your bank details are incomplete. Please fill in <span className="font-semibold">{missingList}</span> in the Bank Details card (right) and save before you can request a withdrawal.</>
                      : <>Please add your bank details (right) — all fields including Phone Number — before requesting a withdrawal.</>
                    }
                  </span>
                </div>
              )}
              <div className="mb-4">
                <label className="mfp-label">Amount</label>
                <input
                  className="mfp-input"
                  type="number" min="1" step="0.01" required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  data-testid="withdraw-amount"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !bankStatus?.is_complete}
              className="mfp-btn-primary w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 h-[42px]"
              data-testid="withdraw-submit"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Submitting…" : "Request Withdrawal"}
            </button>
          </form>

          {/* RIGHT — bank details card */}
          <BankDetailsCard highlightMissing={bankStatus?.missing_fields || []} onSaved={() => reload()} />
        </div>
      )}

      <DataTable
        columns={[
          { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount) },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "created_at", label: "Requested", render: (r) => fmtDate(r.created_at) },
          { key: "reviewed_at", label: "Reviewed", render: (r) => fmtDate(r.reviewed_at) },
        ]}
        rows={items}
      />
    </div>
  );
}
