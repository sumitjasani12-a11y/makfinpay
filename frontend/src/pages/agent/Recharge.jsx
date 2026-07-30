import React, { useEffect, useMemo, useState, useCallback } from "react";
import { api, formatErr, fmtMoney, fmtDate, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, DataTable, StatusBadge, EmptyState } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { toast } from "sonner";
import { Loader2, Coins, KeyRound, CreditCard, QrCode, Info, Sparkles, CheckCircle2, History, Check, ShieldAlert, FileDown, FileSpreadsheet, Clock, X } from "lucide-react";
import { useWebSocketListener } from "@/lib/ws";

export default function AgentRecharge() {
  const { user } = useAuth();
  const [isT1, setIsT1] = useState(false);
  const commPct = Number(isT1 ? (user?.t1_commission_percent || 0) : (user?.commission_percent || 0));
  const [qr, setQr] = useState(null);
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [last4, setLast4] = useState("");
  const [shot, setShot] = useState("");
  const [olderQr, setOlderQr] = useState(false);
  const [qrList24h, setQrList24h] = useState([]);
  const [selectedQrId, setSelectedQrId] = useState("");
  const [loadingQrs, setLoadingQrs] = useState(false);
  const [qrSelectOpen, setQrSelectOpen] = useState(false);
  const [qrSearch, setQrSearch] = useState("");

  const filteredQrs = useMemo(() => {
    const q = qrSearch.toLowerCase().trim();
    if (!q) return qrList24h;
    return qrList24h.filter(item => 
      (item.label || "").toLowerCase().includes(q) ||
      (item.upi_id || "").toLowerCase().includes(q) ||
      (item.created_at || "").toLowerCase().includes(q)
    );
  }, [qrList24h, qrSearch]);

  const [items, setItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [minLimit, setMinLimit] = useState(100);
  const [maxLimit, setMaxLimit] = useState(300000);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [rechargeEnabled, setRechargeEnabled] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const reload = () => api.get("/agent/recharges").then((r) => setItems(r.data || []));

  useWebSocketListener("recharge_updated", () => {
    reload();
  });

  const fetchActiveQr = useCallback(() => {
    api.get(`/agent/active-qr?is_t1=${isT1}`).then((r) => setQr(r.data && r.data.image_path ? r.data : null));
  }, [isT1]);

  useEffect(() => {
    fetchActiveQr();
  }, [fetchActiveQr]);

  useEffect(() => {
    if (olderQr) {
      setLoadingQrs(true);
      api.get(`/agent/qr-list-24h?is_t1=${isT1}`)
        .then((r) => {
          setQrList24h(r.data || []);
          if (r.data && r.data.length > 0) {
            setSelectedQrId(r.data[0].id);
          }
        })
        .catch((e) => console.log("Failed to load older QRs:", e))
        .finally(() => setLoadingQrs(false));
    } else {
      setSelectedQrId("");
      setQrList24h([]);
    }
  }, [olderQr, isT1]);

  useEffect(() => {
    reload();

    const fetchConfig = () => {
      api.get("/settings/recharge-limits-public")
        .then((r) => {
          setMinLimit(r.data.min_recharge_limit ?? 100);
          setMaxLimit(r.data.max_recharge_limit ?? 300000);
          setQrEnabled(r.data.qr_enabled ?? true);
          setRechargeEnabled(r.data.recharge_enabled ?? true);
        })
        .catch((e) => console.log("Failed to fetch recharge configuration:", e.message));
    };

    fetchConfig();
    const interval = setInterval(fetchConfig, 4000); // Polling every 4 seconds for instant real-time sync!
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    let approvedAmt = 0;
    let approvedCount = 0;
    let rejectedAmt = 0;
    let rejectedCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;
    let commissionAmt = 0;

    items.forEach((item) => {
      if (item.status === "approved") {
        approvedAmt += item.amount || 0;
        approvedCount++;
        commissionAmt += item.commission_amount || 0;
      } else if (item.status === "rejected") {
        rejectedAmt += item.amount || 0;
        rejectedCount++;
      } else if (item.status === "pending") {
        pendingAmt += item.amount || 0;
        pendingCount++;
      }
    });

    return {
      approvedAmt,
      approvedCount,
      rejectedAmt,
      rejectedCount,
      pendingAmt,
      pendingCount,
      commissionAmt
    };
  }, [items]);

  const exportExcel = () => {
    const csvRows = [
      ["Amount", "Commission Charge", "Net Credit", "UTR", "Card / Acc Last 4", "Status", "Rejection Reason", "Created At"]
    ];
    items.forEach((item) => {
      const commCharge = item.status === "approved" ? item.commission_amount : (item.amount * item.commission_percent / 100);
      const netCredit = item.status === "approved" ? item.credit_amount : 0;
      csvRows.push([
        item.amount || 0,
        commCharge || 0,
        netCredit || 0,
        `"${item.utr || ""}"`,
        `"${item.card_last4 ? `XXXX ${item.card_last4}` : "—"}"`,
        `"${item.status}"`,
        `"${item.note || ""}"`,
        `"${fmtDate(item.created_at)}"`
      ].join(","));
    });
    
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Recharge_History_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel/CSV downloaded");
  };

  const exportPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Pop-up blocker is preventing the PDF export. Please allow pop-ups.");

    const rowsHtml = items.map(item => {
      const commCharge = item.status === "approved" ? item.commission_amount : (item.amount * item.commission_percent / 100);
      const netCredit = item.status === "approved" ? item.credit_amount : 0;
      return `
        <tr>
          <td>${fmtMoney(item.amount)}</td>
          <td>${fmtMoney(commCharge)}</td>
          <td>${item.status === "approved" ? fmtMoney(netCredit) : "—"}</td>
          <td>${item.utr || "—"}</td>
          <td>${item.card_last4 ? `XXXX ${item.card_last4}` : "—"}</td>
          <td class="status-${item.status}">${item.status.toUpperCase()}</td>
          <td>${fmtDate(item.created_at)}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Recharge History Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #333; }
            h1 { color: #1b4332; font-size: 20px; margin-bottom: 2px; }
            p { color: #666; font-size: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #1b4332; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .status-approved { color: #2d6a4f; font-weight: bold; }
            .status-pending { color: #b7791f; font-weight: bold; }
            .status-rejected { color: #c53030; font-weight: bold; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>MAK FIN PAY</h1>
          <p>Recharge History Report · Generated on ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Amount</th>
                <th>Commission Charge</th>
                <th>Net Credit</th>
                <th>UTR</th>
                <th>Card / Acc</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const amt = Number(amount) || 0;
  const amountValid = amt >= minLimit && amt <= maxLimit;
  const amountTooLow = amt > 0 && amt < minLimit;
  const amountTooHigh = amt > maxLimit;
  const utrValid = /^\d{12}$/.test(utr);
  const last4Valid = /^\d{4}$/.test(last4);
  const shotValid = Boolean(shot);
  const canSubmit = !isSubmitting && amountValid && utrValid && last4Valid && shotValid && (!olderQr || !!selectedQrId);

  const commAmt = amountValid ? +(amt * commPct / 100).toFixed(2) : 0;
  const netCredit = amountValid ? +(amt - commAmt).toFixed(2) : 0;

  const handleUtrChange = (e) => {
    // strip non-digits, cap at 12 — paste-safe
    const clean = e.target.value.replace(/\D/g, "").slice(0, 12);
    setUtr(clean);
  };

  const fallbackCopy = (text) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";  // avoid scrolling to bottom
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      toast.success("UPI ID copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy UPI ID");
    }
    document.body.removeChild(textarea);
  };

  const copyToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast.success("UPI ID copied to clipboard!"))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
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
        is_t1: isT1,
        selected_qr_code_id: olderQr ? selectedQrId : undefined,
      });
      toast.success("Recharge request submitted — pending admin approval");
      setAmount(""); setUtr(""); setLast4(""); setShot(""); setOlderQr(false); setSelectedQrId(""); reload();
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
      
      <div className="max-w-[1100px] mx-auto px-4 mb-8">
        {rechargeEnabled && (
          <div className="flex justify-center mb-6">
            <div className="bg-neutral-100/80 p-1.5 rounded-2xl border border-neutral-200/50 flex gap-1 shadow-inner">
              <button
                type="button"
                onClick={() => setIsT1(false)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                  !isT1 
                    ? "bg-white text-neutral-800 shadow-sm border border-neutral-200/20" 
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                <Sparkles className="h-4 w-4 text-[#00966B]" />
                Standard (Instant Settlement)
              </button>
              <button
                type="button"
                onClick={() => setIsT1(true)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                  isT1 
                    ? "bg-white text-neutral-800 shadow-sm border border-neutral-200/20" 
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                <Clock className="h-4 w-4 text-blue-600" />
                T+1 (Next Day Settlement)
              </button>
            </div>
          </div>
        )}

        {!rechargeEnabled ? (
          <div className="bg-white border border-black/5 rounded-3xl p-10 lg:p-16 shadow-lg shadow-indigo-500/5 flex flex-col items-center justify-center text-center space-y-5 max-w-[800px] mx-auto">
            <div className="bg-amber-50 text-amber-600 p-5 rounded-full border border-amber-200/50 animate-pulse">
              <ShieldAlert className="h-12 w-12 stroke-1" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-neutral-800">Recharge Service Temporarily Closed</h3>
              <p className="text-sm text-neutral-500 max-w-md leading-relaxed mx-auto">
                Recharging your wallet via UPI is currently paused by the administrator. 
                Please check back later or contact support if you need urgent credits.
              </p>
            </div>
            <div className="text-[10px] text-neutral-400 font-mono bg-neutral-50 px-3 py-1.5 rounded-full border border-neutral-100">
              SERVICE_STATUS: DISRUPTED
            </div>
          </div>
        ) : (
          /* Unified Card Container */
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
                  <div className="relative border border-black/10 rounded-2xl p-4 bg-white max-w-[340px] w-full aspect-square flex items-center justify-center shadow-sm overflow-hidden transition-all hover:scale-102">
                    {qrEnabled ? (
                      <img
                        src={fileUrl(qr.image_path)} alt="qr"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center space-y-4 p-6 bg-rose-50/50 rounded-2xl border border-rose-100 h-full w-full">
                        <div className="bg-rose-100 text-rose-600 p-3.5 rounded-full border border-rose-200">
                          <QrCode className="h-8 w-8 stroke-1 animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-neutral-800 uppercase tracking-wider">Gateway Offline</div>
                          <div className="text-[10px] text-neutral-500 leading-relaxed max-w-[180px]">
                            Live QR scan is currently disabled. Please request admin support.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recharge Charges Badge */}
                  <div className="mt-4 inline-flex text-[10px] px-2.5 py-1 rounded-full font-extrabold bg-[#FFF8E1] text-[#F57F17] border border-[#FFE082] uppercase tracking-wider">
                    Recharge Charges: {commPct}%
                  </div>

                  {/* QR Name Badge (Large, Uniform, with QrCode icon) */}
                  <div className="mt-2 w-full max-w-[280px] flex items-center justify-center gap-2 bg-[#E8F5E9] text-[#00966B] border border-[#C8E6C9] py-2.5 px-4 rounded-xl text-xs font-extrabold uppercase tracking-wide shadow-sm">
                    <QrCode className="h-4 w-4 text-[#00966B]" />
                    <span>{qr.label}</span>
                  </div>

                  {/* UPI Copy Badge (Large, Uniform, Copier Button) */}
                  {qr.upi_id && (
                    <div className="mt-3 w-full max-w-[280px]">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(qr.upi_id)}
                        className="w-full flex items-center justify-between gap-2 bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB] py-2.5 px-4 rounded-xl text-[11px] font-bold shadow-sm hover:bg-[#D9EBFD] active:scale-98 transition-all"
                      >
                        <span className="truncate">UPI ID: <strong>{qr.upi_id}</strong></span>
                        <span className="text-[9px] bg-[#1E88E5] text-white px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider flex-shrink-0">Copy</span>
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
            <div className="space-y-6 w-full">
              {/* Header / Section Name */}
              <div className="flex items-center gap-3 border-b border-black/5 pb-4">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-neutral-800">Submit recharge request</h3>
                </div>
              </div>

              <form onSubmit={submit} className="space-y-4">
                {/* UTR ID / Transaction ID */}
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                    UTR ID / TRANSACTION ID
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400 pointer-events-none text-xs font-semibold">
                      #
                    </span>
                    <input
                      className="mfp-input !pl-8 !py-2.5 text-xs bg-neutral-50/50"
                      type="text" required
                      value={utr}
                      onChange={handleUtrChange}
                      disabled={isSubmitting}
                      placeholder="Enter 12-digit UTR ID"
                      data-testid="recharge-utr"
                    />
                  </div>
                  {utr && !utrValid && (
                    <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> Please enter exactly 12 digits
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
                      className="mfp-input !pl-8 !py-2.5 text-xs bg-neutral-50/50"
                      type="text" required
                      value={last4}
                      onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      disabled={isSubmitting}
                      placeholder="Enter Last 4 Digits"
                      data-testid="recharge-card"
                    />
                  </div>
                  {last4 && !last4Valid && (
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
                      LIMIT: {fmtMoney(minLimit)} - {fmtMoney(maxLimit)}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 font-bold text-xs pointer-events-none">
                      ₹
                    </span>
                    <input
                      className="mfp-input !pl-8 !py-2.5 text-xs bg-neutral-50/50"
                      type="number" min="1" max={maxLimit} step="0.01" required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="0.00"
                      data-testid="recharge-amount"
                    />
                  </div>
                  {amountTooLow && (
                    <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1" data-testid="recharge-amount-error-low">
                      <ShieldAlert className="h-3 w-3" /> Minimum recharge amount is {fmtMoney(minLimit)}
                    </div>
                  )}
                  {amountTooHigh && (
                    <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1" data-testid="recharge-amount-error-high">
                      <ShieldAlert className="h-3 w-3" /> Maximum recharge amount is {fmtMoney(maxLimit)}
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

                {/* Older QR Dropdown List */}
                {olderQr && (
                  <div className="space-y-1.5 p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/50 relative">
                    <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                      Select QR Paid To
                    </label>
                    {loadingQrs ? (
                      <div className="flex items-center gap-2 text-xs text-neutral-500 py-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#00966B]" /> Loading QR codes…
                      </div>
                    ) : qrList24h.length === 0 ? (
                      <div className="text-xs text-neutral-400 font-medium py-1">
                        No QR codes active in the last 24 hours.
                      </div>
                    ) : (
                      <div className="relative">
                        {/* Custom Select Trigger Button */}
                        <button
                          type="button"
                          onClick={() => setQrSelectOpen(!qrSelectOpen)}
                          className="w-full bg-white border border-black/10 focus:border-[#00966B] rounded-lg px-3 py-2 text-xs font-bold text-neutral-700 text-left flex items-center justify-between shadow-sm"
                        >
                          {(() => {
                            const selected = qrList24h.find((q) => q.id === selectedQrId);
                            if (!selected) return <span className="text-neutral-400 font-normal">— Not Selected (Use Active QR) —</span>;
                            return (
                              <span className="truncate">
                                {selected.label} ({selected.upi_id || "No UPI"}) — {fmtDate(selected.created_at)}
                              </span>
                            );
                          })()}
                          <span className="text-neutral-400 shrink-0 ml-1 text-[9px]">▼</span>
                        </button>

                        {/* Dropdown Panel */}
                        {qrSelectOpen && (
                          <>
                            {/* Backdrop to close dropdown on click outside */}
                            <div className="fixed inset-0 z-30" onClick={() => { setQrSelectOpen(false); setQrSearch(""); }} />

                            {/* Dropdown Options List */}
                            <div className="absolute left-0 right-0 mt-1 bg-white border border-neutral-200 shadow-xl rounded-xl z-40 max-h-60 flex flex-col overflow-hidden">
                              {/* Search Box */}
                              <div className="p-2 border-b border-neutral-100">
                                <input
                                  type="text"
                                  value={qrSearch}
                                  onChange={(e) => setQrSearch(e.target.value)}
                                  placeholder="Search by name, UPI or date..."
                                  className="w-full bg-neutral-50 border border-black/5 focus:border-[#00966B] rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  autoFocus
                                />
                              </div>

                              {/* Scrollable list of items */}
                              <div className="overflow-y-auto flex-1">
                                {/* Option 1: Not Selected */}
                                <button
                                  type="button"
                                  onClick={() => { setSelectedQrId(""); setQrSelectOpen(false); setQrSearch(""); }}
                                  className={`w-full text-left px-3 py-2 text-xs border-b border-neutral-50 hover:bg-neutral-50 transition-colors ${!selectedQrId ? "bg-neutral-50/50 text-[#00966B] font-extrabold" : "text-neutral-500 font-semibold"}`}
                                >
                                  — Not Selected (Use Active QR) —
                                </button>

                                {/* Filtered items */}
                                {filteredQrs.length === 0 ? (
                                  <div className="p-3 text-center text-xs text-neutral-400 font-medium">
                                    No matching QR codes found.
                                  </div>
                                ) : (
                                  filteredQrs.map((q) => {
                                    const isSelected = q.id === selectedQrId;
                                    return (
                                      <button
                                        key={q.id}
                                        type="button"
                                        onClick={() => { setSelectedQrId(q.id); setQrSelectOpen(false); setQrSearch(""); }}
                                        className={`w-full text-left px-3 py-2 text-xs flex flex-col gap-0.5 border-b border-neutral-50 hover:bg-[#00966B]/5 transition-colors ${isSelected ? "bg-[#00966B]/5 text-[#00966B] font-extrabold" : "text-neutral-700"}`}
                                      >
                                        <div className="font-bold flex items-center justify-between">
                                          <span>{q.label}</span>
                                          <span className="text-[10px] text-neutral-400 font-semibold font-mono">{q.upi_id || "No UPI"}</span>
                                        </div>
                                        <div className="text-[10px] text-neutral-400 font-semibold mt-0.5">
                                          Created: {fmtDate(q.created_at)}
                                        </div>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
        )}
      </div>

      {/* Metrics Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mt-8">
        {/* Approved */}
        <div className="mfp-card p-5 border-l-4 border-emerald-500 flex items-center justify-between shadow-sm bg-white">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Approved Requests</div>
            <div className="text-xl font-black text-neutral-800">{fmtMoney(stats.approvedAmt)}</div>
            <div className="text-[11px] font-medium text-emerald-600">{stats.approvedCount} approved</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Check className="h-5 w-5" />
          </div>
        </div>

        {/* Pending */}
        <div className="mfp-card p-5 border-l-4 border-amber-500 flex items-center justify-between shadow-sm bg-white">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Pending Requests</div>
            <div className="text-xl font-black text-neutral-800">{fmtMoney(stats.pendingAmt)}</div>
            <div className="text-[11px] font-medium text-amber-600">{stats.pendingCount} pending</div>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        {/* Commission Charge */}
        <div className="mfp-card p-5 border-l-4 border-indigo-500 flex items-center justify-between shadow-sm bg-white">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Commission Charge</div>
            <div className="text-xl font-black text-neutral-800">{fmtMoney(stats.commissionAmt)}</div>
            <div className="text-[11px] font-medium text-indigo-600">Total charge</div>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Coins className="h-5 w-5" />
          </div>
        </div>

        {/* Rejected */}
        <div className="mfp-card p-5 border-l-4 border-rose-500 flex items-center justify-between shadow-sm bg-white">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Rejected Requests</div>
            <div className="text-xl font-black text-neutral-800">{fmtMoney(stats.rejectedAmt)}</div>
            <div className="text-[11px] font-medium text-rose-600">{stats.rejectedCount} rejected</div>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
            <X className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Recharge History Table Card */}
      <div className="mfp-card p-6 mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-black/5 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-800">Recharge History</h3>
              <p className="text-xs text-neutral-400">Track and verify your wallet recharge request logs</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportPdf}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white"
            >
              <FileDown className="h-3.5 w-3.5" /> Export PDF
            </button>
            <button
              onClick={exportExcel}
              className="py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-xl border border-black/10 hover:bg-neutral-50 transition-all text-neutral-700 bg-white"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
            </button>
          </div>
        </div>

        <DataTable
          columns={[
            { key: "created_at", label: "Created", render: (r) => fmtDate(r.created_at) },
            { key: "amount", label: "Amount", render: (r) => (
              <div className="flex items-center gap-1.5 font-bold">
                <span>{fmtMoney(r.amount)}</span>
                {r.is_t1 && (
                  <span className="text-[9px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-1 py-0.5 rounded uppercase tracking-wider">
                    T+1
                  </span>
                )}
              </div>
            ) },
            { key: "charge", label: "Commission Charge", render: (r) => r.status === "approved" ? fmtMoney(r.commission_amount) : fmtMoney(r.amount * r.commission_percent / 100) },
            { key: "credit_amount", label: "Net Credit", render: (r) => r.status === "approved" ? fmtMoney(r.credit_amount) : "—" },
            { key: "utr", label: "UTR" },
            { key: "card_last4", label: "Card / Acc", render: (r) => r.card_last4 ? `XXXX ${r.card_last4}` : "—" },
            { key: "status", label: "Status", render: (r) => (
              <div className="flex flex-col">
                <StatusBadge status={r.status} />
                {r.status === "rejected" && r.note && (
                  <span className="text-[10px] text-rose-500 font-black mt-1 uppercase tracking-wider max-w-[150px] break-words">
                    Reason: {r.note}
                  </span>
                )}
              </div>
            ) },
          ]}
          rows={paginatedItems}
          empty="No recharge requests yet."
          pagination={{
            page,
            pageSize,
            total: items.length,
            onPageChange: setPage,
            onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          }}
        />
      </div>
    </div>
  );
}
