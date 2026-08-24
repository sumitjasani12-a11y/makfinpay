import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { PageHeader, StatusBadge } from "@/components/Shared";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Send, Wallet, ShieldAlert, UserCheck, ArrowUpRight, ArrowDownLeft } from "lucide-react";

export default function FundTransfer() {
  const { user, fetchMe } = useAuth();
  const role = user?.role;

  const [recipients, setRecipients] = useState([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [minLimit, setMinLimit] = useState(100);
  const [fundTransferEnabled, setFundTransferEnabled] = useState(true);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState([]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load limits & settings
      const settingsRes = await api.get(`/settings/recharge-limits-public?_t=${Date.now()}`);
      setMinLimit(Number(settingsRes.data?.min_fund_transfer_limit ?? 100));
      setFundTransferEnabled(settingsRes.data?.fund_transfer_enabled ?? true);

      // 2. Load downline recipients
      const recipientsRes = await api.get("/fund-transfer/recipients");
      setRecipients(recipientsRes.data || []);
      if (recipientsRes.data && recipientsRes.data.length > 0) {
        setSelectedRecipientId(recipientsRes.data[0].id);
      }

      // 3. Load user ledger/statement for recent fund transfers
      const statementRes = await api.get("/wallet");
      const ledger = statementRes.data?.ledger || statementRes.data || [];
      const ftHistory = Array.isArray(ledger)
        ? ledger.filter((item) => item.ref_type === "fund_transfer").slice(0, 20)
        : [];
      setHistory(ftHistory);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to load fund transfer data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const numAmount = parseFloat(amount) || 0;
  const isBelowMin = numAmount > 0 && numAmount < minLimit;
  const isExceedingBal = numAmount > (user?.wallet_balance || 0);

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!fundTransferEnabled) {
      return toast.error("Fund Transfer service is currently disabled by Admin.");
    }
    if (!selectedRecipientId) {
      return toast.error("Please select a recipient user.");
    }
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      return toast.error("Please enter a valid transfer amount.");
    }
    if (numAmount < minLimit) {
      return toast.error(`Minimum transfer amount is ${fmtMoney(minLimit)}.`);
    }
    if (isExceedingBal) {
      return toast.error("Insufficient wallet balance.");
    }

    const selectedUser = recipients.find((r) => r.id === selectedRecipientId);
    const confirmMsg = `Are you sure you want to transfer ${fmtMoney(numAmount)} to ${selectedUser?.full_name || "selected user"}?`;
    if (!window.confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      await api.post("/fund-transfer/execute", {
        recipient_id: selectedRecipientId,
        amount: numAmount,
        note: note.trim() || undefined,
      });

      toast.success(`Successfully transferred ${fmtMoney(numAmount)}!`);
      setAmount("");
      setNote("");
      if (fetchMe) fetchMe();
      loadData();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Fund transfer failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const recipientLabel = role === "master_distributor" ? "Distributor" : "Agent";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fund Transfer"
        subtitle={`Transfer wallet balance to your downline ${recipientLabel}s instantly.`}
      />

      {/* Admin Disabled Notice */}
      {!fundTransferEnabled && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-rose-800">
          <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
          <div className="text-sm font-medium">
            Fund Transfer service is currently <strong>DISABLED</strong> by Admin. You cannot initiate new transfers right now.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Transfer Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="mfp-card p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-black/5 pb-4">
              <div>
                <h3 className="text-base font-bold text-neutral-800">Transfer Funds</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Select a downline {recipientLabel.toLowerCase()} and specify the amount.
                </p>
              </div>
              <div className="bg-[#E8F5E9] border border-[#C8E6C9] rounded-xl px-3 py-1.5 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-[#1B4332]" />
                <div className="text-xs font-semibold text-[#1B4332]">
                  Balance: <span className="font-bold">{fmtMoney(user?.wallet_balance || 0)}</span>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-neutral-500">Loading form…</div>
            ) : recipients.length === 0 ? (
              <div className="p-6 bg-neutral-50 rounded-2xl text-center space-y-2">
                <UserCheck className="h-8 w-8 text-neutral-400 mx-auto" />
                <div className="text-sm font-semibold text-neutral-700">No {recipientLabel}s Found</div>
                <div className="text-xs text-neutral-500">
                  You don't have any active downline {recipientLabel.toLowerCase()}s assigned to your account yet.
                </div>
              </div>
            ) : (
              <form onSubmit={handleTransfer} className="space-y-5">
                {/* Recipient Dropdown */}
                <div className="space-y-1.5">
                  <label className="mfp-label font-bold text-neutral-700">
                    Select {recipientLabel} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedRecipientId}
                    onChange={(e) => setSelectedRecipientId(e.target.value)}
                    disabled={!fundTransferEnabled || submitting}
                    className="mfp-input font-medium"
                    data-testid="fund-transfer-recipient-select"
                  >
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name} {r.firm_name ? `(${r.firm_name})` : ""} - {r.phone || r.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount Input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="mfp-label font-bold text-neutral-700">
                      Transfer Amount (₹) <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] font-bold text-[#1B4332] bg-[#E8F5E9] px-2 py-0.5 rounded-md">
                      Min Limit: {fmtMoney(minLimit)}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400 font-bold text-sm pointer-events-none">
                      ₹
                    </span>
                    <input
                      type="number"
                      min={minLimit}
                      step="0.01"
                      required
                      disabled={!fundTransferEnabled || submitting}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={`Min ${minLimit}`}
                      className={`mfp-input !pl-9 ${
                        isBelowMin || isExceedingBal ? "!border-rose-400 focus:!ring-rose-200" : ""
                      }`}
                      data-testid="fund-transfer-amount-input"
                    />
                  </div>
                  {isBelowMin && (
                    <p className="text-xs text-rose-600 font-medium">
                      Amount must be at least {fmtMoney(minLimit)}.
                    </p>
                  )}
                  {isExceedingBal && (
                    <p className="text-xs text-rose-600 font-medium">
                      Amount exceeds available wallet balance ({fmtMoney(user?.wallet_balance || 0)}).
                    </p>
                  )}
                </div>

                {/* Remarks / Note Input */}
                <div className="space-y-1.5">
                  <label className="mfp-label font-bold text-neutral-700">
                    Remarks / Note <span className="text-neutral-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    disabled={!fundTransferEnabled || submitting}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Weekly wallet balance load"
                    className="mfp-input"
                    maxLength={100}
                    data-testid="fund-transfer-note-input"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!fundTransferEnabled || submitting || isBelowMin || isExceedingBal || recipients.length === 0}
                  className="mfp-btn-primary w-full py-3 flex items-center justify-center gap-2 font-bold text-base"
                  data-testid="fund-transfer-submit-btn"
                >
                  <Send className="h-5 w-5" />
                  {submitting ? "Processing Transfer…" : `Transfer ${numAmount > 0 ? fmtMoney(numAmount) : "Funds"}`}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Info & Summary */}
        <div className="space-y-6">
          <div className="mfp-card p-6 space-y-4">
            <h4 className="text-sm font-bold text-neutral-800 border-b border-black/5 pb-2">
              Transfer Guidelines
            </h4>
            <ul className="text-xs text-neutral-600 space-y-2.5 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-[#1B4332] font-bold">•</span>
                <span>
                  <strong>Hierarchy Rules:</strong> {role === "master_distributor" ? "Master Distributors can only transfer funds to their assigned Distributors." : "Distributors can only transfer funds to their assigned Agents."}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1B4332] font-bold">•</span>
                <span>
                  <strong>Minimum Limit:</strong> Admin has enforced a minimum limit of {fmtMoney(minLimit)} per transaction.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1B4332] font-bold">•</span>
                <span>
                  <strong>Instant Credit:</strong> Funds are debited from your wallet and credited to recipient's wallet immediately.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#1B4332] font-bold">•</span>
                <span>
                  <strong>Passbook / Ledger:</strong> Each transfer creates a permanent debit/credit record in statement logs.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Recent Transfer History */}
      <div className="mfp-card p-6 space-y-4">
        <h3 className="text-base font-bold text-neutral-800 border-b border-black/5 pb-3">
          Recent Fund Transfer Transactions
        </h3>
        {history.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-400">
            No fund transfer history recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-600 uppercase font-bold border-b border-black/5">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Balance After</th>
                  <th className="py-3 px-4">Note / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 font-medium">
                {history.map((h) => {
                  const isDebit = h.kind === "debit";
                  return (
                    <tr key={h.id || h._id} className="hover:bg-neutral-50/60">
                      <td className="py-3 px-4 text-neutral-500 whitespace-nowrap">
                        {fmtDate(h.created_at)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            isDebit ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {isDebit ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                          {isDebit ? "DEBIT" : "CREDIT"}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-bold ${isDebit ? "text-rose-600" : "text-emerald-700"}`}>
                        {isDebit ? "-" : "+"}{fmtMoney(h.amount)}
                      </td>
                      <td className="py-3 px-4 font-bold text-neutral-800">
                        {fmtMoney(h.balance_after)}
                      </td>
                      <td className="py-3 px-4 text-neutral-600 max-w-xs truncate">
                        {h.note || "Fund Transfer"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
