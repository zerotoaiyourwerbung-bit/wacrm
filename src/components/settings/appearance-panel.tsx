"use client";

import { Check, Palette } from "lucide-react";
import { SettingsPanelHead } from "./settings-panel-head";

export function AppearancePanel() {
  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Appearance & Theme"
        description="Your CRM is configured with the bespoke Vizora Forest-Green & Crisp Light theme."
      />

      <div className="rounded-xl border border-[#E5EAE7] bg-white p-6 shadow-xs">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700">
              <Palette className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Vizora Forest-Green & Crisp Light
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Deep pine forest navigation with high-contrast light workspace and emerald accents.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 text-xs font-bold text-emerald-700">
            <Check className="size-3.5" />
            <span>Active System Theme</span>
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 border-t border-gray-100 text-xs">
          <div className="rounded-lg bg-[#0C2B24] p-3 text-white">
            <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">Sidebar</span>
            <p className="mt-1 font-bold text-sm">#0C2B24</p>
            <p className="text-[11px] text-[#8FA8A0]">Deep Pine Green</p>
          </div>
          <div className="rounded-lg bg-[#F4F7F5] p-3 text-gray-800 border border-[#E4E9E6]">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Canvas</span>
            <p className="mt-1 font-bold text-sm">#F4F7F5</p>
            <p className="text-[11px] text-gray-500">Soft Crisp Off-White</p>
          </div>
          <div className="rounded-lg bg-emerald-500 p-3 text-white">
            <span className="text-[10px] font-semibold text-emerald-100 uppercase tracking-wider">Accent</span>
            <p className="mt-1 font-bold text-sm">#10B981</p>
            <p className="text-[11px] text-emerald-100">Vibrant Mint</p>
          </div>
        </div>
      </div>
    </section>
  );
}
