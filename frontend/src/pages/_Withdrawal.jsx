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

  useEffect(() => { reload(); }, [reload]);

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

      <div className="grid lg:grid-cols-2 gap-6 mb-8 items-start">
        {/* LEFT — withdrawal request card */}
        <form onSubmit={submit} className="mfp-card p-6" data-testid="withdraw-form">
          <h3 className="text-base font-medium mb-4">Request Withdrawal</h3>
          <div
            className="mb-4 flex items-center justify-between rounded-lg bg-[#FDFCF8] border border-black/5 px-4 py-3"
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
          <label className="mfp-label">Amount</label>
          <input
            className="mfp-input"
            type="number" min="1" step="0.01" required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isSubmitting}
            data-testid="withdraw-amount"
          />
          <button
            type="submit"
            disabled={isSubmitting || !bankStatus?.is_complete}
            className="mfp-btn-primary mt-4 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            data-testid="withdraw-submit"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? "Submitting…" : "Request Withdrawal"}
          </button>
        </form>

        {/* RIGHT — bank details card */}
        <BankDetailsCard highlightMissing={bankStatus?.missing_fields || []} onSaved={() => reload()} />
      </div>

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
