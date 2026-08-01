import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { Landmark, Search, ShieldAlert } from "lucide-react";

export default function AdminCcBillers() {
  const [banks, setBanks] = useState([]);
  const [search, setSearch] = useState("");
  const [filterEnabled, setFilterEnabled] = useState("all"); // all | enabled | disabled
  const [loading, setLoading] = useState(false);

  const reload = () => {
    setLoading(true);
    api.get("/admin/banks")
      .then((r) => setBanks(r.data))
      .catch((e) => toast.error(formatErr(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const toggleBillPay = async (bank) => {
    const nextVal = !bank.bill_pay_enabled;
    try {
      await api.patch(`/admin/banks/${bank.id}`, { bill_pay_enabled: nextVal });
      toast.success(`${bank.name} Credit Card Payment ${nextVal ? "ENABLED" : "DISABLED"}`);
      
      // Update local state immediately for snappy response
      setBanks((prev) =>
        prev.map((b) => (b.id === bank.id ? { ...b, bill_pay_enabled: nextVal } : b))
      );
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    }
  };

  const filteredBanks = banks.filter((b) => {
    const matchesSearch = b.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filterEnabled === "all" ||
      (filterEnabled === "enabled" && b.bill_pay_enabled) ||
      (filterEnabled === "disabled" && !b.bill_pay_enabled);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Card Billers"
        subtitle="Turn ON/OFF specific credit card biller banks. Disabled banks will not be shown to agents."
      />

      {/* Filter and Search Bar */}
      <div className="mfp-card p-4 flex flex-col md:flex-row items-stretch md:items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search credit card billers..."
            className="w-full pl-10 pr-4 py-3 text-sm font-bold text-neutral-800 bg-[#F8F7F2] border border-black/5 rounded-2xl focus:outline-none focus:border-[#1B4332]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter segment */}
        <div className="flex bg-[#F8F7F2] border border-black/5 rounded-2xl p-1 shrink-0 select-none">
          {[
            { id: "all", label: "All Billers" },
            { id: "enabled", label: "Enabled Only" },
            { id: "disabled", label: "Disabled Only" }
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilterEnabled(opt.id)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                filterEnabled === opt.id
                  ? "bg-white text-[#1B4332] shadow-sm font-black"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Billers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && banks.length === 0 ? (
          <div className="col-span-full py-12 flex justify-center text-neutral-400">
            Loading billers...
          </div>
        ) : filteredBanks.length === 0 ? (
          <div className="col-span-full mfp-card p-12 text-center text-neutral-500 flex flex-col items-center justify-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-neutral-300" />
            <div>No matching credit card biller banks found.</div>
          </div>
        ) : (
          filteredBanks.map((b) => (
            <div
              key={b.id}
              className={`mfp-card p-5 border transition-all flex items-center justify-between gap-4 ${
                b.bill_pay_enabled
                  ? "border-[#1B4332]/10 bg-white"
                  : "border-rose-100 bg-[#FFFDFD] opacity-80"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-2xl transition-all ${
                    b.bill_pay_enabled
                      ? "bg-[#1B4332]/5 text-[#1B4332]"
                      : "bg-rose-50 text-rose-500"
                  }`}
                >
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-extrabold uppercase text-neutral-800 tracking-wide">
                    {b.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        b.bill_pay_enabled ? "bg-emerald-500" : "bg-rose-500 animate-pulse"
                      }`}
                    />
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider ${
                        b.bill_pay_enabled ? "text-emerald-600" : "text-rose-500"
                      }`}
                    >
                      {b.bill_pay_enabled ? "Accepting Payments" : "Service Disabled"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Switch Toggle */}
              <button
                onClick={() => toggleBillPay(b)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  b.bill_pay_enabled ? "bg-[#1B4332]" : "bg-rose-300"
                }`}
                title={
                  b.bill_pay_enabled
                    ? "Service Enabled (Click to Disable)"
                    : "Service Disabled (Click to Enable)"
                }
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    b.bill_pay_enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
