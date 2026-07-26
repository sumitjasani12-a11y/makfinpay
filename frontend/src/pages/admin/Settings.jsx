import React from "react";
import { PageHeader } from "@/components/Shared";
import { Wrench } from "lucide-react";

export default function AdminSettings() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage global application preferences and configurations."
      />

      <div className="mfp-card p-12 flex flex-col items-center justify-center text-center space-y-4">
        <div className="bg-amber-50 text-amber-600 p-4 rounded-full border border-amber-200/50">
          <Wrench className="h-10 w-10 animate-bounce" />
        </div>
        
        <h3 className="text-xl font-bold text-neutral-800">Under Maintenance</h3>
        
        <p className="text-sm text-neutral-500 max-w-md leading-relaxed">
          The settings panel is currently undergoing scheduled updates to bring you advanced configuration controls. Please check back later.
        </p>

        <div className="text-xs text-neutral-400 font-mono mt-4">
          Status: CONFIGURATION_LOCK_ACTIVE
        </div>
      </div>
    </div>
  );
}
