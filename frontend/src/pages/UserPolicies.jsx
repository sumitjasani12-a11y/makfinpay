import React, { useEffect, useState } from "react";
import { api, formatErr } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { toast } from "sonner";
import { FileText, ShieldCheck } from "lucide-react";

export default function UserPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/policies/active")
      .then((r) => setPolicies(r.data || []))
      .catch((e) => toast.error(formatErr(e.response?.data?.detail) || "Failed to load policies"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="overflow-x-hidden relative animate-fadeIn">
      <PageHeader
        title="Rules & Policy Management"
        subtitle="Please read and adhere to our platform guidelines, terms of service, and operational rules."
      />

      <div className="bg-white border border-black/5 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-black/5 pb-4 mb-5">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-800">Platform Policies</h3>
            <p className="text-xs text-neutral-400">Official terms and operational guidelines</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-xs text-neutral-400 font-bold">
            Loading policies and rules...
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-10 text-xs text-neutral-400 italic">
            No platform policies are active at the moment.
          </div>
        ) : (
          <div className="space-y-6 divide-y divide-black/5">
            {policies.map((p, idx) => (
              <div key={p.id} className="pt-6 first:pt-0 animate-fadeIn">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-1.5 h-1.5 bg-[#4F46E5] rounded-full" />
                  <h4 className="text-sm font-black text-neutral-800 tracking-wide uppercase">
                    {p.title}
                  </h4>
                </div>
                <p className="text-xs text-neutral-600 font-medium whitespace-pre-wrap leading-relaxed pl-4">
                  {p.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
