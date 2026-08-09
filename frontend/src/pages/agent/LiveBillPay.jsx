import React, { useEffect, useState, useRef } from "react";
import { api, formatErr, fmtMoney, fmtDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, DataTable, StatusBadge } from "@/components/Shared";
import BharatConnectLogo from "@/components/BharatConnectLogo";
import { toast } from "sonner";
import { 
  Loader2, CreditCard, History, Send, Receipt,
  Lightbulb, Smartphone, Car, Flame, Wifi, Tv,
  ShieldCheck, GraduationCap, Landmark, Droplet,
  Home, UserCheck, FileText, Zap, PlaySquare,
  Building, ChevronLeft, AlertCircle
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
  if (!billerName) return null;
  const name = billerName.toLowerCase();
  
  // Local Bank Logos copied from local storage folder
  if (name.includes("onecard") || name.includes("one credit card") || name.includes("one card")) return "/assets/banks/onecard_logo.png";
  if (name.includes("au bank") || name.includes("au small") || name.includes("au credit")) return "/assets/banks/au_logo.png";
  if (name.includes("canara")) return "/assets/banks/canara_logo.png";
  if (name.includes("cub") || name.includes("city union")) return "/assets/banks/cub_logo.png";
  if (name.includes("dhanlaxmi")) return "/assets/banks/dhanlaxmi_logo.png";
  if (name.includes("icici")) return "/assets/banks/icici_logo.png";
  if (name.includes("idbi")) return "/assets/banks/idbi_logo.png";
  if (name.includes("idfc") || name.includes("first bank")) return "/assets/banks/idfc_logo.png";
  if (name.includes("indusind")) return "/assets/banks/indusind_logo.png";
  if (name.includes("iob") || name.includes("overseas")) return "/assets/banks/iob_logo.png";
  if (name.includes("j and k") || name.includes("j&k") || name.includes("jammu") || name.includes("jk bank")) return "/assets/banks/jk_logo.png";
  if (name.includes("sbi") || name.includes("state bank of india")) return "/assets/banks/sbi_logo.png";
  if (name.includes("tmb") || name.includes("tamilnad")) return "/assets/banks/tmb_logo.png";
  if (name.includes("union")) return "/assets/banks/union_logo.png";
  if (name.includes("axis")) return "/assets/banks/axis_logo.png";
  if (name.includes("bandhan")) return "/assets/banks/bandhan_logo.png";
  if (name.includes("baroda") || name.includes("bob")) return "/assets/banks/bob_logo.png";
  if (name.includes("bank of india") || name.includes("boi")) return "/assets/banks/boi_logo.png";
  if (name.includes("csb")) return "/assets/banks/csb_logo.png";
  if (name.includes("dcb")) return "/assets/banks/dcb_logo.png";
  if (name.includes("esaf")) return "/assets/banks/esaf_logo.png";
  if (name.includes("federal")) return "/assets/banks/federal_logo.png";
  if (name.includes("indian bank") || name.includes("indian")) return "/assets/banks/indian_logo.png";
  if (name.includes("kotak")) return "/assets/banks/kotak_logo.png";
  if (name.includes("punjab national") || name.includes("pnb")) return "/assets/banks/pnb_logo.png";
  if (name.includes("saraswat")) return "/assets/banks/saraswat_logo.png";
  if (name.includes("sbm")) return "/assets/banks/sbm_logo.png";
  if (name.includes("south indian") || name.includes("sib")) return "/assets/banks/south_indian_logo.png";
  if (name.includes("suryoday")) return "/assets/banks/suryoday_logo.png";

  return null;
};

const renderBillerLogo = (o) => {
  const logoUrl = getBillerLogoUrl(o.biller_name);
  if (logoUrl) {
    return (
      <img 
        src={logoUrl} 
        alt={o.biller_name} 
        className="h-14 w-auto max-w-[95%] max-h-14 object-contain shrink-0 filter drop-shadow-xs transition-transform duration-300 group-hover:scale-105" 
        onError={(e) => {
          e.target.style.display = 'none';
          const fallback = e.target.parentElement.querySelector('.logo-fallback');
          if (fallback) fallback.style.display = 'flex';
        }}
      />
    );
  }
  
  const name = o.biller_name.toLowerCase();
  
  if (name.includes("sbi") || name.includes("state bank of india")) {
    return (
      <svg viewBox="0 0 100 100" className="h-10 w-auto">
        <circle cx="50" cy="50" r="40" fill="#00baf2"/>
        <rect x="46" y="60" width="8" height="30" fill="#fff"/>
        <circle cx="50" cy="50" r="16" fill="#fff"/>
      </svg>
    );
  }
  
  if (name.includes("hdfc")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#1c3f94"/>
        <text x="60" y="24" fontFamily="sans-serif" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle" letterSpacing="0.5">HDFC BANK</text>
      </svg>
    );
  }
  
  if (name.includes("icici")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#75151e"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="14" fill="#fbb03b" textAnchor="middle">ICICI Bank</text>
      </svg>
    );
  }
  
  if (name.includes("indusind")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#650d1b"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="13" fill="#e5a93b" textAnchor="middle">IndusInd</text>
      </svg>
    );
  }
  
  if (name.includes("canara")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#0091ff"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">Canara Bank</text>
      </svg>
    );
  }
  
  if (name.includes("au bank") || name.includes("au small")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#0c2340"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="13" fill="#ff7f00" textAnchor="middle">AU BANK</text>
      </svg>
    );
  }
  
  if (name.includes("dbs")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#db232a"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="15" fill="#fff" textAnchor="middle">DBS</text>
      </svg>
    );
  }
  
  if (name.includes("hsbc")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#db0011"/>
        <text x="60" y="24" fontFamily="sans-serif" fontWeight="900" fontSize="15" fill="#fff" textAnchor="middle">HSBC</text>
      </svg>
    );
  }
  
  if (name.includes("dhanlaxmi")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#4a3b8c"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="11" fill="#fff" textAnchor="middle">Dhanlaxmi</text>
      </svg>
    );
  }
  
  if (name.includes("idbi")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#006644"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">IDBI BANK</text>
      </svg>
    );
  }
  
  if (name.includes("idfc") || name.includes("first bank")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#9e1b32"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="12" fill="#f3d03b" textAnchor="middle">IDFC FIRST</text>
      </svg>
    );
  }
  
  if (name.includes("yes bank")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#005ea6"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">YES BANK</text>
      </svg>
    );
  }
  
  if (name.includes("slice")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#000"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="15" fill="#fff" textAnchor="middle">slice</text>
      </svg>
    );
  }
  
  if (name.includes("cub") || name.includes("city union")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#0b2e83"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="15" fill="#ffcd00" textAnchor="middle">CUB</text>
      </svg>
    );
  }
  
  if (name.includes("rbl")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#0b4da2"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="15" fill="#fff" textAnchor="middle">RBL Bank</text>
      </svg>
    );
  }
  
  if (name.includes("j and k") || name.includes("jammu")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#003da5"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="14" fill="#fff" textAnchor="middle">J&amp;K Bank</text>
      </svg>
    );
  }
  
  if (name.includes("tmb") || name.includes("tamilnad")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#005ea6"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="15" fill="#fff" textAnchor="middle">TMB</text>
      </svg>
    );
  }

  if (name.includes("iob") || name.includes("overseas")) {
    return (
      <svg viewBox="0 0 120 35" className="h-9 w-auto">
        <rect width="120" height="35" rx="6" fill="#0a469b"/>
        <text x="60" y="23" fontFamily="sans-serif" fontWeight="900" fontSize="15" fill="#fff" textAnchor="middle">IOB</text>
      </svg>
    );
  }

  return (
    <div className="logo-fallback h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-black flex items-center justify-center border border-indigo-100/50">
      {o.biller_name[0].toUpperCase()}
    </div>
  );
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
  const [tpinArray, setTpinArray] = useState(["", "", "", ""]);
  const pin1Ref = useRef(null);
  const pin2Ref = useRef(null);
  const pin3Ref = useRef(null);
  const pin4Ref = useRef(null);
  const tpinRefs = [pin1Ref, pin2Ref, pin3Ref, pin4Ref];

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

  // Slabs state
  const [slabs, setSlabs] = useState([]);
  const [liveBillMaxLimit, setLiveBillMaxLimit] = useState(100000);

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

  const fetchLimits = async () => {
    try {
      const res = await api.get("/settings/recharge-limits-public");
      if (res.data && res.data.live_bill_max_limit !== undefined) {
        setLiveBillMaxLimit(res.data.live_bill_max_limit);
      }
    } catch (e) {
      console.log("Failed to fetch limits:", e.message);
    }
  };

  const fetchSlabs = async () => {
    try {
      const res = await api.get("/billing/service-slabs");
      setSlabs(res.data || []);
    } catch (e) {
      console.log("Failed to fetch slabs:", e.message);
    }
  };

  const getCalculatedCharge = (amountVal) => {
    const amt = parseFloat(amountVal);
    if (isNaN(amt) || amt <= 0) return 0;
    
    let matchedSlab = null;
    for (const slab of slabs) {
      const min = parseFloat(slab.min_amount);
      const max = parseFloat(slab.max_amount);
      if (amt >= min && amt <= max) {
        matchedSlab = slab;
        break;
      }
    }
    
    if (matchedSlab) {
      if (matchedSlab.charge_type === "percent") {
        return Math.round((amt * parseFloat(matchedSlab.charge_amount)) / 100.0 * 100) / 100;
      } else {
        return parseFloat(matchedSlab.charge_amount);
      }
    }
    
    return amt <= 50000 ? 15.0 : 25.0;
  };

  const handlePinChange = (index, val) => {
    const cleanVal = val.replace(/\D/g, "");
    const newArray = [...tpinArray];
    newArray[index] = cleanVal.slice(-1);
    setTpinArray(newArray);

    if (cleanVal && index < 3) {
      tpinRefs[index + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (!tpinArray[index] && index > 0) {
        const newArray = [...tpinArray];
        newArray[index - 1] = "";
        setTpinArray(newArray);
        tpinRefs[index - 1].current?.focus();
      } else {
        const newArray = [...tpinArray];
        newArray[index] = "";
        setTpinArray(newArray);
      }
    }
  };

  const handlePinPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pastedData) {
      const newArray = ["", "", "", ""];
      for (let i = 0; i < pastedData.length; i++) {
        newArray[i] = pastedData[i];
      }
      setTpinArray(newArray);
      const focusIndex = Math.min(pastedData.length, 3);
      tpinRefs[focusIndex].current?.focus();
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
      const res = await api.get(`/agent/live-billpay/operators?category_id=${catId}&t=${Date.now()}`);
      const list = res.data?.data || [];
      list.sort((a, b) => a.biller_name.localeCompare(b.biller_name, 'en', { sensitivity: 'base' }));
      setBillers(list);
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
    fetchSlabs();
    fetchLimits();
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
      const resData = res.data;
      const bData = resData?.data;
      const bResp = bData?.billerResponse || bData?.billFetchResponse?.billerResponse || bData;

      if (resData?.status === "success" && (bResp?.responseCode === "000" || bResp?.customerName || bData?.billerResponse?.customerName || bResp?.amount || bData?.amount)) {
        setFetchedBill(bData || resData);
        setFetchRequestId(bData?.requestId || bResp?.requestId || "");
        setPayAmount(bResp?.amount || bResp?.billAmount || bData?.amount || "");
        toast.success("Bill details fetched successfully!");
      } else {
        const errMsg = bResp?.errorInfo?.error?.errorMessage || resData?.message || resData?.detail || "Failed to fetch bill. Please verify your consumer details.";
        toast.error(errMsg);
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
        window.dispatchEvent(new CustomEvent("ws:wallet_update"));
      } else if (res.data?.status === "pending") {
        toast.warning("Payment submitted. Current status: PENDING.");
        setFetchedBill(null);
        setFetchRequestId("");
        setPayAmount("");
        setParamValues({});
        reloadHistory();
        window.dispatchEvent(new CustomEvent("ws:wallet_update"));
      } else {
        const rawMsg = res.data?.message || "Payment rejected by operator.";
        const displayMsg = /insufficient|balance/i.test(rawMsg) ? "Transaction failed" : rawMsg;
        toast.error(displayMsg);
      }
    } catch (e) {
      const errDetail = formatErr(e.response?.data?.detail) || "Error processing bill payment";
      const displayMsg = /insufficient|balance/i.test(errDetail) ? "Transaction failed" : errDetail;
      toast.error(displayMsg);
    } finally {
      setLoadingPay(false);
    }
  };

  const paginatedTransactions = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return transactions.slice(start, start + pageSize);
  }, [transactions, page, pageSize]);

  const billDate = fetchedBill?.billerResponse?.billDate || fetchedBill?.billDate || fetchedBill?.additionalInfo?.billDate || fetchedBill?.billFetchResponse?.additionalInfo?.billDate;
  const billNumber = fetchedBill?.billerResponse?.billNumber || fetchedBill?.billNumber || fetchedBill?.additionalInfo?.billNumber || fetchedBill?.billFetchResponse?.additionalInfo?.billNumber;
  const minAmount = fetchedBill?.billerResponse?.minimumAmountDue || fetchedBill?.minimumAmountDue || fetchedBill?.additionalInfo?.minimumAmountDue || fetchedBill?.billFetchResponse?.additionalInfo?.minimumAmountDue;
  const outstanding = fetchedBill?.billerResponse?.currentOutstandingAmount || fetchedBill?.currentOutstandingAmount || fetchedBill?.additionalInfo?.currentOutstandingAmount || fetchedBill?.billFetchResponse?.additionalInfo?.currentOutstandingAmount || fetchedBill?.billerResponse?.outstandingAmount || fetchedBill?.additionalInfo?.outstandingAmount;
  const dueAmount = parseFloat(fetchedBill?.billerResponse?.amount || fetchedBill?.amount || 0);

  const fmtBillDateFallback = (dueDateStr) => {
    try {
      const d = new Date(dueDateStr);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() - 15);
        return d.toISOString().split('T')[0];
      }
    } catch (e) {}
    return "—";
  };

  const isMaskedName = (nameStr) => {
    if (!nameStr) return false;
    const upper = nameStr.toUpperCase();
    const xCount = (upper.match(/X/g) || []).length;
    const starCount = (upper.match(/\*/g) || []).length;
    return xCount > 4 || starCount > 2;
  };

  const formatCustomerName = (nameStr) => {
    if (!nameStr) return "N/A";
    let clean = nameStr.trim();
    
    if (isMaskedName(clean)) {
      return clean.toUpperCase().split('').map(char => {
        if (char === 'X' || char === '*') {
          return '•';
        }
        return char;
      }).join(' ');
    }
    
    return clean.split(' ').map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };

  return (
    <div className="w-full max-w-none px-4 lg:px-8 mb-8">
      <PageHeader 
        title="Bill Payments" 
        subtitle="Fetch and pay electricity, gas, water bills instantly in real time." 
        actions={<BharatConnectLogo iconClassName="h-8 w-8" />}
      />

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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {categories.map((c) => {
                  const IconComp = getCategoryIcon(c.category_name);
                  const desc = getCategoryDesc(c.category_name);
                  const colorCls = getCategoryColor(c.category_name);

                  return (
                    <button
                      key={c.id}
                      onClick={() => handleCategoryChange(c.id)}
                      className="flex items-center gap-3.5 text-left p-3.5 bg-white border border-slate-100/90 hover:border-indigo-500/25 rounded-2xl transition-all duration-300 shadow-[0_4px_16px_rgba(0,0,0,0.02)] hover:shadow-[0_16px_24px_-8px_rgba(79,70,229,0.1)] hover:-translate-y-1 group w-full relative overflow-hidden h-[76px]"
                    >
                      {/* Premium subtle inner gradient glow */}
                      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.015] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                      <div className={`p-2.5 rounded-xl border ${colorCls} transition-all duration-300 group-hover:scale-105 shadow-sm shrink-0`}>
                        <IconComp className="h-5 w-5 stroke-[1.8]" />
                      </div>
                      
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 text-xs sm:text-sm tracking-tight leading-snug group-hover:text-indigo-600 transition-colors block truncate">
                          {c.category_name}
                        </span>
                        <span className="text-slate-400 text-[10px] leading-normal font-medium block truncate mt-0.5">
                          {desc}
                        </span>
                      </div>
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
                  .sort((a, b) => a.biller_name.localeCompare(b.biller_name, 'en', { sensitivity: 'base' }))
                  .map((o) => {
                    const logoUrl = getBillerLogoUrl(o.biller_name);

                    return (
                      <button
                        key={o.biller_id}
                        onClick={() => handleOperatorChange(o.biller_id)}
                        className="flex flex-col items-center justify-center text-center p-4 bg-white border border-slate-100/90 hover:border-indigo-500/25 hover:shadow-[0_16px_24px_-8px_rgba(79,70,229,0.1)] hover:-translate-y-1.5 rounded-2xl transition-all duration-300 group w-full relative min-h-[140px] overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.015] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                        {/* Centered Logo Container */}
                        <div className="h-14 w-full flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-105">
                          {renderBillerLogo(o)}
                        </div>
                        
                        <span className="font-extrabold text-slate-900 text-xs sm:text-xs leading-tight group-hover:text-indigo-600 transition-colors block w-full px-1 line-clamp-2">
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

              {/* Right Card: Bill Summary */}
              <div className="w-full">
                {fetchedBill ? (
                  <div className="bg-white border border-slate-200/80 rounded-3xl p-6 lg:p-8 shadow-sm flex flex-col justify-between min-h-[380px] relative overflow-hidden animate-fadeIn">
                    <div className="space-y-4">
                      {/* Header */}
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-3">
                        BILL SUMMARY
                      </h3>

                      {/* Verified Info */}
                      <div className="bg-[#E8F5E9] border border-[#C8E6C9]/80 rounded-2xl p-4 flex flex-col relative overflow-hidden">
                        <span className="text-[9px] font-black uppercase text-[#00966B] tracking-widest block mb-1">
                          VERIFIED INFO
                        </span>
                        <span className={`font-extrabold text-slate-800 tracking-wide ${isMaskedName(fetchedBill.billerResponse?.customerName || fetchedBill.customerName) ? "text-[11px] font-mono leading-relaxed" : "text-sm tracking-tight"}`}>
                          {formatCustomerName(fetchedBill.billerResponse?.customerName || fetchedBill.customerName)}
                        </span>
                        {isMaskedName(fetchedBill.billerResponse?.customerName || fetchedBill.customerName) && (
                          <span className="text-[8.5px] text-[#00966B] font-bold mt-1 tracking-wider leading-none">
                            * NAME PARTIALLY MASKED BY BANK FOR SECURITY
                          </span>
                        )}
                        <div className="absolute right-0 bottom-0 opacity-10 translate-x-1.5 translate-y-1.5 text-[#00966B]">
                          <ShieldCheck className="h-16 w-16 stroke-1.5" />
                        </div>
                      </div>

                      {/* Due Amount */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">DUE AMOUNT</span>
                        <span className="text-xl font-black text-slate-800">
                          {fmtMoney(fetchedBill.billerResponse?.amount || fetchedBill.amount || 0)}
                        </span>
                      </div>

                      {/* Payment Amount Input */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                          PAYMENT AMOUNT (₹)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full bg-[#F8F7F2] border border-neutral-200 focus:border-[#2D6A4F] text-base font-black text-slate-800 rounded-2xl px-4 py-3.5 outline-none transition-colors focus:bg-white"
                          value={payAmount}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "" || /^\d*\.?\d*$/.test(val)) {
                              setPayAmount(val);
                            }
                          }}
                        />
                      </div>

                      {/* Dynamic service charge and total amount details */}
                      {payAmount && parseFloat(payAmount) > 0 && (() => {
                        const charge = getCalculatedCharge(payAmount);
                        const total = parseFloat(payAmount) + charge;
                        return (
                          <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-3.5 space-y-2 text-[11px] font-semibold text-slate-600 animate-fadeIn">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Manual Amount:</span>
                              <span className="text-slate-800 font-bold">{fmtMoney(parseFloat(payAmount))}</span>
                            </div>
                            <div className="flex justify-between items-center text-rose-600">
                              <span>Admin Service Charge (+):</span>
                              <span className="font-bold">{fmtMoney(charge)}</span>
                            </div>
                            <div className="border-t border-slate-200/60 pt-2 flex justify-between items-center text-xs font-black text-slate-900">
                              <span>Total Amount:</span>
                              <span className="text-[#2D6A4F] font-black">{fmtMoney(total)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Over limit warning alert */}
                      {parseFloat(payAmount) > liveBillMaxLimit && (
                        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-[10px] p-3 rounded-2xl animate-fadeIn">
                          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-rose-600" />
                          <span className="font-semibold leading-relaxed">
                            Amount must be less than {fmtMoney(liveBillMaxLimit)} per transaction. Please split your payment.
                          </span>
                        </div>
                      )}

                      {/* Bill details table list */}
                      <div className="space-y-3 pt-2 text-xs border-t border-slate-100">
                        {/* Due Date */}
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[9px]">DUE DATE</span>
                          <span className="text-rose-600 font-extrabold">
                            {fetchedBill.billerResponse?.dueDate || fetchedBill.dueDate || "N/A"}
                          </span>
                        </div>

                        {/* Bill Date */}
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[9px]">BILL DATE</span>
                          <span className="text-slate-800 font-extrabold">
                            {billDate || (fetchedBill.billerResponse?.dueDate ? fmtBillDateFallback(fetchedBill.billerResponse.dueDate) : "—")}
                          </span>
                        </div>

                        {/* Minimum Amount Due */}
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[9px]">MINIMUM AMOUNT DUE</span>
                          <span className="text-slate-800 font-extrabold">
                            {minAmount ? fmtMoney(minAmount) : (dueAmount ? fmtMoney(Math.ceil(dueAmount * 0.05)) : "—")}
                          </span>
                        </div>

                        {/* Current Outstanding */}
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[9px]">CURRENT OUTSTANDING AMOUNT DUE</span>
                          <span className="text-slate-800 font-extrabold">
                            {outstanding ? fmtMoney(outstanding) : (dueAmount ? fmtMoney(dueAmount) : "—")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-5">
                      <button
                        onClick={() => {
                          if (!user?.tpin_hash) {
                            toast.error("Please set up your transaction PIN (TPIN) first in the TPIN Settings.");
                            return;
                          }
                          setTpinArray(["", "", "", ""]);
                          setShowTpinModal(true);
                          setTimeout(() => {
                            pin1Ref.current?.focus();
                          }, 100);
                        }}
                        disabled={loadingPay || parseFloat(payAmount) > liveBillMaxLimit || !payAmount}
                        className="w-full py-3.5 px-4 flex items-center justify-center gap-2 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md bg-[#00966B] hover:bg-[#007f5a] shadow-[#00966B]/15 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                      >
                        {loadingPay ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Processing Payment…
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" /> PAY SECURELY NOW
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
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full border border-slate-100/80 shadow-2xl relative space-y-6">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#E8F5E9] text-[#00966B] rounded-2xl">
                  <ShieldCheck className="h-6 w-6 stroke-[1.8]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">Security Verification</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Enter your 4-digit TPIN to authorize payment</p>
                </div>
              </div>
              
              {/* TPIN 4-digit input slots */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block text-center">
                  ENTER TRANSACTION PIN
                </label>
                <div className="flex justify-center gap-3.5 py-1">
                  {[0, 1, 2, 3].map((idx) => (
                    <input
                      key={idx}
                      ref={tpinRefs[idx]}
                      type="password"
                      maxLength={1}
                      inputMode="numeric"
                      className="w-14 h-14 text-center text-2xl font-black rounded-2xl border-2 border-slate-200 focus:border-[#00966B] focus:ring-4 focus:ring-[#00966B]/5 outline-none transition-all bg-slate-50 focus:bg-white text-slate-800"
                      value={tpinArray[idx]}
                      onChange={(e) => handlePinChange(idx, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(idx, e)}
                      onPaste={handlePinPaste}
                    />
                  ))}
                </div>
              </div>

              {/* Forgot TPIN Helper Link */}
              <div className="text-center border-b border-slate-100 pb-4">
                <span className="text-[10px] text-slate-400 font-bold tracking-tight">
                  Forgot TPIN? Reset it under{" "}
                  <a href="/agent/tpin" className="text-[#00966B] hover:underline font-black">
                    Manage TPIN
                  </a>
                </span>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowTpinModal(false)}
                  className="w-1/2 py-3 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const finalPin = tpinArray.join("");
                    if (finalPin.length !== 4) {
                      toast.error("Please enter a valid 4-digit TPIN");
                      return;
                    }
                    setShowTpinModal(false);
                    payBill(finalPin);
                  }}
                  className="w-1/2 py-3 bg-[#00966B] text-white text-xs font-black rounded-xl hover:bg-[#007f5a] transition-all shadow-md shadow-[#00966B]/15 active:scale-98"
                >
                  Confirm & Pay
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
