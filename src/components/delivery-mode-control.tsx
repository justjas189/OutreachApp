import { setDeliveryModeAction } from "@/app/(admin)/dashboard/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type { EmailMode } from "@/lib/env";
import { isModeAllowedByDeployment } from "@/lib/settings/delivery-mode";

type DeliveryModeControlProps = {
  currentMode: EmailMode;
  deploymentMode: EmailMode;
};

const modes: Array<{ mode: EmailMode; title: string; description: string }> = [
  { mode: "preview", title: "Preview", description: "No Gmail operations." },
  { mode: "draft", title: "Draft", description: "Create Gmail drafts only." },
  { mode: "live", title: "Live", description: "Send approved, eligible email." },
];

const liveConfirmation = `Enable Live Mode?\n\nApproved and eligible queued emails may be sent through connected Gmail accounts.\n\nDeployment recipient safety and suppression rules will still be enforced.`;

export function DeliveryModeControl({ currentMode, deploymentMode }: DeliveryModeControlProps) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {modes.map(({ mode, title, description }) => {
          const selected = currentMode === mode;
          const allowed = isModeAllowedByDeployment(mode, deploymentMode);
          const interaction = "cursor-pointer shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563a6] focus-visible:ring-offset-2 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";
          const className = mode === "live"
            ? `min-h-28 rounded-xl border p-4 text-left ${interaction} ${selected ? "border-red-500 bg-red-50 ring-2 ring-red-200" : "border-[#d4ddd9] bg-white hover:border-red-300 hover:bg-red-50/40"}`
            : mode === "preview"
              ? `min-h-28 rounded-xl border p-4 text-left ${interaction} ${selected ? "border-[#35a06f] bg-[#eef8f2] ring-2 ring-[#d9eee5]" : "border-[#d4ddd9] bg-white hover:border-[#35a06f] hover:bg-[#eef8f2]/50"}`
              : `min-h-28 rounded-xl border p-4 text-left ${interaction} ${selected ? "border-[#ed7b3a] bg-[#fff8e8] ring-2 ring-[#f8dfba]" : "border-[#d4ddd9] bg-white hover:border-[#ed7b3a] hover:bg-[#fff8e8]/50"}`;

          return (
            <form action={setDeliveryModeAction} key={mode}>
              <input name="mode" type="hidden" value={mode} />
              {mode === "live" ? (
                <ConfirmSubmitButton
                  aria-pressed={selected}
                  className={`${className} w-full`}
                  confirmation={liveConfirmation}
                  disabled={selected || !allowed}
                >
                  <span className="block font-extrabold">{title}</span>
                  <span className="mt-2 block text-xs font-normal leading-5 text-[#526873]">{description}</span>
                </ConfirmSubmitButton>
              ) : (
                <button
                  aria-pressed={selected}
                  className={`${className} w-full`}
                  disabled={selected || !allowed}
                  type="submit"
                >
                  <span className="block font-extrabold">{title}</span>
                  <span className="mt-2 block text-xs font-normal leading-5 text-[#526873]">{description}</span>
                </button>
              )}
            </form>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#607580]">
        Deployment ceiling: <strong className="mono uppercase">{deploymentMode}</strong>. Modes above it stay disabled even for admins.
      </p>
    </div>
  );
}
