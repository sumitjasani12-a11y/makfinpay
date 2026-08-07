import React, { useEffect, useState, useMemo } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { 
  Layers, Search, CheckCircle2, XCircle, Power, RefreshCw,
  Lightbulb, Smartphone, Car, Flame, Wifi, Tv,
  ShieldCheck, GraduationCap, Landmark, Droplet,
  Home, UserCheck, FileText, Zap, PlaySquare,
  CreditCard, Receipt
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

export default function AdminBillerCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [togglingCat, setTogglingCat] = useState(null);
  const [bulkToggling, setBulkToggling] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/biller-categories");
      setCategories(res.data?.data || []);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to fetch biller categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleToggle = async (catName, currentStatus) => {
    const newStatus = !currentStatus;
    setTogglingCat(catName);
    try {
      await api.post("/admin/biller-categories/toggle", {
        category_name: catName,
        enabled: newStatus
      });
      setCategories((prev) =>
        prev.map((c) => (c.category_name === catName ? { ...c, enabled: newStatus } : c))
      );
      toast.success(`'${catName}' category ${newStatus ? "enabled" : "disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update category");
    } finally {
      setTogglingCat(null);
    }
  };

  const handleToggleAll = async (targetState) => {
    setBulkToggling(true);
    try {
      await api.post("/admin/biller-categories/toggle-all", { enabled: targetState });
      setCategories((prev) => prev.map((c) => ({ ...c, enabled: targetState })));
      toast.success(`All biller categories ${targetState ? "enabled" : "disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to bulk update categories");
    } finally {
      setBulkToggling(false);
    }
  };

  const stats = useMemo(() => {
    const total = categories.length;
    const enabled = categories.filter((c) => c.enabled).length;
    const disabled = total - enabled;
    return { total, enabled, disabled };
  }, [categories]);

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const matchesSearch = c.category_name.toLowerCase().includes(q.toLowerCase().trim());
      const matchesFilter =
        filterStatus === "all" ||
        (filterStatus === "enabled" && c.enabled) ||
        (filterStatus === "disabled" && !c.enabled);
      return matchesSearch && matchesFilter;
    });
  }, [categories, q, filterStatus]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Biller Categories"
        subtitle="Manage ON/OFF visibility of live bill payment service categories for agents."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleAll(true)}
              disabled={bulkToggling}
              className="py-2 px-3.5 flex items-center gap-1.5 text-xs font-bold rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Enable All
            </button>
            <button
              onClick={() => handleToggleAll(false)}
              disabled={bulkToggling}
              className="py-2 px-3.5 flex items-center gap-1.5 text-xs font-bold rounded-xl border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              <XCircle className="h-4 w-4 text-rose-600" /> Disable All
            </button>
          </div>
        }
      />

      {/* Metrics Header Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="mfp-card p-5 bg-white border-l-4 border-indigo-500 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total Biller Categories</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{stats.total}</div>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        <div className="mfp-card p-5 bg-white border-l-4 border-emerald-500 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Active (ON) Categories</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{stats.enabled}</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>

        <div className="mfp-card p-5 bg-white border-l-4 border-rose-500 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Disabled (OFF) Categories</div>
            <div className="text-2xl font-black text-rose-600 mt-1">{stats.disabled}</div>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
            <XCircle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mfp-card p-4 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full sm:w-auto">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
            <Search className="h-4 w-4 text-neutral-400" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Biller Category..."
            className="mfp-input !pl-11 bg-neutral-50/50 text-xs py-2 w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterStatus === "all"
                ? "bg-slate-800 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilterStatus("enabled")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterStatus === "enabled"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Enabled ({stats.enabled})
          </button>
          <button
            onClick={() => setFilterStatus("disabled")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterStatus === "disabled"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Disabled ({stats.disabled})
          </button>
        </div>
      </div>

      {/* Category Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-7 w-7 text-emerald-600 animate-spin" />
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="mfp-card p-12 text-center text-neutral-400 bg-white">
          No categories found matching your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCategories.map((cat) => {
            const Icon = getCategoryIcon(cat.category_name);
            const isToggling = togglingCat === cat.category_name;

            return (
              <div
                key={cat.category_name}
                className={`mfp-card p-4 transition-all duration-200 bg-white border flex flex-col justify-between ${
                  cat.enabled
                    ? "border-slate-200/80 shadow-xs hover:shadow-md"
                    : "border-rose-200 bg-rose-50/20 opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-2xl shrink-0 ${
                        cat.enabled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-neutral-100 text-neutral-400"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-800 leading-snug">
                        {cat.category_name}
                      </h3>
                      <span className="text-[11px] font-semibold text-neutral-400 block mt-0.5">
                        {cat.biller_count} Billers Available
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      cat.enabled
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {cat.enabled ? "ACTIVE (ON)" : "DISABLED (OFF)"}
                  </span>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    disabled={isToggling}
                    onClick={() => handleToggle(cat.category_name, cat.enabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      cat.enabled ? "bg-emerald-600" : "bg-neutral-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        cat.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
