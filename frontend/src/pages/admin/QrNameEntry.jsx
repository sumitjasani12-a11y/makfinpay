import React from "react";
import { PageHeader } from "@/components/Shared";
import { Hammer } from "lucide-react";

export default function AdminQrNameEntry() {
  return (
    <div>
      <PageHeader title="QR Name Entry" subtitle="Configure and manage custom QR Name mapping." />
      <div className="mfp-card p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
        <div className="rounded-full bg-amber-50 p-4 text-amber-600 mb-4">
          <Hammer className="h-12 w-12 animate-bounce" />
        </div>
        <h2 className="text-xl font-semibold text-neutral-800">Under Maintenance</h2>
        <p className="text-neutral-500 mt-2 max-w-md">
          This section is currently under development. Please check back later.
        </p>
      </div>
    </div>
  );
}
