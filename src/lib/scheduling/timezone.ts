const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

function dateTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    dateTimeFormatter(timeZone).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseLocalDateTime(value: string): LocalParts {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) throw new Error("Choose a valid local date and time.");
  const [, year, month, day, hour, minute] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute) };
  const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (
    candidate.getUTCFullYear() !== parts.year || candidate.getUTCMonth() !== parts.month - 1 ||
    candidate.getUTCDate() !== parts.day || candidate.getUTCHours() !== parts.hour || candidate.getUTCMinutes() !== parts.minute
  ) throw new Error("Choose a valid calendar date and time.");
  return parts;
}

function partsAt(instant: Date, timeZone: string): LocalParts {
  const entries = Object.fromEntries(
    dateTimeFormatter(timeZone).formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return { year: entries.year, month: entries.month, day: entries.day, hour: entries.hour, minute: entries.minute };
}

function sameParts(left: LocalParts, right: LocalParts): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute;
}

export function localDateTimeToUtc(value: string, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) throw new Error("Choose a valid IANA timezone.");
  const desired = parseLocalDateTime(value);
  const nominalUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
  let guess = nominalUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const shown = partsAt(new Date(guess), timeZone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    guess += nominalUtc - shownAsUtc;
  }

  const matches: number[] = [];
  for (let offsetMinutes = -180; offsetMinutes <= 180; offsetMinutes += 15) {
    const instant = guess + offsetMinutes * 60_000;
    if (sameParts(partsAt(new Date(instant), timeZone), desired)) matches.push(instant);
  }
  const unique = [...new Set(matches)];
  if (unique.length !== 1) {
    throw new Error(unique.length === 0
      ? "That local time does not exist in the selected timezone."
      : "That local time is ambiguous in the selected timezone. Choose another time.");
  }
  return new Date(unique[0]);
}

export function formatInTimeZone(isoValue: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(isoValue));
}

export function formatForDateTimeLocal(isoValue: string, timeZone: string): string {
  const parts = partsAt(new Date(isoValue), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}
