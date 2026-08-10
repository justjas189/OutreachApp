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
          const className = mode === "live"
            ? `min-h-28 rounded-xl border p-4 text-left transition ${selected ? "border-red-500 bg-red-50 ring-2 ring-red-200" : "border-[#d4ddd9] bg-white"}`
            : mode === "preview"
              ? `min-h-28 rounded-xl border p-4 text-left transition ${selected ? "border-[#35a06f] bg-[#eef8f2] ring-2 ring-[#d9eee5]" : "border-[#d4ddd9] bg-white"}`
              : `min-h-28 rounded-xl border p-4 text-left transition ${selected ? "border-[#ed7b3a] bg-[#fff8e8] ring-2 ring-[#f8dfba]" : "border-[#d4ddd9] bg-white"}`;

          return (
            <form action={setDeliveryModeAction} key={mode}>
              <input name="mode" type="hidden" value={mode} />
              {mode === "live" ? (
                <ConfirmSubmitButton
                  aria-pressed={selected}
                  className={`${className} w-full disabled:cursor-not-allowed disabled:opacity-45`}
                  confirmation={liveConfirmation}
                  disabled={selected || !allowed}
                >
                  <span className="block font-extrabold">{title}</span>
                  <span className="mt-2 block text-xs font-normal leading-5 text-[#526873]">{description}</span>
                </ConfirmSubmitButton>
              ) : (
                <button
                  aria-pressed={selected}
                  className={`${className} w-full disabled:cursor-not-allowed disabled:opacity-45`}
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
