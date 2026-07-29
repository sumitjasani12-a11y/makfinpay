import React, { useCallback, useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import BankDetailsCard from "@/components/BankDetailsCard";
import { toast } from "sonner";
import { Loader2, AlertCircle, Landmark, ShieldCheck } from "lucide-react";

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
    <div className="space-y-6">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* LEFT — withdrawal request card */}
          <form onSubmit={submit} className="bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col justify-between h-full min-h-[380px]" data-testid="withdraw-form">
            <div className="flex-1">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#2D6A4F] flex items-center gap-2 border-b border-neutral-100 pb-3 mb-5">
                <Landmark className="h-4.5 w-4.5" /> Request Withdrawal
              </h3>

              {/* Balance display as rich premium card */}
              <div className="mb-5 bg-gradient-to-br from-[#1b4332] to-[#2d6a4f] text-white rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between h-28">
                <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                  <Landmark className="h-32 w-32 stroke-1" />
                </div>
                
                <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#d8f3dc]/80">{balanceLabel}</span>
                <span className="text-3xl font-black tracking-tight mt-1" data-testid="withdraw-available-amount">
                  {balance === null ? "—" : fmtMoney(balance)}
                </span>
                <span className="text-[10px] text-[#d8f3dc]/70 font-semibold mt-1">All time • Live available earnings</span>
              </div>

              {bankStatus && !bankStatus.is_complete && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200/80 p-4 text-xs text-amber-900 leading-relaxed shadow-sm" data-testid="withdraw-bank-warning">
                  <AlertCircle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-amber-950 uppercase tracking-wider text-[9px] mb-0.5">Action Required</span>
                    <span>
                      {bankStatus.has_any
                        ? <>Your bank details are incomplete. Please fill in <span className="font-extrabold text-amber-955">{missingList}</span> in the Bank Details card (right) and save before you can request a withdrawal.</>
                        : <>Please add your bank details (right) — all fields including Phone Number — before requesting a withdrawal.</>
                      }
                    </span>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Withdrawal Amount</label>
                <div className="flex items-center mt-1.5 bg-[#F8F7F2] rounded-xl px-4 border border-neutral-200 focus-within:border-[#2D6A4F] focus-within:bg-white transition-all">
                  <span className="text-base font-black text-[#2D6A4F] select-none mr-2">
                    ₹
                  </span>
                  <input
                    className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-base font-black text-neutral-800 py-3"
                    type="number" min="1" step="0.01" required
                    placeholder="Enter amount to withdraw"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isSubmitting}
                    data-testid="withdraw-amount"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !bankStatus?.is_complete}
              className="mfp-btn-primary w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 h-[48px] text-sm font-bold tracking-wide rounded-2xl active:scale-98 transition-all shadow-sm hover:shadow-md"
              data-testid="withdraw-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Submitting Request…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4.5 w-4.5" /> Request Withdrawal
                </>
              )}
            </button>
          </form>

          {/* RIGHT — bank details card */}
          <BankDetailsCard highlightMissing={bankStatus?.missing_fields || []} onSaved={() => reload()} />
        </div>
      )}

      {/* History section heading */}
      <div className="pt-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-4">Withdrawal Request History</h3>
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
    </div>
  );
}
