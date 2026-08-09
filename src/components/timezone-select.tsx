"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";

type TimeZoneOption = { label: string; value: string };

type TimezoneSelectProps = {
  initialValue: string | null;
  options: TimeZoneOption[];
};

const subscribeToBrowserTimezone = () => () => undefined;

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
}

export function TimezoneSelect({ initialValue, options }: TimezoneSelectProps) {
  const listId = useId();
  const available = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const browserZone = useSyncExternalStore(subscribeToBrowserTimezone, getBrowserTimezone, () => "");
  const detectedValue = !initialValue && available.has(browserZone) ? browserZone : "UTC";
  const [manualValue, setManualValue] = useState<string | null>(null);
  const value = manualValue ?? initialValue ?? detectedValue;

  return (
    <label className="text-sm font-bold">
      Timezone
      <input
        autoComplete="off"
        className="field mt-2"
        list={listId}
        name="timezone"
        onChange={(event) => setManualValue(event.target.value)}
        placeholder="Search IANA timezones"
        required
        type="search"
        value={value}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} label={option.label} value={option.value} />
        ))}
      </datalist>
      <span className="mt-2 block text-xs font-normal text-[#607580]">
        Selected: <strong className="mono">{value || "Choose a timezone"}</strong>
      </span>
    </label>
  );
}
