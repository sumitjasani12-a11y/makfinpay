import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, DataTable, StatusBadge, EmptyState } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { Loader2, Coins, KeyRound, CreditCard, QrCode, Info, Sparkles, CheckCircle2, History, Check, ShieldAlert } from "lucide-react";

const MAX_RECHARGE_AMOUNT = 300000;

export default function AgentRecharge() {
  const { user } = useAuth();
  const commPct = Number(user?.commission_percent || 0);
  const [qr, setQr] = useState(null);
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [last4, setLast4] = useState("");
  const [shot, setShot] = useState("");
  const [olderQr, setOlderQr] = useState(false);
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("UPI ID copied to clipboard!");
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
        older_qr: olderQr,
      });
      toast.success("Recharge request submitted — pending admin approval");
      setAmount(""); setUtr(""); setLast4(""); setShot(""); setOlderQr(false); reload();
      // brief cool-down to prevent a stray second click landing on the now-empty form
      setTimeout(() => setIsSubmitting(false), 1500);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <PageHeader title="Recharge Wallet" subtitle="Pay via UPI, then submit UTR + screenshot for admin verification." />
      
      {/* Centered layout container with 15% space on sides */}
      <div className="max-w-[1100px] mx-auto px-4 mb-8">
        
        {/* Unified Card Container */}
        <div className="bg-white border border-black/5 rounded-3xl p-6 lg:p-10 shadow-lg shadow-indigo-500/5 grid lg:grid-cols-2 gap-10 items-start">
          
          {/* Left Side: Active UPI QR */}
          <div className="flex flex-col items-center w-full" data-testid="active-qr-panel">
            {/* Header / Section Name */}
            <div className="w-full flex items-center gap-3 border-b border-black/5 pb-4 mb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-800">Active UPI QR</h3>
              </div>
            </div>

            {qr ? (
              <div className="w-full flex flex-col items-center">
                {/* Title above QR */}
                <div className="text-center mt-2 mb-4">
                  <span className="text-sm font-extrabold text-neutral-700 uppercase tracking-wide">
                    Scan QR to Pay
                  </span>
                </div>

                {/* QR Code Container */}
                <div className="relative border border-black/10 rounded-2xl p-4 bg-white max-w-[280px] w-full aspect-square flex items-center justify-center shadow-sm overflow-hidden transition-all hover:scale-102">
                  <img
                    src={fileUrl(qr.image_path)} alt="qr"
                    className="h-full w-full object-contain"
                  />
                </div>

                {/* Checkmark Name Badge */}
                <div className="mt-5 inline-flex items-center gap-1.5 bg-[#E8F5E9] text-[#00966B] border border-[#C8E6C9] py-1.5 px-4.5 rounded-full text-xs font-bold uppercase tracking-wide">
                  <Check className="h-3.5 w-3.5 stroke-[3]" /> {qr.label}
                </div>

                {/* UPI Copy Badge */}
                {qr.upi_id && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(qr.upi_id)}
                      className="inline-flex items-center gap-2 bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB] py-1 px-3.5 rounded-full text-[11px] font-semibold hover:bg-[#D9EBFD] active:scale-95 transition-all"
                    >
                      <span>UPI ID: <strong>{qr.upi_id}</strong></span>
                      <span className="text-[9px] bg-[#1E88E5] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Copy</span>
                    </button>
                  </div>
                )}

                {/* Receive breakdown */}
                {amountValid ? (
                  <div className="w-full mt-6 rounded-2xl bg-emerald-50/20 border border-emerald-100/50 p-4 text-xs space-y-2.5 transition-all animate-fadeIn" data-testid="net-credit-breakdown">
                    <div className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-widest block">You will receive</div>
                    <div className="flex justify-between"><span className="text-neutral-500">Recharge Amount</span><span className="font-bold text-neutral-800">{fmtMoney(amt)}</span></div>
                    <div className="flex justify-between"><span className="text-neutral-500">Commission ({commPct}%)</span><span className="font-bold text-rose-600">- {fmtMoney(commAmt)}</span></div>
                    <div className="border-t border-emerald-100 my-1" />
                    <div className="flex justify-between text-sm">
                      <span className="font-extrabold text-emerald-800">Net Credit</span>
                      <span className="font-black text-emerald-700 text-base" data-testid="net-credit-value">{fmtMoney(netCredit)}</span>
                    </div>
                  </div>
                ) : amt !== 0 ? (
                  <div className="w-full mt-6 rounded-2xl bg-rose-50/10 border border-rose-100/30 p-4 text-xs flex items-center justify-between text-neutral-400" data-testid="net-credit-breakdown">
                    <span className="font-extrabold uppercase tracking-wider">Net Credit</span>
                    <span className="font-black" data-testid="net-credit-value">—</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="w-full py-12 flex justify-center">
                <EmptyState>No active QR — please contact admin.</EmptyState>
              </div>
            )}
          </div>

          {/* Right Side: Request Form */}
          <form onSubmit={submit} className="w-full space-y-4" data-testid="recharge-form">
            {/* Header / Section Name */}
            <div className="w-full flex items-center gap-3 border-b border-black/5 pb-4 mb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-800">Submit recharge request</h3>
              </div>
            </div>
            
            {/* UTR ID */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                UTR ID / TRANSACTION ID
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 font-bold text-xs pointer-events-none">
                  #
                </span>
                <input
                  className="mfp-input !pl-8 !py-2.5 text-xs bg-neutral-50/50"
                  type="text" inputMode="numeric" maxLength={12} pattern="\d{12}" required
                  placeholder="Enter 12-digit UTR ID"
                  value={utr}
                  onChange={handleUtrChange}
                  disabled={isSubmitting}
                  data-testid="recharge-utr"
                />
              </div>
              {utr.length > 0 && !utrValid && (
                <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1" data-testid="recharge-utr-error">
                  <ShieldAlert className="h-3 w-3" /> UTR must be exactly 12 digits
                </div>
              )}
            </div>

            {/* Card Number */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                CARD NUMBER (LAST 4 DIGITS)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                  <CreditCard className="h-3.5 w-3.5" />
                </span>
                <input
                  className="mfp-input !pl-9 !py-2.5 text-xs bg-neutral-50/50"
                  type="text" inputMode="numeric" maxLength={4} required
                  placeholder="Enter Last 4 Digits"
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  disabled={isSubmitting}
                  data-testid="recharge-last4"
                />
              </div>
              {last4 && last4.length !== 4 && (
                <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" /> Please enter exactly 4 digits
                </div>
              )}
            </div>

            {/* Amount Paid */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest">
                  AMOUNT PAID
                </label>
                <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded">
                  LIMIT: ₹100 - {fmtMoney(MAX_RECHARGE_AMOUNT)}
                </span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 font-bold text-xs pointer-events-none">
                  ₹
                </span>
                <input
                  className="mfp-input !pl-8 !py-2.5 text-xs bg-neutral-50/50"
                  type="number" min="1" max={MAX_RECHARGE_AMOUNT} step="0.01" required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="0.00"
                  data-testid="recharge-amount"
                />
              </div>
              {amountTooHigh && (
                <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1" data-testid="recharge-amount-error">
                  <ShieldAlert className="h-3 w-3" /> Maximum recharge amount is ₹3,00,000
                </div>
              )}
            </div>

            {/* Payment Screenshot */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                PAYMENT SCREENSHOT
              </label>
              <FileUpload onUploaded={setShot} label="Click to upload screenshot" testid="recharge-screenshot" />
              {shot && (
                <div className="mt-2 p-2 border border-[#E8F5E9] rounded-xl bg-[#E8F5E9]/10 flex items-center justify-between">
                  <span className="text-xs text-emerald-700 font-semibold">Screenshot Attached ✓</span>
                </div>
              )}
            </div>

            {/* Older QR Checkbox */}
            <div className="flex items-center gap-2 py-1 select-none">
              <input
                type="checkbox"
                id="older-qr-checkbox"
                className="w-4 h-4 text-[#00966B] rounded border-black/10 focus:ring-[#00966B] accent-[#00966B]"
                checked={olderQr}
                onChange={(e) => setOlderQr(e.target.checked)}
              />
              <label htmlFor="older-qr-checkbox" className="text-xs font-semibold text-neutral-600 cursor-pointer">
                Paid to an older QR code?
              </label>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3.5 px-4 flex items-center justify-center gap-2 text-white text-sm font-bold rounded-xl transition-all shadow-md bg-[#00966B] hover:bg-[#007f5a] shadow-[#00966B]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="recharge-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    Submit &rarr;
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Recharge History Table Card */}
      <div className="mfp-card p-6 mt-8">
        <div className="flex items-center gap-3 border-b border-black/5 pb-4 mb-4">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-800">Recharge History</h3>
            <p className="text-xs text-neutral-400">Track and verify your wallet recharge request logs</p>
          </div>
        </div>

        <DataTable
          columns={[
            { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount) },
            { key: "charge", label: "Commission Charge", render: (r) => r.status === "approved" ? fmtMoney(r.commission_amount) : fmtMoney(r.amount * r.commission_percent / 100) },
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
    </div>
  );
}
