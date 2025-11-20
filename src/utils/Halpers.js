const addTimeHours = (hoursArray = []) => {
  let totalMinutes = 0;

  for (const entry of hoursArray) {
    const { hours, minutes } = parseHourEntry(entry);
    totalMinutes += hours * 60 + minutes;
  }

  const finalHours = Math.floor(totalMinutes / 60);
  const finalMinutes = totalMinutes % 60;
  return `${finalHours}.${String(finalMinutes).padStart(2, "0")}`;
};

// Convert HH.MM → decimal hours
const toDecimalHours = (value) => {
  if (value === null || value === undefined) return 0;

  // if number like 17.15
  if (typeof value === "number") {
    // Use parseHourEntry to handle numbers robustly
    const { hours, minutes } = parseHourEntry(value);
    return hours + minutes / 60;
  }

  // string "H.MM" or "H:MM"
  if (typeof value === "string") {
    if (value.includes(":")) {
      const [h, m] = value.split(":").map((x) => parseInt(x, 10) || 0);
      return h + m / 60;
    }
    const [hStr, mStr] = value.split(".");
    const hours = parseInt(hStr, 10) || 0;
    const minutes = parseInt(mStr, 10) || 0;
    return hours + minutes / 60;
  }

  return 0;
};

function parseHourEntry(val) {
  if (val === null || val === undefined) return { hours: 0, minutes: 0 };

  // if value is string "HH:MM"
  if (typeof val === "string" && val.includes(":")) {
    const [hStr, mStr] = val.split(":");
    const hours = parseInt(hStr, 10) || 0;
    const minutes = parseInt(mStr, 10) || 0;
    return { hours, minutes };
  }

  // Convert to number
  const n = Number(val);
  if (Number.isNaN(n)) return { hours: 0, minutes: 0 };

  const hrs = Math.floor(n);
  // fractional part interpreted as minutes *100 (e.g., 0.30 -> 30)
  const frac = n - hrs;
  const mins = Math.round(frac * 100);

  // handle overflowed minutes (>59) by rolling into hours
  const extraHours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return { hours: hrs + extraHours, minutes };
}

module.exports = { toDecimalHours, addTimeHours };
