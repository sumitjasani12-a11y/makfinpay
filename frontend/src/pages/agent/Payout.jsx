import React, { useEffect, useState, useMemo } from "react";
import { api, formatErr } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { Send, Building2, CheckCircle2, Clock, XCircle, RefreshCw, Info, Copy, Check } from "lucide-react";

export default function AgentPayout() {
  const { user, fetchMe } = useAuth();
  const [walletBal, setWalletBal] = useState(user?.wallet_balance || 0);
  const [slabs, setSlabs] = useState([]);
  const [banks, setBanks] = useState([]);
  
  // Form State
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [transferMode, setTransferMode] = useState("IMPS");
  const [amount, setAmount] = useState("");
  
  // Geo-location
  const [latitude, setLatitude] = useState("23.0225");
  const [longitude, setLongitude] = useState("72.5714");

  // Transactions & UI state
  const [transactions, setTransactions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedUtr, setCopiedUtr] = useState(null);
  const [payoutEnabled, setPayoutEnabled] = useState(true);

  // Load initial data (wallet, slabs, banks, history, geo, status)
  const loadData = async () => {
    try {
      if (fetchMe) fetchMe();
      const [walletRes, slabRes, bankRes, txRes, statusRes] = await Promise.all([
        api.get("/wallet/balance").catch(() => api.get("/auth/me")),
        api.get("/payout/slabs").catch(() => ({ data: [] })),
        api.get("/admin/banks").catch(() => ({ data: [] })),
        api.get("/payout/transactions").catch(() => ({ data: [] })),
        api.get("/payout/status").catch(() => ({ data: { payout_enabled: true } }))
      ]);

      const bal = walletRes.data?.balance ?? walletRes.data?.wallet_balance ?? user?.wallet_balance ?? 0;
      setWalletBal(bal);
      setSlabs(slabRes.data || []);
      setBanks((bankRes.data || []).filter((b) => b.payout_enabled && b.active));
      setTransactions(txRes.data || []);
      setPayoutEnabled(statusRes.data?.payout_enabled ?? true);
    } catch (e) {
      console.error("Failed to fetch initial payout data:", e);
    }
  };

  useEffect(() => {
    loadData();

    // Get Browser Geolocation if permitted
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude.toFixed(4));
          setLongitude(pos.coords.longitude.toFixed(4));
        },
        (err) => console.log("Geo error:", err)
      );
    }
  }, []);

  // Calculate dynamic slab charge preview
  const chargeInfo = useMemo(() => {
    const amt = parseFloat(amount);
    if (Number.isNaN(amt) || amt <= 0) return { charge: 0, total: 0, slabText: "" };

    const matched = slabs.find((s) => amt >= parseFloat(s.min_amount) && amt <= parseFloat(s.max_amount));
    let chg = 0;
    let text = "";

    if (matched) {
      if (matched.charge_type === "percent") {
        chg = Math.round((amt * (parseFloat(matched.charge_amount) / 100)) * 100) / 100;
        text = `Slab ₹${matched.min_amount}-${matched.max_amount}: ${matched.charge_amount}% Fee`;
      } else {
        chg = parseFloat(matched.charge_amount);
        text = `Slab ₹${matched.min_amount}-${matched.max_amount}: Flat ₹${chg} Fee`;
      }
    } else {
      // Default fallback
      chg = amt <= 50000 ? 25 : 50;
      text = amt <= 50000 ? "Standard ₹25 Fee (up to ₹50,000)" : "Standard ₹50 Fee (above ₹50,000)";
    }

    return {
      charge: chg,
      total: Math.round((amt + chg) * 100) / 100,
      slabText: text
    };
  }, [amount, slabs]);

  // Handle Form Submit
  const handlePayoutSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);

    if (Number.isNaN(amt) || amt <= 0) return toast.error("Please enter a valid amount");
    if (!beneficiaryName.trim()) return toast.error("Beneficiary Name is required");
    if (!accountNumber.trim()) return toast.error("Account Number is required");
    if (accountNumber.trim() !== confirmAccountNumber.trim()) return toast.error("Account Numbers do not match!");
    if (!ifscCode.trim() || ifscCode.trim().length !== 11) return toast.error("Please enter a valid 11-character IFSC code");
    if (!bankName.trim()) return toast.error("Bank Name is required");
    if (!mobileNumber.trim() || mobileNumber.trim().length < 10) return toast.error("Valid 10-digit mobile number is required");

    const availBal = walletBal || user?.wallet_balance || 0;
    if (chargeInfo.total > availBal) {
      return toast.error(`Insufficient Wallet Balance! Required ₹${chargeInfo.total} (Available: ₹${availBal.toFixed(2)})`);
    }

    setSubmitting(true);
    try {
      const res = await api.post("/service/payout", {
        amount: amt,
        mobileNumber: mobileNumber.trim(),
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        beneficiaryName: beneficiaryName.trim(),
        bankName: bankName.trim(),
        transferMode: transferMode,
        latitude: latitude,
        longitude: longitude
      });

      if (res.data?.ok) {
        if (res.data?.status === "SUCCESS") {
          toast.success(`Payout Successful! UTR: ${res.data.utr || 'Generated'}`);
        } else {
          toast.info("Payout Request Submitted & Processing...");
        }
        // Reset form
        setAmount("");
        setConfirmAccountNumber("");
        loadData();
      } else {
        toast.error(res.data?.message || "Payout Failed");
        loadData();
      }
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Payout initiation failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Check Report Status
  const handleCheckStatus = async (requestId) => {
    try {
      toast.info("Verifying status with bank server...");
      const res = await api.post("/payout/report-status", { requestId });
      if (res.data?.ok) {
        toast.success(res.data.message || `Status: ${res.data.status}`);
        loadData();
      } else {
        toast.error(res.data?.message || "Status check failed");
      }
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Failed to check status");
    }
  };

  const copyUtr = (utr) => {
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    toast.success("UTR Copied!");
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  const displayBalance = walletBal || user?.wallet_balance || 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="Bank Payout / Instant Transfer"
        subtitle="Direct bank account payouts with live dynamic charge calculations & instant UTR reporting."
        action={
          <div className="bg-[#1B4332]/10 border border-[#1B4332]/20 px-4 py-2 rounded-xl text-[#1B4332] font-semibold text-sm">
            Wallet Balance: <span className="text-emerald-700 font-bold">₹{displayBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        }
      />

      {!payoutEnabled ? (
        <div className="mfp-card p-12 text-center space-y-4 max-w-2xl mx-auto border-2 border-rose-500/20 bg-rose-50/20 my-8">
          <div className="p-4 bg-rose-100 text-rose-700 rounded-full w-16 h-16 mx-auto grid place-items-center">
            <XCircle className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-neutral-900">Bank Payout Service Currently Offline</h3>
            <p className="text-sm text-neutral-600">
              Bank payout transfers have been temporarily disabled by the Super Admin for system maintenance or service updates.
            </p>
          </div>
          <p className="text-xs text-rose-700 font-semibold bg-rose-100/80 px-4 py-2 rounded-xl inline-block">
            Please check back later or contact support if you need urgent assistance.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payout Transfer Form */}
        <div className="lg:col-span-1">
          <form onSubmit={handlePayoutSubmit} className="mfp-card p-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-800 border-b border-black/5 pb-3 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#1B4332]" />
              Beneficiary Details
            </h3>

            <div>
              <label className="mfp-label">Beneficiary Name *</label>
              <input
                type="text"
                required
                placeholder="Name as per bank records"
                className="mfp-input"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
              />
            </div>

            <div>
              <label className="mfp-label">Account Number *</label>
              <input
                type="text"
                required
                placeholder="Enter Account Number"
                className="mfp-input"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="mfp-label">Confirm Account Number *</label>
              <input
                type="text"
                required
                placeholder="Re-enter Account Number"
                className="mfp-input"
                value={confirmAccountNumber}
                onChange={(e) => setConfirmAccountNumber(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mfp-label">IFSC Code *</label>
                <input
                  type="text"
                  required
                  maxLength={11}
                  placeholder="SBIN0001234"
                  className="mfp-input uppercase"
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className="mfp-label">Transfer Mode</label>
                <select
                  className="mfp-input"
                  value={transferMode}
                  onChange={(e) => setTransferMode(e.target.value)}
                >
                  <option value="IMPS">IMPS (Instant)</option>
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mfp-label">Bank Name *</label>
              {banks.length > 0 ? (
                <select
                  className="mfp-input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  required
                >
                  <option value="">Select Bank Name</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                  <option value="Other Bank">Other Bank</option>
                </select>
              ) : (
                <input
                  type="text"
                  required
                  placeholder="e.g. State Bank of India"
                  className="mfp-input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              )}
            </div>

            <div>
              <label className="mfp-label">Beneficiary Mobile Number *</label>
              <input
                type="tel"
                maxLength={10}
                required
                placeholder="10-digit Mobile Number"
                className="mfp-input"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
              />
            </div>

            <div className="pt-2 border-t border-black/5">
              <label className="mfp-label text-[#1B4332] font-bold">Payout Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                placeholder="Enter amount to transfer"
                className="mfp-input text-lg font-bold"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {/* Dynamic Charge Calculation Breakdown */}
            {parseFloat(amount) > 0 && (
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-black/5 space-y-1.5 text-xs">
                <div className="flex justify-between text-neutral-600">
                  <span>Transfer Amount:</span>
                  <span className="font-semibold text-neutral-800">₹{parseFloat(amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Slab Charge Fee:</span>
                  <span className="font-semibold text-amber-700">+ ₹{chargeInfo.charge}</span>
                </div>
                <div className="flex justify-between font-bold text-neutral-900 pt-1.5 border-t border-black/10 text-sm">
                  <span>Total Wallet Debit:</span>
                  <span className="text-[#1B4332]">₹{chargeInfo.total.toLocaleString()}</span>
                </div>
                {chargeInfo.slabText && (
                  <p className="text-[11px] text-emerald-700 pt-1 italic font-medium flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" /> {chargeInfo.slabText}
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-[#100%] mfp-btn-primary py-3 font-semibold text-sm flex items-center justify-center gap-2"
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" /> Transfer Now
                </>
              )}
            </button>
          </form>
        </div>

        {/* Transactions History */}
        <div className="lg:col-span-2">
          <div className="mfp-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <h3 className="text-base font-bold text-neutral-800">Payout History & Status</h3>
              <button
                onClick={() => { setRefreshing(true); loadData().finally(() => setRefreshing(false)); }}
                className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 flex items-center gap-1 bg-neutral-100 px-3 py-1.5 rounded-lg"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 font-medium space-y-2">
                <Building2 className="h-8 w-8 text-neutral-300 mx-auto" />
                <p>No payout transactions performed yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-black/5 text-neutral-600 font-semibold uppercase">
                      <th className="p-3">Request ID & Date</th>
                      <th className="p-3">Beneficiary</th>
                      <th className="p-3">Amount & Charge</th>
                      <th className="p-3">UTR / Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="p-3 font-medium">
                          <div className="text-neutral-900 font-mono font-semibold">{tx.request_id}</div>
                          <div className="text-[11px] text-neutral-500">
                            {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-neutral-800">{tx.beneficiary_name}</div>
                          <div className="text-[11px] text-neutral-500">{tx.bank_name} · {tx.account_number}</div>
                          <div className="text-[10px] font-mono text-neutral-400">{tx.ifsc_code}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-neutral-900">₹{tx.amount?.toLocaleString()}</div>
                          <div className="text-[11px] text-amber-700">+ ₹{tx.charge} charge</div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            {tx.status === "SUCCESS" && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[11px] flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> SUCCESS
                              </span>
                            )}
                            {tx.status === "PENDING" && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[11px] flex items-center gap-1">
                                <Clock className="h-3 w-3" /> PENDING
                              </span>
                            )}
                            {tx.status === "FAILED" && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold text-[11px] flex items-center gap-1">
                                <XCircle className="h-3 w-3" /> FAILED
                              </span>
                            )}
                          </div>
                          {tx.utr ? (
                            <button
                              onClick={() => copyUtr(tx.utr)}
                              className="text-[11px] font-mono text-neutral-600 hover:text-neutral-900 flex items-center gap-1 bg-neutral-100 px-2 py-0.5 rounded border border-black/5"
                            >
                              UTR: {tx.utr} {copiedUtr === tx.utr ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </button>
                          ) : (
                            <div className="text-[11px] text-neutral-400 italic">No UTR yet</div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleCheckStatus(tx.request_id)}
                            className="mfp-btn-secondary text-[11px] px-2.5 py-1 whitespace-nowrap"
                          >
                            Check Status
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
