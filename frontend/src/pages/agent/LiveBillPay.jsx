import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { Loader2, CreditCard, History, Send, Receipt } from "lucide-react";

export default function LiveBillPay() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [billers, setBillers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingOps, setLoadingOps] = useState(false);
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [loadingPay, setLoadingPay] = useState(false);

  // Form states
  const [selectedCat, setSelectedCat] = useState("");
  const [selectedOp, setSelectedOp] = useState("");
  const [mobileNumber, setMobileNumber] = useState(user?.phone || "");
  const [paramValues, setParamValues] = useState({});

  // Fetched bill details
  const [fetchedBill, setFetchedBill] = useState(null);

  // Pagination states for history
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchCategories = async () => {
    setLoadingCats(true);
    try {
      const res = await api.get("/agent/live-billpay/categories");
      setCategories(res.data?.data || []);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to load categories");
    } finally {
      setLoadingCats(false);
    }
  };

  const fetchBillers = async (catId) => {
    setLoadingOps(true);
    try {
      const res = await api.get(`/agent/live-billpay/operators?category_id=${catId}`);
      setBillers(res.data?.data || []);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to load billers");
    } finally {
      setLoadingOps(false);
    }
  };

  const reloadHistory = async () => {
    try {
      const res = await api.get("/agent/live-billpay/transactions");
      setTransactions(res.data || []);
    } catch (e) {
      console.log("Failed to load transaction history:", e.message);
    }
  };

  useEffect(() => {
    fetchCategories();
    reloadHistory();
  }, []);

  const handleCategoryChange = (catId) => {
    setSelectedCat(catId);
    setSelectedOp("");
    setBillers([]);
    setFetchedBill(null);
    setParamValues({});
    if (catId) {
      fetchBillers(catId);
    }
  };

  const handleOperatorChange = (opId) => {
    setSelectedOp(opId);
    setFetchedBill(null);
    setParamValues({});
  };

  const activeOp = billers.find(o => String(o.biller_id) === String(selectedOp));

  const getParamsList = (op) => {
    let list = [];
    const raw = op?.metadata?.billerInputParams?.paramInfo;
    if (!raw) {
      const fallback = op?.metadata?.customerParams;
      if (Array.isArray(fallback)) list = fallback;
      else if (fallback && typeof fallback === "object") list = [fallback];
      else list = [{ paramName: "Consumer Number", dataType: "ALPHANUMERIC", isOptional: false }];
    } else if (Array.isArray(raw)) {
      list = raw;
    } else if (typeof raw === "object") {
      list = [raw];
    } else {
      list = [{ paramName: "Consumer Number", dataType: "ALPHANUMERIC", isOptional: false }];
    }

    // Normalize isOptional string ('true' / 'false') to real boolean
    return list.map(p => {
      let isOpt = false;
      if (p.isOptional === true || p.isOptional === "true") {
        isOpt = true;
      }
      return { ...p, isOptional: isOpt };
    });
  };

  const paramsList = React.useMemo(() => getParamsList(activeOp), [activeOp]);

  const fetchBill = async (e) => {
    if (e) e.preventDefault();
    if (!selectedOp || !mobileNumber) {
      return toast.error("Please fill all required fields");
    }

    // Verify required parameters
    for (const p of paramsList) {
      if (!p.isOptional && !paramValues[p.paramName]) {
        return toast.error(`Please enter ${p.paramName}`);
      }
    }

    setLoadingFetch(true);
    setFetchedBill(null);
    try {
      const customerParams = paramsList.map(p => ({
        name: p.paramName,
        value: paramValues[p.paramName] || ""
      }));

      const payload = {
        billerId: selectedOp,
        mobile: mobileNumber,
        customerParams: customerParams
      };

      if (res.data?.status === "success" && res.data?.data?.billerResponse) {
        setFetchedBill(res.data.data);
        toast.success("Bill details fetched successfully!");
      } else {
        toast.error(res.data?.message || "Failed to fetch bill. Please verify details.");
      }
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Error fetching bill details");
    } finally {
      setLoadingFetch(false);
    }
  };

  const payBill = async () => {
    if (!fetchedBill) return;
    setLoadingPay(true);
    try {
      const customerParams = paramsList.map(p => ({
        name: p.paramName,
        value: paramValues[p.paramName] || ""
      }));

      const payload = {
        billerId: selectedOp,
        amount: parseFloat(fetchedBill.billerResponse.amount),
        mobile: mobileNumber,
        customerParams: customerParams,
        billerResponseInfo: fetchedBill.billFetchResponse?.billerResponse || fetchedBill.billerResponse
      };

      const res = await api.post("/agent/live-billpay/pay", payload);
      if (res.data?.status === "success") {
        toast.success(`Bill payment of ₹${payload.amount} successful!`);
        setFetchedBill(null);
        setParamValues({});
        reloadHistory();
      } else if (res.data?.status === "pending") {
        toast.warning("Payment submitted. Current status: PENDING.");
        setFetchedBill(null);
        setParamValues({});
        reloadHistory();
      } else {
        toast.error(res.data?.message || "Payment rejected by operator.");
      }
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Error processing bill payment");
    } finally {
      setLoadingPay(false);
    }
  };

  const paginatedTransactions = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return transactions.slice(start, start + pageSize);
  }, [transactions, page, pageSize]);

  return (
    <div className="w-full">
      <PageHeader 
        title="Live Utility Bill Pay" 
        subtitle="Fetch and pay electricity, gas, water bills instantly in real time." 
      />

      <div className="max-w-[1100px] mx-auto px-4 mb-8">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          
          {/* Left Card: Input Form */}
          <div className="bg-white border border-black/5 rounded-3xl p-6 lg:p-8 shadow-lg shadow-indigo-500/5">
            <h3 className="text-sm font-black text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3 mb-5">
              <CreditCard className="h-4 w-4 text-[#00966B]" /> Bill Details
            </h3>

            <form onSubmit={fetchBill} className="space-y-4">
              {/* Category */}
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                  Select Service Type
                </label>
                <div className="relative">
                  {loadingCats && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                    </span>
                  )}
                  <select
                    className="mfp-input text-xs bg-neutral-50/50"
                    value={selectedCat}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    required
                  >
                    <option value="">Choose category...</option>
                    {categories.map((c) => (
                      <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Operator */}
              {selectedCat && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                    Select Operator
                  </label>
                  <div className="relative">
                    {loadingOps && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                      </span>
                    )}
                    <select
                      className="mfp-input text-xs bg-neutral-50/50"
                      value={selectedOp}
                      onChange={(e) => handleOperatorChange(e.target.value)}
                      required
                    >
                      <option value="">Choose operator...</option>
                      {billers.map((o) => (
                        <option key={o.biller_id} value={o.biller_id}>{o.biller_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Customer Mobile Number & Dynamic Biller Parameters */}
              {selectedOp && (
                <div className="space-y-4 pt-1 animate-fadeIn">
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                      Customer Mobile Number
                    </label>
                    <input
                      className="mfp-input text-xs bg-neutral-50/50"
                      type="text"
                      required
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="e.g. 9876543210"
                    />
                  </div>

                  {/* Render Dynamic Metadata Fields */}
                  {paramsList.map((p) => (
                    <div className="space-y-1" key={p.paramName}>
                      <label className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest block">
                        {p.paramName} {p.isOptional ? "(Optional)" : ""}
                      </label>
                      <input
                        className="mfp-input text-xs bg-neutral-50/50"
                        type={p.dataType === "NUMERIC" ? "number" : "text"}
                        required={!p.isOptional}
                        value={paramValues[p.paramName] || ""}
                        onChange={(e) => setParamValues({
                          ...paramValues,
                          [p.paramName]: e.target.value
                        })}
                        placeholder={`Enter ${p.paramName.toLowerCase()}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {selectedOp && (
                <button
                  type="submit"
                  disabled={loadingFetch || !mobileNumber}
                  className="w-full mt-4 py-3 px-4 flex items-center justify-center gap-2 text-white text-xs font-bold rounded-xl transition-all shadow-md bg-[#00966B] hover:bg-[#007f5a] shadow-[#00966B]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingFetch ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Fetching Bill…
                    </>
                  ) : (
                    <>
                      <Receipt className="h-4 w-4" /> Fetch Bill Details
                    </>
                  )}
                </button>
              )}
            </form>
          </div>

          {/* Right Card: Bill Receipt / Invoice Preview */}
          <div className="w-full">
            {fetchedBill ? (
              <div className="bg-[#1E293B] text-white rounded-3xl p-6 lg:p-8 shadow-xl shadow-slate-900/10 flex flex-col justify-between min-h-[360px] relative overflow-hidden animate-fadeIn">
                {/* Decorative background gradients */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>

                <div className="space-y-5">
                  <div className="flex justify-between items-start border-b border-white/10 pb-4">
                    <div>
                      <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 tracking-wider">
                        Bill Fetched
                      </span>
                      <h4 className="text-sm font-bold mt-1 text-white/90">
                        {activeOp?.biller_name || "Utility Provider"}
                      </h4>
                    </div>
                    <Receipt className="h-8 w-8 text-white/20" />
                  </div>

                  <div className="space-y-3 text-xs text-white/70">
                    <div className="flex justify-between">
                      <span>Customer Name:</span>
                      <strong className="text-white font-semibold">{fetchedBill.billerResponse.customerName || "N/A"}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Biller ID:</span>
                      <strong className="text-white font-semibold">{selectedOp}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Due Date:</span>
                      <strong className="text-rose-400 font-bold">{fetchedBill.billerResponse.dueDate || "N/A"}</strong>
                    </div>
                  </div>

                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5 text-center space-y-1">
                    <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest block">Total Payable Amount</span>
                    <span className="text-2xl font-black text-white tabular-nums">
                      {fmtMoney(parseFloat(fetchedBill.billerResponse.amount))}
                    </span>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={payBill}
                    disabled={loadingPay}
                    className="w-full py-3.5 px-4 flex items-center justify-center gap-2 text-neutral-900 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg bg-white hover:bg-neutral-50 shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingPay ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Processing Payment…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" /> Pay & Settle Now
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-neutral-200 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4 min-h-[380px] bg-neutral-50/50">
                <div className="p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm text-neutral-400">
                  <Receipt className="h-8 w-8 stroke-1" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold text-neutral-600 uppercase tracking-wider">No Active Invoice</h4>
                  <p className="text-xs text-neutral-400 max-w-[260px] mx-auto leading-relaxed">
                    Select your utility provider and click \"Fetch Bill Details\" to load your invoice statement.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Live Bill Payments History logs */}
        <div className="mfp-card p-6 mt-10">
          <div className="flex items-center gap-3 border-b border-black/5 pb-4 mb-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-800">Live Bill Payments History</h3>
              <p className="text-xs text-neutral-400">Review real-time payment log entries</p>
            </div>
          </div>

          <DataTable
            columns={[
              { key: "amount", label: "Amount Paid", render: (r) => fmtMoney(r.amount) },
              { key: "operator", label: "Biller ID" },
              { key: "customer_phone", label: "Mobile Number" },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { key: "created_at", label: "Date / Time", render: (r) => fmtDate(r.created_at) }
            ]}
            rows={paginatedTransactions}
            empty="No live bill payments found."
            pagination={{
              page,
              pageSize,
              total: transactions.length,
              onPageChange: setPage,
              onPageSizeChange: (n) => { setPageSize(n); setPage(1); }
            }}
          />
        </div>

      </div>
    </div>
  );
}
