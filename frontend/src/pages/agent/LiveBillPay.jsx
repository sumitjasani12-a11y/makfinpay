import React, { useEffect, useState } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { 
  Loader2, CreditCard, History, Send, Receipt,
  Lightbulb, Smartphone, Car, Flame, Wifi, Tv,
  ShieldCheck, GraduationCap, Landmark, Droplet,
  Home, UserCheck, FileText, Zap, PlaySquare,
  Building, ChevronLeft
} from "lucide-react";

const getCategoryIcon = (catId) => {
  const map = {
    "1": UserCheck,      // Agent Collection
    "2": Wifi,           // Broadband Postpaid
    "3": Tv,             // Cable TV
    "4": Landmark,       // Clubs and Associations
    "5": CreditCard,     // Credit Card
    "6": Tv,             // DTH
    "7": FileText,       // eChallan
    "8": GraduationCap,  // Education Fees
    "9": Lightbulb,      // Electricity
    "10": Zap,           // EV Recharge
    "11": Car,           // Fastag
    "12": CreditCard,    // Fleet Card Recharge
    "13": Flame,         // Gas
    "14": Home,          // Housing Society
    "15": ShieldCheck,   // Insurance
    "16": Smartphone,    // Landline Postpaid
    "17": Landmark,      // Loan Repayment
    "18": Flame,         // LPG Gas
    "19": Smartphone,    // Mobile Postpaid
    "20": Smartphone,    // Mobile Prepaid
    "21": Landmark,      // Municipal Services
    "22": Landmark,      // Municipal Taxes
    "23": Landmark,      // National Pension System
    "24": CreditCard,    // NCMC Recharge
    "25": Zap,           // Prepaid Meter
    "26": Home,          // Rental
    "27": PlaySquare,    // Subscription
    "28": Droplet,       // Water
  };
  return map[String(catId)] || Receipt;
};

const getCategoryDesc = (catId, catName) => {
  const map = {
    "1": "Pay agent collections",
    "2": "Pay broadband bills instantly",
    "3": "Pay cable TV operator bills",
    "4": "Pay club & association dues",
    "5": "Pay credit card bills instantly",
    "6": "Recharge DTH connections",
    "7": "Pay traffic challans online",
    "8": "Pay school and college fees",
    "9": "Pay state power & electricity bills",
    "10": "Recharge EV charging stations",
    "11": "Recharge FASTag accounts instantly",
    "12": "Recharge fleet cards",
    "13": "Pay piped gas utility bills",
    "14": "Pay housing society maintenance",
    "15": "Pay insurance policy premiums",
    "16": "Pay landline bills instantly",
    "17": "Repay active loan EMIs",
    "18": "Book or pay for LPG cylinders",
    "19": "Pay postpaid mobile bills",
    "20": "Recharge prepaid mobile plans",
    "21": "Pay municipal utility charges",
    "22": "Pay municipal property taxes",
    "23": "Contribute to NPS account",
    "24": "Recharge NCMC travel cards",
    "25": "Recharge prepaid utility meters",
    "26": "Pay monthly rental charges",
    "27": "Pay subscriptions & recurring fees",
    "28": "Pay municipal water bills",
  };
  return map[String(catId)] || `Pay ${catName} bills`;
};

const getCategoryColor = (catId) => {
  const map = {
    "1": "bg-indigo-100 text-indigo-600 border-indigo-200/50",
    "2": "bg-sky-100 text-sky-600 border-sky-200/50",
    "3": "bg-pink-100 text-pink-600 border-pink-200/50",
    "4": "bg-amber-100 text-amber-600 border-amber-200/50",
    "5": "bg-rose-100 text-rose-600 border-rose-200/50",
    "6": "bg-orange-100 text-orange-600 border-orange-200/50",
    "7": "bg-red-100 text-red-600 border-red-200/50",
    "8": "bg-teal-100 text-teal-600 border-teal-200/50",
    "9": "bg-yellow-100 text-yellow-600 border-yellow-200/50",
    "10": "bg-emerald-100 text-emerald-600 border-emerald-200/50",
    "11": "bg-blue-100 text-blue-600 border-blue-200/50",
    "12": "bg-indigo-100 text-indigo-600 border-indigo-200/50",
    "13": "bg-orange-100 text-orange-600 border-orange-200/50",
    "14": "bg-purple-100 text-purple-600 border-purple-200/50",
    "15": "bg-cyan-100 text-cyan-600 border-cyan-200/50",
    "16": "bg-sky-100 text-sky-600 border-sky-200/50",
    "17": "bg-lime-100 text-lime-600 border-lime-200/50",
    "18": "bg-red-100 text-red-600 border-red-200/50",
    "19": "bg-blue-100 text-blue-600 border-blue-200/50",
    "20": "bg-green-100 text-green-600 border-green-200/50",
    "21": "bg-zinc-100 text-zinc-600 border-zinc-200/50",
    "22": "bg-stone-100 text-stone-600 border-stone-200/50",
    "23": "bg-emerald-100 text-emerald-600 border-emerald-200/50",
    "24": "bg-indigo-100 text-indigo-600 border-indigo-200/50",
    "25": "bg-teal-100 text-teal-600 border-teal-200/50",
    "26": "bg-amber-100 text-amber-600 border-amber-200/50",
    "27": "bg-fuchsia-100 text-fuchsia-600 border-fuchsia-200/50",
    "28": "bg-blue-100 text-blue-600 border-blue-200/50",
  };
  return map[String(catId)] || "bg-neutral-100 text-neutral-600 border-neutral-200/50";
};

const getShortTxnId = (id) => {
  if (!id) return "—";
  if (id.startsWith("Txn")) return id;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const padded = String(hash).padStart(10, "0");
  return `Txn${padded}`;
};

export default function LiveBillPay() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [billers, setBillers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingOps, setLoadingOps] = useState(false);
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [loadingPay, setLoadingPay] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);

  // Form states
  const [selectedCat, setSelectedCat] = useState("");
  const [selectedOp, setSelectedOp] = useState("");
  const [mobileNumber, setMobileNumber] = useState(user?.phone || "");
  const [paramValues, setParamValues] = useState({});
  const [opSearch, setOpSearch] = useState("");

  // Fetched bill details
  const [fetchedBill, setFetchedBill] = useState(null);
  const [fetchRequestId, setFetchRequestId] = useState("");
  const [payAmount, setPayAmount] = useState("");

  // Pagination states for history
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchWallet = async () => {
    try {
      const res = await api.get("/wallet");
      setWalletBalance(res.data?.balance);
    } catch (e) {
      console.log("Failed to fetch wallet balance:", e.message);
    }
  };

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
    fetchWallet();
  }, []);

  const handleCategoryChange = (catId) => {
    setSelectedCat(catId);
    setSelectedOp("");
    setBillers([]);
    setOpSearch("");
    setFetchedBill(null);
    setFetchRequestId("");
    setPayAmount("");
    setParamValues({});
    if (catId) {
      fetchBillers(catId);
    }
  };

  const handleOperatorChange = (opId) => {
    setSelectedOp(opId);
    setFetchedBill(null);
    setFetchRequestId("");
    setPayAmount("");
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

      const res = await api.post("/agent/live-billpay/fetch", payload);
      if (res.data?.status === "success" && res.data?.data?.billerResponse) {
        setFetchedBill(res.data.data);
        setFetchRequestId(res.data.data.requestId || "");
        setPayAmount(res.data.data.billerResponse.amount || "");
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

      const amountVal = parseFloat(payAmount);
      if (isNaN(amountVal) || amountVal <= 0) {
        setLoadingPay(false);
        return toast.error("Please enter a valid payment amount");
      }

      const baseBillerInfo = fetchedBill.billFetchResponse?.billerResponse || fetchedBill.billerResponse;
      const billerResponseInfo = {
        ...baseBillerInfo,
        amount: String(amountVal)
      };

      const payload = {
        billerId: selectedOp,
        amount: amountVal,
        mobile: mobileNumber,
        fetchRequestId: fetchRequestId,
        additionalInfo: fetchedBill.billFetchResponse?.additionalInfo || fetchedBill.additionalInfo || {},
        customerParams: customerParams,
        billerResponseInfo: billerResponseInfo
      };

      const res = await api.post("/agent/live-billpay/pay", payload);
      if (res.data?.status === "success") {
        toast.success(`Bill payment of ₹${payload.amount} successful!`);
        setFetchedBill(null);
        setFetchRequestId("");
        setPayAmount("");
        setParamValues({});
        reloadHistory();
      } else if (res.data?.status === "pending") {
        toast.warning("Payment submitted. Current status: PENDING.");
        setFetchedBill(null);
        setFetchRequestId("");
        setPayAmount("");
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

      <div className="w-full max-w-none px-4 lg:px-8 mb-8">
        {selectedCat === "" ? (
          <div className="space-y-8 animate-fadeIn">
            {/* Bharat Connect Banner */}
            <div className="bg-[#0F172A] text-white rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden shadow-xl shadow-slate-900/10">
              {/* Background patterns */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -z-10"></div>

              <div className="space-y-3 max-w-xl">
                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 px-2.5 py-1 rounded-md tracking-wider">
                  ⚡ Secure Gateway
                </span>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Bharat Connect</h2>
                <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
                  Securely recharge plans and pay all utility bills instantly with direct Bharat Connect settlement.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 md:p-5 flex items-center gap-4 min-w-[240px]">
                <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <Receipt className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Available Balance</span>
                  <span className="text-lg md:text-xl font-black tracking-tight text-emerald-400 mt-1 block">
                    {walletBalance !== null ? fmtMoney(walletBalance) : "Fetching..."}
                  </span>
                </div>
              </div>
            </div>

            {/* Select utility service step header */}
            <div className="border-b border-black/5 pb-4">
              <span className="text-[10px] font-extrabold text-[#00966B] uppercase tracking-wider bg-[#E8F5E9] text-[#00966B] border border-[#C8E6C9] px-2.5 py-1 rounded-md">
                Step 1 of 3: Select Utility Service
              </span>
              <h2 className="text-xl font-bold text-neutral-800 mt-3">Select a category to begin</h2>
            </div>

            {/* Categories Grid */}
            {loadingCats ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-5">
                {categories.map((c) => {
                  const IconComp = getCategoryIcon(c.id);
                  const desc = getCategoryDesc(c.id, c.category_name);
                  const colorCls = getCategoryColor(c.id);

                  return (
                    <button
                      key={c.id}
                      onClick={() => handleCategoryChange(c.id)}
                      className="flex flex-col items-start text-left p-5 bg-white border border-slate-100/90 hover:border-indigo-500/25 rounded-2xl transition-all duration-300 shadow-[0_4px_16px_rgba(0,0,0,0.02)] hover:shadow-[0_16px_24px_-8px_rgba(79,70,229,0.1)] hover:-translate-y-1.5 group w-full relative overflow-hidden"
                    >
                      {/* Premium subtle inner gradient glow */}
                      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.015] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                      <div className={`p-3 rounded-xl border ${colorCls} mb-4 transition-all duration-300 group-hover:scale-105 shadow-sm`}>
                        <IconComp className="h-5.5 w-5.5 stroke-[1.8]" />
                      </div>
                      
                      <span className="font-bold text-slate-800 text-xs sm:text-sm tracking-tight leading-snug mb-1.5 group-hover:text-indigo-600 transition-colors">
                        {c.category_name}
                      </span>
                      
                      <span className="text-slate-400 text-[10px] leading-normal font-medium line-clamp-2">
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : selectedOp === "" ? (
          // STEP 2: Select Operator / Provider (Card Grid with Search)
          <div className="space-y-6 animate-fadeIn">
            {/* Back Button and Step Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <button
                onClick={() => {
                  setSelectedCat("");
                  setBillers([]);
                  setOpSearch("");
                }}
                className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600 hover:text-indigo-600 bg-white border border-black/5 hover:border-indigo-500/20 px-4 py-2.5 rounded-xl transition-all shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" /> Back to Services
              </button>

              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#E8F5E9] text-[#00966B] border border-[#C8E6C9] px-2.5 py-1 rounded-md">
                Step 2 of 3: Select Provider
              </span>
            </div>

            {/* Title & Search bar */}
            <div className="border-b border-black/5 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-neutral-800">
                  Select {categories.find(c => String(c.id) === String(selectedCat))?.category_name || "Provider"} Operator
                </h2>
                <p className="text-xs text-neutral-400 mt-1">Choose your service operator to proceed</p>
              </div>
              
              {/* Operator Search input */}
              <div className="relative min-w-[280px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search operator..."
                  value={opSearch}
                  onChange={(e) => setOpSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/80 focus:border-indigo-500/50 rounded-xl outline-none text-xs text-slate-700 focus:ring-4 focus:ring-indigo-500/5 transition-all font-medium shadow-sm"
                />
              </div>
            </div>

            {loadingOps ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
              </div>
            ) : billers.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 text-xs">
                No operators found for this category.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {billers
                  .filter(o => o.biller_name.toLowerCase().includes(opSearch.toLowerCase()))
                  .map((o) => (
                    <button
                      key={o.biller_id}
                      onClick={() => handleOperatorChange(o.biller_id)}
                      className="flex items-center gap-3 p-4 bg-white border border-slate-100/90 hover:border-indigo-500/25 hover:shadow-[0_12px_20px_-8px_rgba(79,70,229,0.08)] hover:-translate-y-0.5 rounded-2xl transition-all duration-300 text-left group w-full relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                      <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-black flex items-center justify-center border border-indigo-100/50 flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                        {o.biller_name[0].toUpperCase()}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-800 text-xs leading-snug group-hover:text-indigo-600 transition-colors block truncate">
                          {o.biller_name}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono block mt-0.5">{o.biller_id}</span>
                      </div>
                    </button>
                  ))
                }
              </div>
            )}
          </div>
        ) : (
          // STEP 3: Enter Details & Settle Bill
          <div className="space-y-4 animate-fadeIn">
            {/* Back Button and Step Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <button
                onClick={() => {
                  setSelectedOp("");
                  setFetchedBill(null);
                  setFetchRequestId("");
                  setPayAmount("");
                  setParamValues({});
                }}
                className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600 hover:text-indigo-600 bg-white border border-black/5 hover:border-indigo-500/20 px-4 py-2.5 rounded-xl transition-all shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" /> Back to Operators
              </button>

              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB] px-2.5 py-1 rounded-md">
                {fetchedBill ? "Step 3 of 3: Settle Bill" : "Step 3 of 3: Enter Details"}
              </span>
            </div>

            <div className="grid lg:grid-cols-2 gap-10 items-start">
              {/* Left Card: Input Form */}
              <div className="bg-white border border-black/5 rounded-3xl p-6 lg:p-8 shadow-lg shadow-indigo-500/5">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3 mb-6">
                  <CreditCard className="h-4.5 w-4.5 text-indigo-600 stroke-[1.8]" /> {categories.find(c => String(c.id) === String(selectedCat))?.category_name || "Bill"} Details
                </h3>

                {/* Selected Provider Summary Banner */}
                <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center border border-indigo-100/50 flex-shrink-0">
                      {activeOp?.biller_name ? activeOp.biller_name[0].toUpperCase() : "U"}
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Selected Provider</span>
                      <span className="font-bold text-slate-700 text-xs block leading-tight mt-0.5">{activeOp?.biller_name || "Utility Provider"}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedOp("");
                      setFetchedBill(null);
                      setFetchRequestId("");
                      setPayAmount("");
                      setParamValues({});
                    }}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-white border border-slate-200/60 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    Change
                  </button>
                </div>

                <form onSubmit={fetchBill} className="space-y-4">
                  {/* Customer Mobile Number */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Customer Mobile Number
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Smartphone className="h-4 w-4 stroke-[1.8]" />
                      </span>
                      <input
                        className="w-full pl-10 pr-4 py-3 bg-slate-50/50 hover:bg-slate-50/80 border border-slate-200/80 focus:border-indigo-500/50 focus:bg-white text-slate-700 text-xs rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all font-medium"
                        type="text"
                        required
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        placeholder="e.g. 9876543210"
                      />
                    </div>
                  </div>

                  {/* Render Dynamic Metadata Fields */}
                  <div className="space-y-4 pt-1 animate-fadeIn">
                    {paramsList.map((p) => (
                      <div className="space-y-1.5" key={p.paramName}>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                          {p.paramName} {p.isOptional ? "(Optional)" : ""}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <FileText className="h-4 w-4 stroke-[1.8]" />
                          </span>
                          <input
                            className="w-full pl-10 pr-4 py-3 bg-slate-50/50 hover:bg-slate-50/80 border border-slate-200/80 focus:border-indigo-500/50 focus:bg-white text-slate-700 text-xs rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all font-medium"
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
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={loadingFetch || !mobileNumber}
                    className="w-full mt-5 py-3 px-4 flex items-center justify-center gap-2 text-white text-xs font-bold rounded-xl transition-all shadow-md bg-[#00966B] hover:bg-[#007f5a] shadow-[#00966B]/15 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
                </form>
              </div>

              {/* Right Card: Bill Receipt / Invoice Preview */}
              <div className="w-full">
                {fetchedBill ? (
                  <div className="bg-[#0F172A] text-white rounded-3xl p-6 lg:p-8 shadow-xl shadow-slate-900/10 flex flex-col justify-between min-h-[360px] relative overflow-hidden animate-fadeIn border border-slate-800">
                    {/* Decorative background gradients */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl"></div>
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>

                    <div className="space-y-5">
                      <div className="flex justify-between items-start border-b border-white/10 pb-4">
                        <div>
                          <span className="inline-flex items-center text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 tracking-wider">
                            Bill Fetched
                          </span>
                          <h4 className="text-sm font-bold mt-2 text-white/90 leading-tight">
                            {activeOp?.biller_name || "Utility Provider"}
                          </h4>
                        </div>
                        <Receipt className="h-7 w-7 text-white/20 stroke-[1.5]" />
                      </div>

                      <div className="space-y-3.5 text-xs text-white/70">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-400">Customer Name:</span>
                          <strong className="text-white font-bold tracking-tight">{fetchedBill.billerResponse.customerName || "N/A"}</strong>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-400">Biller ID:</span>
                          <strong className="text-white font-mono text-[11px] bg-slate-800/40 px-2 py-0.5 rounded border border-white/5">{selectedOp}</strong>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-400">Due Date:</span>
                          <strong className="text-rose-400 font-bold bg-rose-500/10 px-2.5 py-0.5 rounded border border-rose-500/20">{fetchedBill.billerResponse.dueDate || "N/A"}</strong>
                        </div>
                      </div>

                      {/* Dashed Separator Line with punched ticket holes */}
                      <div className="relative my-6">
                        <div className="border-t-2 border-dashed border-white/10 w-full"></div>
                        <div className="absolute -left-10 lg:-left-12 top-1/2 -translate-y-1/2 w-4 h-8 bg-[#f8fafc] rounded-r-full border-r border-slate-200/40"></div>
                        <div className="absolute -right-10 lg:-right-12 top-1/2 -translate-y-1/2 w-4 h-8 bg-[#f8fafc] rounded-l-full border-l border-slate-200/40"></div>
                      </div>

                      <div className="bg-black/20 rounded-2xl p-4 border border-white/5 text-center space-y-1.5">
                        <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest block">Payable Amount (Edit if custom)</span>
                        <div className="flex items-center justify-center gap-1.5 text-2xl font-black text-white">
                          <span className="text-emerald-400">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            className="bg-transparent border-b-2 border-white/20 focus:border-emerald-400 text-center outline-none w-48 text-2xl font-black text-white focus:ring-0 focus:outline-none transition-colors"
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-6">
                      <button
                        onClick={payBill}
                        disabled={loadingPay}
                        className="w-full py-3.5 px-4 flex items-center justify-center gap-2 text-slate-900 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg bg-white hover:bg-neutral-50 hover:-translate-y-0.5 active:translate-y-0 shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <div className="border-2 border-dashed border-slate-200/60 bg-slate-50/20 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-5 min-h-[380px] transition-all duration-300">
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm text-indigo-500/80 shadow-[0_8px_30px_rgb(0,0,0,0.01)]">
                      <Receipt className="h-8 w-8 stroke-[1.5]" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-slate-700">No Active Invoice</h4>
                      <p className="text-xs text-slate-400 max-w-[260px] mx-auto leading-relaxed">
                        Select your utility provider and click "Fetch Bill Details" to load your invoice statement.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
            className="min-w-[1300px]"
            columns={[
              {
                key: "id",
                label: "Tx ID",
                render: (r) => (
                  <span 
                    className="bg-neutral-100 text-neutral-600 font-mono text-[10px] px-2.5 py-1 rounded-md uppercase select-all tracking-wider border border-neutral-200/50 cursor-pointer hover:bg-neutral-200 transition-colors whitespace-nowrap"
                    title={`Original ID: ${r.id}`}
                  >
                    {getShortTxnId(r.id)}
                  </span>
                )
              },
              {
                key: "customer_name",
                label: "Customer",
                render: (r) => (
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black flex items-center justify-center border border-indigo-100/80 flex-shrink-0">
                      {(r.customer_name || "N")[0].toUpperCase()}
                    </div>
                    <span className="font-semibold text-neutral-800 text-xs capitalize whitespace-nowrap">
                      {r.customer_name || "N/A"}
                    </span>
                  </div>
                )
              },
              {
                key: "card_last4",
                label: "Card Last 4",
                render: (r) => r.card_last4 ? (
                  <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-700 text-[10px] px-2 py-0.5 rounded border border-slate-200/60 font-mono whitespace-nowrap">
                    💳 •••• {r.card_last4}
                  </span>
                ) : (
                  <span className="text-neutral-300">—</span>
                )
              },
              { 
                key: "operator", 
                label: "Biller ID",
                render: (r) => (
                  <span className="font-medium text-neutral-700 whitespace-nowrap">
                    {r.operator}
                  </span>
                )
              },
              { 
                key: "customer_phone", 
                label: "Mobile",
                render: (r) => (
                  <span className="font-mono text-neutral-600">
                    {r.customer_phone}
                  </span>
                )
              },
              { key: "bill_amount", label: "Bill Amt", render: (r) => <span className="font-semibold text-neutral-800 tabular-nums">{fmtMoney(r.bill_amount)}</span> },
              { key: "service_charge", label: "Charges", render: (r) => <span className="text-neutral-500 tabular-nums">{fmtMoney(r.service_charge)}</span> },
              { 
                key: "amount", 
                label: "Total Paid", 
                render: (r) => (
                  <span className="font-bold text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded border border-emerald-100/80 tabular-nums">
                    {fmtMoney(r.amount)}
                  </span>
                ) 
              },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { key: "created_at", label: "Date / Time", render: (r) => <span className="text-neutral-500 text-[11px] whitespace-nowrap">{fmtDate(r.created_at)}</span> },
              {
                key: "note",
                label: "Response / Note",
                render: (r) => {
                  if (!r.note) return <span className="text-neutral-300">—</span>;
                  const colorClass = r.status === "rejected" ? "bg-rose-50/70 text-rose-600 border-rose-100/80" :
                                     r.status === "pending" ? "bg-amber-50/70 text-amber-600 border-amber-100/80" :
                                     "bg-emerald-50/70 text-emerald-600 border-emerald-100/80";
                  return (
                    <span 
                      className={`text-[11px] px-2 py-1 rounded-lg border max-w-[200px] block truncate font-medium ${colorClass} cursor-help`} 
                      title={r.note}
                    >
                      {r.note}
                    </span>
                  );
                }
              }
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
  );
}
