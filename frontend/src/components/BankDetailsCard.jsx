import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Landmark } from "lucide-react";

/**
 * Reusable Bank Details form card. Embedded inside the Withdrawal page
 * (agent + distributor) so users manage bank info right where they make
 * withdrawal requests. Emits `onSaved(bank)` after a successful save so
 * the parent can drop its "add bank details first" prompt.
 */
export default function BankDetailsCard({ onSaved, highlightMissing = [] }) {
  const [b, setB] = useState({ account_holder: "", account_number: "", ifsc: "", bank_name: "", phone_number: "" });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [payoutBanks, setPayoutBanks] = useState([]);

  useEffect(() => {
    api.get("/bank").then((r) => {
      if (r.data && r.data.account_holder) setB({
        account_holder: r.data.account_holder || "",
        account_number: r.data.account_number || "",
        ifsc: r.data.ifsc || "",
        bank_name: r.data.bank_name || "",
        phone_number: r.data.phone_number || "",
      });
      setLoaded(true);
    });

    api.get("/billing/payout-banks")
      .then((r) => setPayoutBanks(r.data || []))
      .catch((e) => console.log("Failed to load payout banks:", e));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    // All fields required non-empty (client-side; server also enforces).
    for (const [label, key] of [
      ["Account Holder", "account_holder"],
      ["Account Number", "account_number"],
      ["IFSC", "ifsc"],
      ["Bank Name", "bank_name"],
    ]) {
      if (!(b[key] || "").trim()) return toast.error(`${label} is required`);
    }
    if (!/^\d{10}$/.test(b.phone_number.replace(/\D/g, "").slice(-10))) {
      return toast.error("Phone Number must be exactly 10 digits");
    }
    setSaving(true);
    try {
      const payload = { ...b, phone_number: b.phone_number.replace(/\D/g, "").slice(-10) };
      const { data } = await api.post("/bank", payload);
      toast.success("Bank details saved");
      onSaved?.(data);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    } finally {
      setTimeout(() => setSaving(false), 1000);
    }
  };

  const allFilled = ["account_holder","account_number","ifsc","bank_name","phone_number"]
    .every((k) => (b[k] || "").toString().trim());

  return (
    <form onSubmit={save} className="bg-white border border-black/5 rounded-[28px] p-6 shadow-sm flex flex-col justify-between h-full min-h-[380px]" data-testid="bank-details-card">
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 border-b border-neutral-100 pb-3 mb-5">
            <Landmark className="h-4.5 w-4.5 text-[#2D6A4F]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#2D6A4F]">Bank Details</h3>
          </div>
          <p className="text-xs text-neutral-400 font-semibold mb-6 -mt-3">Required to process settlements and withdrawals.</p>
          
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Row 1 */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Account Holder
                {highlightMissing.includes("account_holder") && <span className="ml-1 text-rose-600 font-black text-sm">*</span>}
              </label>
              <input
                className={`w-full mfp-input mt-1.5 bg-[#F8F7F2] focus:bg-white ${highlightMissing.includes("account_holder") ? "border-rose-400 focus:border-rose-500" : ""}`}
                required
                type="text"
                placeholder="Enter account holder name"
                value={b.account_holder}
                onChange={(e) => setB({ ...b, account_holder: e.target.value })}
                disabled={saving || !loaded}
                data-testid="bank-account_holder"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Account Number
                {highlightMissing.includes("account_number") && <span className="ml-1 text-rose-600 font-black text-sm">*</span>}
              </label>
              <input
                className={`w-full mfp-input mt-1.5 bg-[#F8F7F2] focus:bg-white ${highlightMissing.includes("account_number") ? "border-rose-400 focus:border-rose-500" : ""}`}
                required
                type="text"
                inputMode="numeric"
                placeholder="Enter account number"
                value={b.account_number}
                onChange={(e) => setB({ ...b, account_number: e.target.value })}
                disabled={saving || !loaded}
                data-testid="bank-account_number"
              />
            </div>

            {/* Row 2 */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                IFSC
                {highlightMissing.includes("ifsc") && <span className="ml-1 text-rose-600 font-black text-sm">*</span>}
              </label>
              <input
                className={`w-full mfp-input mt-1.5 bg-[#F8F7F2] focus:bg-white ${highlightMissing.includes("ifsc") ? "border-rose-400 focus:border-rose-500" : ""}`}
                required
                type="text"
                placeholder="Enter bank IFSC code"
                value={b.ifsc}
                onChange={(e) => setB({ ...b, ifsc: e.target.value })}
                disabled={saving || !loaded}
                data-testid="bank-ifsc"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Bank Name
                {highlightMissing.includes("bank_name") && <span className="ml-1 text-rose-600 font-black text-sm">*</span>}
              </label>
              <select
                className={`w-full mfp-input mt-1.5 bg-white border border-neutral-200 focus:border-[#2d6a4f] ${highlightMissing.includes("bank_name") ? "border-rose-400 focus:border-rose-500" : ""}`}
                required
                value={b.bank_name}
                onChange={(e) => setB({ ...b, bank_name: e.target.value })}
                disabled={saving || !loaded}
                data-testid="bank-bank_name"
              >
                <option value="">Select Bank</option>
                {payoutBanks.map((bk) => (
                  <option key={bk.id || bk.name} value={bk.name}>
                    {bk.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Row 3 */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Phone Number
                {highlightMissing.includes("phone_number") && <span className="ml-1 text-rose-600 font-black text-sm">*</span>}
              </label>
              <input
                className={`w-full mfp-input mt-1.5 bg-[#F8F7F2] focus:bg-white ${highlightMissing.includes("phone_number") ? "border-rose-400 focus:border-rose-500" : ""}`}
                required
                type="tel"
                inputMode="numeric"
                maxLength={13}
                placeholder="Enter bank linked phone"
                value={b.phone_number}
                onChange={(e) => setB({ ...b, phone_number: e.target.value })}
                disabled={saving || !loaded}
                data-testid="bank-phone_number"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={saving || !loaded || !allFilled}
                className="mfp-btn-primary flex-1 h-[46px] py-0 text-xs font-bold rounded-2xl inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-98"
                data-testid="bank-save"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? "Saving…" : "Save Bank"}
              </button>
              <button
                type="button"
                onClick={() => setB({ account_holder: "", account_number: "", ifsc: "", bank_name: "", phone_number: "" })}
                disabled={saving || !loaded}
                className="border border-black/15 text-neutral-600 hover:bg-neutral-50 bg-white flex-1 h-[46px] py-0 text-xs font-bold rounded-2xl transition-colors cursor-pointer active:scale-98"
              >
                Clear
              </button>
            </div>

          </div>
        </div>
      </div>
    </form>
  );
}
