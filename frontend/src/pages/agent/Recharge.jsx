import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, DataTable, StatusBadge, EmptyState } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const MAX_RECHARGE_AMOUNT = 300000;

export default function AgentRecharge() {
  const { user } = useAuth();
  const commPct = Number(user?.commission_percent || 0);
  const [qr, setQr] = useState(null);
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [last4, setLast4] = useState("");
  const [shot, setShot] = useState("");
  const [items, setItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const reload = () => api.get("/agent/recharges").then((r) => setItems(r.data));
  useEffect(() => {
    api.get("/agent/active-qr").then((r) => setQr(r.data && r.data.image_path ? r.data : null));
    reload();
  }, []);

  const amt = Number(amount) || 0;
  const amountValid = amt > 0 && amt <= MAX_RECHARGE_AMOUNT;
  const amountTooHigh = amt > MAX_RECHARGE_AMOUNT;
  const utrValid = /^\d{12}$/.test(utr);
  const last4Valid = /^\d{4}$/.test(last4);
  const shotValid = Boolean(shot);
  const canSubmit = !isSubmitting && amountValid && utrValid && last4Valid && shotValid;

  const commAmt = amountValid ? +(amt * commPct / 100).toFixed(2) : 0;
  const netCredit = amountValid ? +(amt - commAmt).toFixed(2) : 0;

  const handleUtrChange = (e) => {
    // strip non-digits, cap at 12 — paste-safe
    const clean = e.target.value.replace(/\D/g, "").slice(0, 12);
    setUtr(clean);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // primary defense — ignore rapid re-clicks
    if (!amountValid) {
      return toast.error(
        amountTooHigh
          ? "Maximum recharge amount is ₹3,00,000"
          : "Amount must be greater than 0",
      );
    }
    if (!utrValid) return toast.error("UTR must be exactly 12 digits");
    if (!last4Valid) return toast.error("Please enter exactly 4 digits");
    if (!shotValid) return toast.error("Upload payment screenshot");
    setIsSubmitting(true);
    try {
      await api.post("/agent/recharges", {
        amount: parseFloat(amount),
        utr,
        card_last4: last4,
        screenshot_path: shot,
      });
      toast.success("Recharge request submitted — pending admin approval");
      setAmount(""); setUtr(""); setLast4(""); setShot(""); reload();
      // brief cool-down to prevent a stray second click landing on the now-empty form
      setTimeout(() => setIsSubmitting(false), 1500);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Recharge Wallet" subtitle="Pay via UPI, then submit UTR + screenshot for admin verification." />
      <div className="grid lg:grid-cols-2 gap-6 mb-8 items-stretch">
        {/* Active QR panel — compact */}
        <div className="mfp-card p-5 flex flex-col" data-testid="active-qr-panel">
          <h3 className="text-base font-medium mb-3">Active UPI QR</h3>
          {qr ? (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-center">
                <img
                  src={fileUrl(qr.image_path)} alt="qr"
                  className="rounded-xl max-h-52 object-contain bg-[#F4F3ED] p-2 border border-black/5"
                />
              </div>
              <div className="mt-3 text-center">
                <div className="text-sm font-semibold">{qr.label}</div>
                {qr.upi_id && <div className="text-xs text-neutral-500 mt-0.5">UPI ID: {qr.upi_id}</div>}
                <div className="text-xs text-neutral-600 mt-1" data-testid="recharge-charges-line">
                  Recharge Charges: <span className="font-semibold text-[#1B4332]">{commPct}%</span>
                </div>
              </div>

              {amountValid ? (
                <div className="mt-4 rounded-xl bg-[#F4F3ED] border border-black/5 p-4 text-sm" data-testid="net-credit-breakdown">
                  <div className="mfp-overline mb-2">You will receive</div>
                  <div className="flex justify-between py-1"><span className="text-neutral-600">Recharge Amount</span><span className="font-medium">{fmtMoney(amt)}</span></div>
                  <div className="flex justify-between py-1"><span className="text-neutral-600">Commission ({commPct}%)</span><span className="font-medium text-rose-700">- {fmtMoney(commAmt)}</span></div>
                  <div className="border-t border-black/10 my-2" />
                  <div className="flex justify-between py-1 text-base">
                    <span className="font-semibold">Net Credit</span>
                    <span className="font-semibold text-[#1B4332]" data-testid="net-credit-value">{fmtMoney(netCredit)}</span>
                  </div>
                </div>
              ) : amt !== 0 ? (
                <div className="mt-4 rounded-xl bg-[#F4F3ED] border border-black/5 p-4 text-sm flex justify-between" data-testid="net-credit-breakdown">
                  <span className="font-semibold">Net Credit</span>
                  <span className="font-semibold text-neutral-400" data-testid="net-credit-value">—</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex-1 grid place-items-center"><EmptyState>No active QR — please contact admin.</EmptyState></div>
          )}
        </div>

        {/* Form panel */}
        <form onSubmit={submit} className="mfp-card p-5 space-y-3" data-testid="recharge-form">
          <h3 className="text-base font-medium">Submit recharge request</h3>
          <div>
            <label className="mfp-label">Amount</label>
            <input
              className="mfp-input"
              type="number" min="1" max={MAX_RECHARGE_AMOUNT} step="0.01" required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSubmitting}
              data-testid="recharge-amount"
            />
            {amountTooHigh && (
              <div className="mt-1 text-xs text-rose-600" data-testid="recharge-amount-error">
                Maximum recharge amount is ₹3,00,000
              </div>
            )}
          </div>
          <div>
            <label className="mfp-label">UTR / Reference</label>
            <input
              className="mfp-input"
              type="text" inputMode="numeric" maxLength={12} pattern="\d{12}" required
              placeholder="Enter 12-digit UTR"
              value={utr}
              onChange={handleUtrChange}
              disabled={isSubmitting}
              data-testid="recharge-utr"
            />
            {utr.length > 0 && !utrValid && (
              <div className="mt-1 text-xs text-rose-600" data-testid="recharge-utr-error">
                UTR must be exactly 12 digits
              </div>
            )}
          </div>
          <div>
            <label className="mfp-label">Last 4 Digits of Card / Account Number</label>
            <input
              className="mfp-input"
              type="text" inputMode="numeric" maxLength={4} required
              placeholder="Enter last 4 digits"
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              disabled={isSubmitting}
              data-testid="recharge-last4"
            />
            {last4 && last4.length !== 4 && (
              <div className="mt-1 text-xs text-rose-600">Please enter exactly 4 digits</div>
            )}
          </div>
          <FileUpload onUploaded={setShot} label="Upload payment screenshot" testid="recharge-screenshot" />
          {shot && <div className="text-xs text-emerald-700">Screenshot attached ✓</div>}
          <button
            type="submit"
            disabled={!canSubmit}
            className="mfp-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            data-testid="recharge-submit"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? "Submitting…" : "Submit for approval"}
          </button>
        </form>
      </div>

      <DataTable
        columns={[
          { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount) },
          { key: "credit_amount", label: "Net Credit", render: (r) => r.status === "approved" ? fmtMoney(r.credit_amount) : "—" },
          { key: "utr", label: "UTR" },
          { key: "card_last4", label: "Card / Acc", render: (r) => r.card_last4 ? `XXXX ${r.card_last4}` : "—" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
        ]}
        rows={items}
        empty="No recharge requests yet."
      />
    </div>
  );
}
