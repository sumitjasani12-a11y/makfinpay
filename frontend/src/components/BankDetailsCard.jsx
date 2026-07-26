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
    <form onSubmit={save} className="mfp-card p-6" data-testid="bank-details-card">
      <div className="flex items-center gap-2 mb-1">
        <Landmark className="h-4 w-4 text-[#1B4332]" />
        <h3 className="text-base font-medium">Bank Details</h3>
      </div>
      <p className="text-sm text-neutral-500 mb-4">Required to process withdrawals.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          ["Account Holder", "account_holder", "text"],
          ["Account Number", "account_number", "text"],
          ["IFSC", "ifsc", "text"],
          ["Bank Name", "bank_name", "text"],
          ["Phone Number", "phone_number", "tel"],
        ].map(([label, key, type]) => {
          const isMissing = highlightMissing.includes(key);
          if (key === "bank_name") {
            return (
              <div key={key} className={key === "phone_number" ? "sm:col-span-2" : ""}>
                <label className="mfp-label">
                  {label}
                  {isMissing && <span className="ml-2 text-rose-600 text-[10px] font-semibold">MISSING</span>}
                </label>
                <select
                  className={`mfp-input bg-[#FDFCF8] ${isMissing ? "border-rose-400 focus:border-rose-500" : ""}`}
                  required
                  value={b[key]}
                  onChange={(e) => setB({ ...b, [key]: e.target.value })}
                  disabled={saving || !loaded}
                  data-testid={`bank-${key}`}
                >
                  <option value="">Select Bank</option>
                  {payoutBanks.map((bk) => (
                    <option key={bk.id || bk.name} value={bk.name}>
                      {bk.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          }
          return (
            <div key={key} className={key === "phone_number" ? "sm:col-span-2" : ""}>
              <label className="mfp-label">
                {label}
                {isMissing && <span className="ml-2 text-rose-600 text-[10px] font-semibold">MISSING</span>}
              </label>
              <input
                className={`mfp-input ${isMissing ? "border-rose-400 focus:border-rose-500" : ""}`}
                required
                type={type}
                inputMode={key === "phone_number" || key === "account_number" ? "numeric" : undefined}
                maxLength={key === "phone_number" ? 13 : undefined}
                value={b[key]}
                onChange={(e) => setB({ ...b, [key]: e.target.value })}
                disabled={saving || !loaded}
                data-testid={`bank-${key}`}
              />
            </div>
          );
        })}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving || !loaded || !allFilled}
            className="mfp-btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            data-testid="bank-save"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save Bank Details"}
          </button>
        </div>
      </div>
    </form>
  );
}
