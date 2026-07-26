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
      <div className="grid lg:grid-cols-12 gap-6 mb-8 items-stretch">
        
        {/* Active QR panel — 5 cols */}
        <div className="mfp-card p-6 flex flex-col lg:col-span-5" data-testid="active-qr-panel">
          <div className="flex items-center gap-3 border-b border-black/5 pb-4 mb-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-800">Active UPI QR</h3>
              <p className="text-xs text-neutral-400">Scan code to pay via any UPI app</p>
            </div>
          </div>

          {qr ? (
            <div className="flex-1 flex flex-col">
              <div className="relative flex items-center justify-center py-4">
                {/* Glow Backdrop */}
                <div className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-full w-48 h-48 mx-auto animate-pulse"></div>
                <div className="relative rounded-3xl border border-black/5 bg-white p-3 shadow-md max-w-[210px] w-full aspect-square flex items-center justify-center overflow-hidden transition-all hover:scale-105">
                  <img
                    src={fileUrl(qr.image_path)} alt="qr"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>

              <div className="text-center mt-2 space-y-1">
                <span className="font-extrabold text-neutral-800 tracking-tight uppercase block text-sm">
                  {qr.label}
                </span>
                {qr.upi_id && (
                  <span className="text-xs text-neutral-400 font-medium select-all cursor-pointer hover:text-neutral-600 block">
                    UPI ID: <strong className="text-neutral-700">{qr.upi_id}</strong>
                  </span>
                )}
                <div className="inline-flex mt-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-[#E8F5E9] text-[#1B4332] border border-[#C8E6C9] uppercase tracking-wider">
                  Recharge Charges: {commPct}%
                </div>
              </div>

              {/* Receive breakdown */}
              {amountValid ? (
                <div className="mt-6 rounded-2xl bg-emerald-50/20 border border-emerald-100/50 p-4 text-xs space-y-2.5 transition-all" data-testid="net-credit-breakdown">
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
                <div className="mt-6 rounded-2xl bg-rose-50/10 border border-rose-100/30 p-4 text-xs flex items-center justify-between text-neutral-400" data-testid="net-credit-breakdown">
                  <span className="font-extrabold uppercase tracking-wider">Net Credit</span>
                  <span className="font-black" data-testid="net-credit-value">—</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex-1 grid place-items-center py-12">
              <EmptyState>No active QR — please contact admin.</EmptyState>
            </div>
          )}
        </div>

        {/* Form panel — 7 cols */}
        <form onSubmit={submit} className="mfp-card p-6 space-y-4 flex flex-col lg:col-span-7" data-testid="recharge-form">
          <div className="flex items-center gap-3 border-b border-black/5 pb-4 mb-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-800">Submit Recharge Request</h3>
              <p className="text-xs text-neutral-400">Fill in transaction details after payment</p>
            </div>
          </div>

          {/* Amount input */}
          <div className="space-y-1">
            <label className="mfp-label font-medium">Amount</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                <Coins className="h-3.5 w-3.5" />
              </span>
              <input
                className="mfp-input !pl-9 !py-2.5 text-xs bg-neutral-50/50"
                type="number" min="1" max={MAX_RECHARGE_AMOUNT} step="0.01" required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. 5000"
                data-testid="recharge-amount"
              />
            </div>
            {amountTooHigh && (
              <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1" data-testid="recharge-amount-error">
                <ShieldAlert className="h-3 w-3" /> Maximum recharge amount is ₹3,00,000
              </div>
            )}
          </div>

          {/* UTR input */}
          <div className="space-y-1">
            <label className="mfp-label font-medium">UTR / Reference Number</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                <KeyRound className="h-3.5 w-3.5" />
              </span>
              <input
                className="mfp-input !pl-9 !py-2.5 text-xs bg-neutral-50/50"
                type="text" inputMode="numeric" maxLength={12} pattern="\d{12}" required
                placeholder="Enter 12-digit transaction UTR"
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

          {/* Account Last 4 input */}
          <div className="space-y-1">
            <label className="mfp-label font-medium">Last 4 Digits of Card / Account Number</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 pointer-events-none">
                <CreditCard className="h-3.5 w-3.5" />
              </span>
              <input
                className="mfp-input !pl-9 !py-2.5 text-xs bg-neutral-50/50"
                type="text" inputMode="numeric" maxLength={4} required
                placeholder="e.g. 1234"
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

          <div className="pt-1">
            <FileUpload onUploaded={setShot} label="Upload payment screenshot" testid="recharge-screenshot" />
            {shot && (
              <div className="mt-2 p-2 border border-[#E8F5E9] rounded-xl bg-[#E8F5E9]/10 flex items-center justify-between">
                <span className="text-xs text-emerald-700 font-semibold">Screenshot Uploaded Successfully ✓</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-white text-xs font-bold rounded-xl transition-all shadow-md bg-gradient-to-r from-[#9A91FB] to-[#8075f9] hover:from-[#867bf9] hover:to-[#6f63f7] transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              data-testid="recharge-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Submit Request
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Recharge History Table Card */}
      <div className="mfp-card p-6">
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
