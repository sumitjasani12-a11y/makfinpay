import React, { useEffect, useState, useMemo } from "react";
import { api, formatErr, fmtMoney } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { CreditCard, Check, ChevronsUpDown, Wallet, Search, Loader2, AlertCircle } from "lucide-react";

function BankCombobox({ value, onChange, options = [] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => options.filter((b) => b.toLowerCase().includes(search.toLowerCase())),
    [search, options]
  );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mfp-input flex items-center justify-between text-left w-full"
        data-testid="bill-operator-trigger"
      >
        <span className={value ? "text-neutral-800" : "text-neutral-400"}>
          {value || "Select Bank / Operator"}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-neutral-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-2 w-full bg-white border border-black/10 rounded-xl shadow-xl overflow-hidden" data-testid="bill-operator-popover">
            <div className="px-3 py-2 border-b border-black/5 flex items-center gap-2">
              <Search className="h-4 w-4 text-neutral-400" />
              <input
                autoFocus
                placeholder="Search bank…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent outline-none text-sm w-full"
                data-testid="bill-operator-search"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-neutral-500">No banks match "{search}"</div>
              ) : filtered.map((b) => (
                <button
                  type="button"
                  key={b}
                  onClick={() => { onChange(b); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-[#1B4332]/5 ${b === value ? "bg-[#1B4332]/10 text-[#1B4332] font-medium" : "text-neutral-700"}`}
                  data-testid={`bill-operator-opt-${b}`}
                >
                  {b}
                  {b === value && <Check className="h-4 w-4 text-[#1B4332]" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AgentBillPay() {
  const [wallet, setWallet] = useState({ balance: 0 });
  const [f, setF] = useState({ customer_name: "", card_last4: "", operator: "", customer_phone: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [slabs, setSlabs] = useState([]);
  const [banks, setBanks] = useState([]);
  const [billPayEnabled, setBillPayEnabled] = useState(true);

  useEffect(() => {
    api.get("/wallet").then((r) => setWallet(r.data));
    api.get("/billing/service-slabs").then((r) => setSlabs(r.data)).catch((e) => console.log("Failed to fetch slabs:", e.message));
    api.get(`/billing/banks?t=${Date.now()}`).then((r) => setBanks(r.data.map(b => b.name))).catch((e) => console.log("Failed to fetch banks:", e.message));

    const fetchConfig = () => {
      api.get("/settings/recharge-limits-public")
        .then((r) => {
          setBillPayEnabled(r.data.bill_pay_enabled ?? true);
        })
        .catch((e) => console.log("Failed to fetch settings config:", e.message));
    };

    fetchConfig();
    const interval = setInterval(fetchConfig, 30000);
    return () => clearInterval(interval);
  }, []);

  const billAmt = Number(f.amount) || 0;

  const maxLimit = useMemo(() => {
    if (slabs.length === 0) return 100000;
    return Math.max(...slabs.map((s) => s.max_amount));
  }, [slabs]);

  const exceedsLimit = billAmt > maxLimit;

  const charge = useMemo(() => {
    if (billAmt <= 0) return 0;
    const match = slabs.find((s) => billAmt >= s.min_amount && billAmt <= s.max_amount);
    if (match) {
      return match.charge_type === "percent"
        ? +(billAmt * match.charge_amount / 100).toFixed(2)
        : match.charge_amount;
    }
    return billAmt <= 50000 ? 15 : 25;
  }, [billAmt, slabs]);

  const total = billAmt > 0 && !exceedsLimit ? billAmt + charge : 0;
  const hasAmount = billAmt > 0 && !exceedsLimit;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!f.operator) return toast.error("Select a Bank / Operator");
    if (f.card_last4.length !== 4) return toast.error("Card last 4 digits required");
    if (!billAmt) return toast.error("Enter bill amount");
    if (exceedsLimit) return toast.error(`Maximum bill amount allowed is ₹${maxLimit.toLocaleString("en-IN")}`);
    if (wallet.balance < total) return toast.error("Insufficient wallet balance");
    setBusy(true);
    try {
      await api.post("/agent/bill-payments", { ...f, amount: billAmt });
      toast.success("Bill payment submitted — under admin review");
      setF({ customer_name: "", card_last4: "", operator: "", customer_phone: "", amount: "" });
      const w = await api.get("/wallet"); setWallet(w.data);
      window.dispatchEvent(new CustomEvent("ws:wallet_update"));
      setTimeout(() => setBusy(false), 1500);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Credit Card Bill Payment" subtitle="A small service charge is added on top of every bill payment." />

      {!billPayEnabled ? (
        <div className="bg-white border border-black/5 rounded-3xl p-10 lg:p-16 shadow-lg shadow-indigo-500/5 flex flex-col items-center justify-center text-center space-y-5 max-w-[800px] mx-auto animate-fadeIn">
          <div className="bg-rose-50 text-rose-600 p-5 rounded-full border border-rose-200/50 animate-pulse">
            <AlertCircle className="h-12 w-12 stroke-1" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-neutral-800">Bill Payment Service Paused</h3>
            <p className="text-sm text-neutral-500 max-w-md leading-relaxed mx-auto">
              Credit Card Bill Payment service is temporarily disabled by the administrator.
              Please check back later or contact support if you have any queries.
            </p>
          </div>
          <div className="text-[10px] text-neutral-400 font-mono bg-neutral-50 px-3 py-1.5 rounded-full border border-neutral-100">
            SERVICE_STATUS: PAUSED
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Form */}
          <div className="lg:col-span-8 mfp-card p-6">
            <form onSubmit={submit} className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <label className="mfp-label">Customer Owner Name</label>
                <input className="mfp-input bg-neutral-50/50" required value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} disabled={busy} data-testid="bill-name" />
              </div>
              <div>
                <label className="mfp-label">Card Last 4 Digits</label>
                <input className="mfp-input bg-neutral-50/50" required maxLength={4} value={f.card_last4} onChange={(e) => setF({ ...f, card_last4: e.target.value.replace(/\D/g, "") })} disabled={busy} data-testid="bill-card" />
              </div>
              <div>
                <label className="mfp-label">Bank / Operator</label>
                <BankCombobox value={f.operator} onChange={(v) => setF({ ...f, operator: v })} options={banks} />
              </div>
              <div>
                <label className="mfp-label">Customer Phone</label>
                <input className="mfp-input bg-neutral-50/50" required value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} disabled={busy} data-testid="bill-phone" />
              </div>
              <div>
                <label className="mfp-label">Bill Amount</label>
                <input
                  className={`mfp-input bg-neutral-50/50 ${exceedsLimit ? "border-rose-400 focus:border-rose-500" : ""}`}
                  type="number" min="1" max={maxLimit} step="0.01" required
                  value={f.amount}
                  onChange={(e) => setF({ ...f, amount: e.target.value })}
                  disabled={busy}
                  data-testid="bill-amount"
                />
                {exceedsLimit && (
                  <div className="mt-1 text-xs text-rose-600" data-testid="bill-amount-error">
                    Maximum bill amount allowed is ₹{maxLimit.toLocaleString("en-IN")}
                  </div>
                )}
              </div>
              <div className="flex items-end pb-0.5 w-full">
                <div className="flex items-center gap-3 w-full">
                  <button
                    disabled={busy || exceedsLimit}
                    className="mfp-btn-secondary flex-1 w-1/2 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 flex items-center justify-center gap-2 h-[38px] rounded-xl text-xs font-bold"
                    data-testid="bill-submit"
                  >
                    {busy
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                      : exceedsLimit
                        ? <><CreditCard className="h-4 w-4" /> Limit Exceeded</>
                        : hasAmount
                          ? <><CreditCard className="h-4 w-4" /> Pay {fmtMoney(total)}</>
                          : <><CreditCard className="h-4 w-4" /> Pay Bill</>
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => setF({ customer_name: "", card_last4: "", operator: "", customer_phone: "", amount: "" })}
                    disabled={busy}
                    className="flex-1 w-1/2 border border-black/10 hover:bg-neutral-50 text-neutral-600 h-[38px] rounded-xl text-xs font-bold transition-all flex items-center justify-center"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Wallet & Charges panel */}
          <aside className="lg:col-span-4 mfp-card p-6 bg-white">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
              <Wallet className="h-4 w-4" /> Available Wallet
            </div>
            <div className="mt-3 text-4xl font-medium tracking-tight text-[#1B4332]" data-testid="wallet-balance-billpay">
              {fmtMoney(wallet.balance)}
            </div>
            <div className="text-xs text-neutral-500 mt-1">Live balance — updates after each payment</div>

            <div className="my-6 border-t border-black/5" />

            <div className="mfp-overline">Service Charges</div>
            <div className="mt-3 rounded-xl border border-black/5 bg-[#F4F3ED] overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {slabs.length === 0 ? (
                    <>
                      <tr className="border-b border-black/5">
                        <td className="px-4 py-2.5 text-neutral-700">₹0 – ₹50,000</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#1B4332]">₹15</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2.5 text-neutral-700">₹50,001 – ₹1,00,000</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#1B4332]">₹25</td>
                      </tr>
                    </>
                  ) : (
                    slabs.map((s, idx) => (
                      <tr key={s.id} className={idx < slabs.length - 1 ? "border-b border-black/5" : ""}>
                        <td className="px-4 py-2.5 text-neutral-700">
                          ₹{parseFloat(s.min_amount).toLocaleString("en-IN")} – ₹{parseFloat(s.max_amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#1B4332]">
                          {s.charge_type === "percent" ? `${s.charge_amount}%` : `₹${parseFloat(s.charge_amount).toFixed(2)}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {hasAmount && (
              <div className="mt-6 rounded-xl bg-[#1B4332] text-white p-5" data-testid="bill-breakdown">
                <div className="text-xs uppercase tracking-[0.2em] text-[#E8E5D7]">Breakdown</div>
                <div className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-[#E8E5D7]">Bill Amount</span><span className="font-medium text-white">{fmtMoney(billAmt)}</span></div>
                  <div className="flex justify-between"><span className="text-[#E8E5D7]">Service Charge</span><span className="font-medium text-white">{fmtMoney(charge)}</span></div>
                  <div className="border-t border-white/15 my-2" />
                  <div className="flex justify-between text-base">
                    <span className="text-white">Total Payable</span>
                    <span className="font-semibold text-[#FFE4C7]" data-testid="bill-total">{fmtMoney(total)}</span>
                  </div>
                </div>
                {wallet.balance < total && (
                  <div className="mt-3 text-xs text-rose-200 bg-rose-900/30 rounded-lg px-3 py-2">
                    Wallet short by {fmtMoney(total - wallet.balance)}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
