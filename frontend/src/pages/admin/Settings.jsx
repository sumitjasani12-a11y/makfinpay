import React, { useEffect, useState } from "react";
import { PageHeader } from "@/components/Shared";
import FileUpload from "@/components/FileUpload";
import { api, formatErr, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Save, ShieldAlert } from "lucide-react";

export default function AdminSettings() {
  const { branding, fetchBranding } = useAuth();

  // limits settings
  const [minLimit, setMinLimit] = useState("");
  const [maxLimit, setMaxLimit] = useState("");
  const [liveBillMaxLimit, setLiveBillMaxLimit] = useState("");
  const [apiCharge, setApiCharge] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(() => {
    try {
      const v = localStorage.getItem("set_maintenance_mode");
      return v !== null ? JSON.parse(v) : false;
    } catch (e) { return false; }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // branding settings
  const [logoPath, setLogoPath] = useState("");
  const [faviconPath, setFaviconPath] = useState("");
  const [logoCollapsedPath, setLogoCollapsedPath] = useState("");
  const [watermarkPath, setWatermarkPath] = useState("");
  const [savingBranding, setSavingBranding] = useState(false);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get("/admin/settings/recharge-limits");
      setMinLimit(String(data.min_recharge_limit ?? 100));
      setMaxLimit(String(data.max_recharge_limit ?? 300000));
      setLiveBillMaxLimit(String(data.live_bill_max_limit ?? 100000));
      setApiCharge(String(data.live_bill_api_charge ?? 0));
      const mm = !!data.maintenance_mode;
      setMaintenanceMode(mm);
      try { localStorage.setItem("set_maintenance_mode", JSON.stringify(mm)); } catch (e) {}
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (branding) {
      setLogoPath(branding.logo_path || "");
      setFaviconPath(branding.favicon_path || "");
      setLogoCollapsedPath(branding.logo_collapsed_path || "");
      setWatermarkPath(branding.watermark_path || "");
    }
  }, [branding]);

  const handleSave = async (e) => {
    e.preventDefault();
    const minVal = parseFloat(minLimit);
    const maxVal = parseFloat(maxLimit);
    const liveBillMaxVal = parseFloat(liveBillMaxLimit);
    const chargeVal = parseFloat(apiCharge);

    if (Number.isNaN(minVal) || minVal <= 0) {
      return toast.error("Minimum limit must be a number greater than 0");
    }
    if (Number.isNaN(maxVal) || maxVal <= 0) {
      return toast.error("Maximum limit must be a number greater than 0");
    }
    if (maxVal < minVal) {
      return toast.error("Maximum limit cannot be less than minimum limit");
    }
    if (Number.isNaN(liveBillMaxVal) || liveBillMaxVal <= 0) {
      return toast.error("Live Bill maximum limit must be a number greater than 0");
    }
    if (Number.isNaN(chargeVal) || chargeVal < 0) {
      return toast.error("API Charge must be a positive number or zero");
    }

    setSaving(true);
    try {
      await api.put("/admin/settings/recharge-limits", {
        min_recharge_limit: minVal,
        max_recharge_limit: maxVal,
        live_bill_max_limit: liveBillMaxVal,
      });
      await api.put("/admin/settings/recharge-toggles", {
        live_bill_api_charge: chargeVal,
      });
      toast.success("Limits saved successfully");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to save limits settings");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMaintenance = async (val) => {
    setMaintenanceMode(val);
    try {
      await api.put("/admin/settings/recharge-toggles", {
        maintenance_mode: val,
      });
      toast.success(`Maintenance Mode ${val ? "Enabled" : "Disabled"}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to update maintenance mode");
      setMaintenanceMode(!val);
    }
  };

  const handleSaveBranding = async (e) => {
    e.preventDefault();
    setSavingBranding(true);
    try {
      await api.put("/admin/settings/branding", {
        logo_path: logoPath,
        favicon_path: faviconPath,
        logo_collapsed_path: logoCollapsedPath,
        watermark_path: watermarkPath
      });
      fetchBranding();
      toast.success("Branding saved successfully");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to save branding preferences");
    } finally {
      setSavingBranding(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage global application preferences, configuration limits, and branding options dynamically."
      />

      {loading ? (
        <div className="flex justify-center items-center py-12 text-sm text-neutral-500">
          Loading settings…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="w-full space-y-6">
            <form onSubmit={handleSave} className="w-full">
              <div className="mfp-card p-6 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-neutral-800 border-b border-black/5 pb-2.5 mb-4">
                  Recharge Wallet Limits
                </h3>
                <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
                  Configure the allowed range for recharge requests submitted by agents. 
                  These limits are validated on the client and server side.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="mfp-label font-bold text-neutral-600">
                    Minimum Limit (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400 font-bold text-xs pointer-events-none">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={minLimit}
                      onChange={(e) => setMinLimit(e.target.value)}
                      className="mfp-input !pl-9"
                      placeholder="100.00"
                      data-testid="settings-min-limit"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="mfp-label font-bold text-neutral-600">
                    Maximum Limit (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400 font-bold text-xs pointer-events-none">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={maxLimit}
                      onChange={(e) => setMaxLimit(e.target.value)}
                      className="mfp-input !pl-9"
                      placeholder="300000.00"
                      data-testid="settings-max-limit"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-amber-50/60 border border-amber-500/10 rounded-2xl p-4 flex gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 leading-relaxed font-medium">
                  Changing these limits will immediately restrict agents from submitting UTR recharge requests 
                  below the minimum or above the maximum limit.
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-neutral-800 border-b border-black/5 pb-2.5 mb-4 mt-6">
                  Live Bill API Settings
                </h3>
                <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
                  Configure the API charge deducted per transaction for live utility bill payments.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="mfp-label font-bold text-neutral-600">
                    Live Bill API Charge per txn (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400 font-bold text-xs pointer-events-none">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={apiCharge}
                      onChange={(e) => setApiCharge(e.target.value)}
                      className="mfp-input !pl-9"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="mfp-label font-bold text-neutral-600">
                    Live Bill Maximum Limit (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400 font-bold text-xs pointer-events-none">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={liveBillMaxLimit}
                      onChange={(e) => setLiveBillMaxLimit(e.target.value)}
                      className="mfp-input !pl-9"
                      placeholder="100000.00"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-black/5 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="mfp-btn-primary inline-flex items-center gap-2"
                  data-testid="settings-save-btn"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving Limits…" : "Save Limits"}
                </button>
              </div>
            </div>
          </form>

            <div className="mfp-card p-6 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-neutral-800 border-b border-black/5 pb-2.5 mb-4">
                  System Status & Maintenance
                </h3>
                <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
                  Put the application under maintenance mode. When active, all non-admin users (agents, distributors, master distributors) will be blocked from accessing services and shown a maintenance screen.
                </p>
              </div>
              
              <div className="flex items-center justify-between bg-neutral-50/50 border border-neutral-100 rounded-2xl p-4">
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-neutral-800">Maintenance Mode</div>
                  <div className="text-xs text-neutral-400">Temporarily suspend all user activity for updates.</div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider ${maintenanceMode ? "text-rose-600" : "text-emerald-600"}`}>
                    {maintenanceMode ? "ACTIVE (UNDER MAINTENANCE)" : "OFF (LIVE)"}
                  </span>
                  <button
                    onClick={() => handleToggleMaintenance(!maintenanceMode)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      maintenanceMode ? "bg-rose-600" : "bg-neutral-200"
                    }`}
                    type="button"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        maintenanceMode ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveBranding} className="w-full">
            <div className="mfp-card p-6 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-neutral-800 border-b border-black/5 pb-2.5 mb-4">
                  Branding Preferences
                </h3>
                <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
                  Customize the look and feel of the platform panels. Upload assets for logos, favicon, and dashboard watermark.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="mfp-label font-bold text-neutral-600 block">
                    Main Sidebar Logo
                  </label>
                  {logoPath ? (
                    <div className="h-16 w-full bg-slate-900 rounded-2xl p-2.5 flex items-center justify-center border border-white/5 select-none">
                      <img src={fileUrl(logoPath)} alt="Logo Preview" className="h-full object-contain" />
                    </div>
                  ) : (
                    <div className="h-16 w-full bg-slate-900 rounded-2xl border border-white/5 flex items-center justify-center text-[10px] font-bold text-white/40 uppercase tracking-wider select-none">
                      Default Logo
                    </div>
                  )}
                  <FileUpload
                    label="Upload Main Logo"
                    onUploaded={setLogoPath}
                    accept="image/*"
                    testid="upload-logo-main"
                  />
                </div>

                <div className="space-y-2">
                  <label className="mfp-label font-bold text-neutral-600 block">
                    Sidebar Collapsed Logo
                  </label>
                  {logoCollapsedPath ? (
                    <div className="h-16 w-full bg-slate-900 rounded-2xl p-2.5 flex items-center justify-center border border-white/5 select-none">
                      <img src={fileUrl(logoCollapsedPath)} alt="Collapsed Logo Preview" className="h-full object-contain" />
                    </div>
                  ) : (
                    <div className="h-16 w-full bg-slate-900 rounded-2xl border border-white/5 flex items-center justify-center text-[10px] font-bold text-white/40 uppercase tracking-wider select-none">
                      Default Collapsed Logo
                    </div>
                  )}
                  <FileUpload
                    label="Upload Collapsed Logo"
                    onUploaded={setLogoCollapsedPath}
                    accept="image/*"
                    testid="upload-logo-collapsed"
                  />
                </div>

                <div className="space-y-2">
                  <label className="mfp-label font-bold text-neutral-600 block">
                    Browser Favicon
                  </label>
                  {faviconPath ? (
                    <div className="h-16 w-full bg-neutral-50 rounded-2xl p-2 flex items-center justify-center border border-black/5 select-none">
                      <img src={fileUrl(faviconPath)} alt="Favicon Preview" className="h-8 w-8 object-contain" />
                    </div>
                  ) : (
                    <div className="h-16 w-full bg-neutral-50 rounded-2xl border border-black/5 flex items-center justify-center text-[10px] font-bold text-neutral-400 uppercase tracking-wider select-none">
                      Default Favicon
                    </div>
                  )}
                  <FileUpload
                    label="Upload Favicon"
                    onUploaded={setFaviconPath}
                    accept="image/x-icon,image/png,image/jpeg"
                    testid="upload-favicon"
                  />
                </div>

                <div className="space-y-2">
                  <label className="mfp-label font-bold text-neutral-600 block">
                    Dashboard Watermark Logo
                  </label>
                  {watermarkPath ? (
                    <div className="h-16 w-full bg-neutral-50 rounded-2xl p-2 flex items-center justify-center border border-black/5 select-none">
                      <img src={fileUrl(watermarkPath)} alt="Watermark Preview" className="h-full object-contain opacity-40" />
                    </div>
                  ) : (
                    <div className="h-16 w-full bg-neutral-50 rounded-2xl border border-black/5 flex items-center justify-center text-[10px] font-bold text-neutral-400 uppercase tracking-wider select-none">
                      No Watermark
                    </div>
                  )}
                  <FileUpload
                    label="Upload Watermark"
                    onUploaded={setWatermarkPath}
                    accept="image/*"
                    testid="upload-watermark"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-black/5 flex justify-end">
                <button
                  type="submit"
                  disabled={savingBranding}
                  className="mfp-btn-primary inline-flex items-center gap-2"
                  data-testid="branding-save-btn"
                >
                  <Save className="h-4 w-4" />
                  {savingBranding ? "Saving Branding…" : "Save Branding"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
