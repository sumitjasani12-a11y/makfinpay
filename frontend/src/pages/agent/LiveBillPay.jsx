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

const getCategoryIcon = (catName) => {
  const name = String(catName).toLowerCase();
  if (name.includes("agent")) return UserCheck;
  if (name.includes("broadband")) return Wifi;
  if (name.includes("cable")) return Tv;
  if (name.includes("club") || name.includes("association")) return Landmark;
  if (name.includes("credit card")) return CreditCard;
  if (name.includes("dth")) return Tv;
  if (name.includes("challan")) return FileText;
  if (name.includes("education")) return GraduationCap;
  if (name.includes("electricity")) return Lightbulb;
  if (name.includes("ev")) return Zap;
  if (name.includes("fastag")) return Car;
  if (name.includes("fleet")) return CreditCard;
  if (name.includes("lpg") || name.includes("piped") || name.includes("gas")) return Flame;
  if (name.includes("housing")) return Home;
  if (name.includes("insurance")) return ShieldCheck;
  if (name.includes("landline")) return Smartphone;
  if (name.includes("loan")) return Landmark;
  if (name.includes("postpaid")) return Smartphone;
  if (name.includes("prepaid")) return Smartphone;
  if (name.includes("municipal")) return Landmark;
  if (name.includes("pension")) return Landmark;
  if (name.includes("ncmc")) return CreditCard;
  if (name.includes("meter")) return Zap;
  if (name.includes("rental")) return Home;
  if (name.includes("subscription")) return PlaySquare;
  if (name.includes("water")) return Droplet;
  return Receipt;
};

const getCategoryDesc = (catName) => {
  const name = String(catName).toLowerCase();
  if (name.includes("agent")) return "Pay agent collections";
  if (name.includes("broadband")) return "Pay broadband bills instantly";
  if (name.includes("cable")) return "Pay cable TV operator bills";
  if (name.includes("club") || name.includes("association")) return "Pay club & association dues";
  if (name.includes("credit card")) return "Pay credit card bills instantly";
  if (name.includes("dth")) return "Recharge DTH connections";
  if (name.includes("challan")) return "Pay traffic challans online";
  if (name.includes("education")) return "Pay school and college fees";
  if (name.includes("electricity")) return "Pay state power & electricity bills";
  if (name.includes("ev")) return "Recharge EV charging stations";
  if (name.includes("fastag")) return "Recharge FASTag accounts instantly";
  if (name.includes("fleet")) return "Recharge fleet cards";
  if (name.includes("gas")) return "Pay piped or LPG gas bills";
  if (name.includes("housing")) return "Pay housing society maintenance";
  if (name.includes("insurance")) return "Pay insurance policy premiums";
  if (name.includes("landline")) return "Pay landline bills instantly";
  if (name.includes("loan")) return "Repay EMIs and active loans";
  if (name.includes("postpaid")) return "Pay postpaid mobile bills";
  if (name.includes("prepaid")) return "Recharge prepaid mobile plans";
  if (name.includes("municipal")) return "Pay municipal utility charges";
  if (name.includes("pension")) return "Contribute to NPS account";
  if (name.includes("ncmc")) return "Recharge NCMC travel cards";
  if (name.includes("meter")) return "Recharge prepaid utility meters";
  if (name.includes("rental")) return "Pay monthly rental charges";
  if (name.includes("subscription")) return "Pay subscriptions & recurring fees";
  if (name.includes("water")) return "Pay municipal water bills";
  return `Pay ${catName} bills`;
};

const getCategoryColor = (catName) => {
  const name = String(catName).toLowerCase();
  if (name.includes("agent")) return "bg-indigo-100 text-indigo-600 border-indigo-200/50";
  if (name.includes("broadband")) return "bg-sky-100 text-sky-600 border-sky-200/50";
  if (name.includes("cable")) return "bg-pink-100 text-pink-600 border-pink-200/50";
  if (name.includes("club") || name.includes("association")) return "bg-amber-100 text-amber-600 border-amber-200/50";
  if (name.includes("credit card")) return "bg-rose-100 text-rose-600 border-rose-200/50";
  if (name.includes("dth")) return "bg-orange-100 text-orange-600 border-orange-200/50";
  if (name.includes("challan")) return "bg-red-100 text-red-600 border-red-200/50";
  if (name.includes("education")) return "bg-teal-100 text-teal-600 border-teal-200/50";
  if (name.includes("electricity")) return "bg-yellow-100 text-yellow-600 border-yellow-200/50";
  if (name.includes("ev")) return "bg-emerald-100 text-emerald-600 border-emerald-200/50";
  if (name.includes("fastag")) return "bg-blue-100 text-blue-600 border-blue-200/50";
  if (name.includes("fleet")) return "bg-indigo-100 text-indigo-600 border-indigo-200/50";
  if (name.includes("gas")) return "bg-orange-100 text-orange-600 border-orange-200/50";
  if (name.includes("housing")) return "bg-purple-100 text-purple-600 border-purple-200/50";
  if (name.includes("insurance")) return "bg-cyan-100 text-cyan-600 border-cyan-200/50";
  if (name.includes("landline")) return "bg-sky-100 text-sky-600 border-sky-200/50";
  if (name.includes("loan")) return "bg-lime-100 text-lime-600 border-lime-200/50";
  if (name.includes("postpaid")) return "bg-blue-100 text-blue-600 border-blue-200/50";
  if (name.includes("prepaid")) return "bg-green-100 text-green-600 border-green-200/50";
  if (name.includes("municipal")) return "bg-zinc-100 text-zinc-600 border-zinc-200/50";
  if (name.includes("pension")) return "bg-emerald-100 text-emerald-600 border-emerald-200/50";
  if (name.includes("ncmc")) return "bg-indigo-100 text-indigo-600 border-indigo-200/50";
  if (name.includes("meter")) return "bg-teal-100 text-teal-600 border-teal-200/50";
  if (name.includes("rental")) return "bg-amber-100 text-amber-600 border-amber-200/50";
  if (name.includes("subscription")) return "bg-fuchsia-100 text-fuchsia-600 border-fuchsia-200/50";
  if (name.includes("water")) return "bg-blue-100 text-blue-600 border-blue-200/50";
  return "bg-neutral-100 text-neutral-600 border-neutral-200/50";
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

const getBillerLogoUrl = (billerName) => {
  const name = billerName.toLowerCase();
  if (name.includes("axis")) return "https://logo.clearbit.com/axisbank.com";
  if (name.includes("sbi") || name.includes("state bank of india")) return "https://logo.clearbit.com/sbi.co.in";
  if (name.includes("hdfc")) return "https://logo.clearbit.com/hdfcbank.com";
  if (name.includes("icici")) return "https://logo.clearbit.com/icicibank.com";
  if (name.includes("kotak")) return "https://logo.clearbit.com/kotak.com";
  if (name.includes("rbl")) return "https://logo.clearbit.com/rblbank.com";
  if (name.includes("baroda") || name.includes("bob")) return "https://logo.clearbit.com/bankofbaroda.in";
  if (name.includes("yes bank")) return "https://logo.clearbit.com/yesbank.in";
  if (name.includes("idfc") || name.includes("first bank")) return "https://logo.clearbit.com/idfcfirstbank.com";
  if (name.includes("canara")) return "https://logo.clearbit.com/canarabank.com";
  if (name.includes("union bank")) return "https://logo.clearbit.com/unionbankofindia.co.in";
  if (name.includes("punjab national") || name.includes("pnb")) return "https://logo.clearbit.com/pnbindia.in";
  if (name.includes("indusind")) return "https://logo.clearbit.com/indusind.com";
  if (name.includes("federal")) return "https://logo.clearbit.com/federalbank.co.in";
  if (name.includes("hsbc")) return "https://logo.clearbit.com/hsbc.co.in";
  if (name.includes("dbs")) return "https://logo.clearbit.com/dbs.com";
  if (name.includes("au bank") || name.includes("au small")) return "https://logo.clearbit.com/aubank.in";
  if (name.includes("idbi")) return "https://logo.clearbit.com/idbi.com";
  if (name.includes("maharashtra")) return "https://logo.clearbit.com/bankofmaharashtra.in";
  if (name.includes("central bank")) return "https://logo.clearbit.com/centralbankofindia.co.in";
  if (name.includes("saraswat")) return "https://logo.clearbit.com/saraswatbank.com";
  if (name.includes("dhanlaxmi")) return "https://logo.clearbit.com/dhanbank.com";
  if (name.includes("south indian")) return "https://logo.clearbit.com/southindianbank.com";
  if (name.includes("karur vysya") || name.includes("kvb")) return "https://logo.clearbit.com/kvb.co.in";
  if (name.includes("uco")) return "https://logo.clearbit.com/ucobank.com";
  if (name.includes("indian bank")) return "https://logo.clearbit.com/indianbank.in";
  if (name.includes("slice")) return "https://logo.clearbit.com/sliceit.com";
  if (name.includes("onecard")) return "https://logo.clearbit.com/getonecard.com";
  if (name.includes("esaf")) return "https://logo.clearbit.com/esafbank.com";
  if (name.includes("suryoday")) return "https://logo.clearbit.com/suryodaybank.com";
  if (name.includes("equitas")) return "https://logo.clearbit.com/equitasbank.com";
  if (name.includes("bandhan")) return "https://logo.clearbit.com/bandhanbank.com";
  if (name.includes("dcb")) return "https://logo.clearbit.com/dcbbank.com";
  if (name.includes("cub") || name.includes("city union")) return "https://logo.clearbit.com/cityunionbank.com";
  return null;
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
  const [showTpinModal, setShowTpinModal] = useState(false);
  const [enteredTpin, setEnteredTpin] = useState("");

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

  const dynamicMobileParam = React.useMemo(() => {
    return paramsList.find(p => {
      const name = p.paramName.toLowerCase();
      return name.includes("mobile") || name.includes("phone");
    });
  }, [paramsList]);

  const actualMobile = dynamicMobileParam
    ? (paramValues[dynamicMobileParam.paramName] || "")
    : mobileNumber;

  const fetchBill = async (e) => {
    if (e) e.preventDefault();
    if (!selectedOp || !actualMobile) {
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
        mobile: actualMobile,
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

  const payBill = async (tpin) => {
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
        mobile: actualMobile,
        fetchRequestId: fetchRequestId,
        additionalInfo: fetchedBill.billFetchResponse?.additionalInfo || fetchedBill.additionalInfo || {},
        customerParams: customerParams,
        billerResponseInfo: billerResponseInfo,
        tpin: tpin
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
                {billers
                  .filter(o => o.biller_name.toLowerCase().includes(opSearch.toLowerCase()))
                  .map((o) => {
                    const logoUrl = getBillerLogoUrl(o.biller_name);

                    return (
                      <button
                        key={o.biller_id}
                        onClick={() => handleOperatorChange(o.biller_id)}
                        className="flex flex-col items-center justify-center text-center p-5 bg-white border border-slate-100/90 hover:border-indigo-500/25 hover:shadow-[0_16px_24px_-8px_rgba(79,70,229,0.1)] hover:-translate-y-1.5 rounded-2xl transition-all duration-300 group w-full relative min-h-[130px] overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.015] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                        {/* Centered Logo Container */}
                        <div className="h-12 w-full flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-105">
                          {logoUrl ? (
                            <>
                              <img 
                                src={logoUrl} 
                                alt={o.biller_name} 
                                className="max-h-10 max-w-[85%] object-contain" 
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const fallback = e.target.parentElement.querySelector('.logo-fallback');
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                              <div 
                                className="logo-fallback hidden h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-black items-center justify-center border border-indigo-100/50"
                                style={{ display: 'none' }}
                              >
                                {o.biller_name[0].toUpperCase()}
                              </div>
                            </>
                          ) : (
                            <div 
                              className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-black flex items-center justify-center border border-indigo-100/50"
                            >
                              {o.biller_name[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        
                        <span className="font-bold text-slate-700 text-xs sm:text-xs leading-tight group-hover:text-indigo-600 transition-colors block w-full px-1 line-clamp-2">
                          {o.biller_name}
                        </span>
                      </button>
                    );
                  })
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
                  {!dynamicMobileParam && (
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
                  )}

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
                    disabled={loadingFetch || !actualMobile}
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
                        onClick={() => {
                          if (!user?.tpin_hash) {
                            toast.error("Please set up your transaction PIN (TPIN) first in the TPIN Settings.");
                            return;
                          }
                          setEnteredTpin("");
                          setShowTpinModal(true);
                        }}
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
        {showTpinModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full border border-slate-100/80 shadow-2xl relative space-y-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <ShieldCheck className="h-6 w-6 stroke-[1.8]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Security Verification</h3>
                  <p className="text-[11px] text-slate-400">Enter your 4-digit TPIN to authorize payment</p>
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-2">Transaction PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={enteredTpin}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || (/^\d+$/.test(val) && val.length <= 4)) {
                      setEnteredTpin(val);
                    }
                  }}
                  placeholder="••••"
                  className="w-full text-center tracking-[1.5em] text-2xl font-black py-3 bg-slate-50 border-2 border-slate-200/80 focus:border-indigo-500/55 focus:bg-white rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all text-slate-800"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowTpinModal(false)}
                  className="w-1/2 py-3 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (enteredTpin.length !== 4) {
                      toast.error("Please enter a valid 4-digit TPIN");
                      return;
                    }
                    setShowTpinModal(false);
                    payBill(enteredTpin);
                  }}
                  className="w-1/2 py-3 bg-[#0F172A] text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-md shadow-slate-900/10"
                >
                  Confirm & Pay
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
