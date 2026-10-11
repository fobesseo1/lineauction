// Missing-listing rules for Onbid. A condition absent from a complete list pass is "needs-recheck"
// on the first KST day and "closed" once it has been absent on two different days; it returns to
// "observed" if it reappears. Days are counted as distinct dates, so a second run on the same day
// never advances the streak.
export const CLOSE_AFTER_DAYS = 2;

export function trackMissing(previous, dbKeys, listedKeys, day) {
  const listed = new Set(listedKeys), missing = {}, recheck = [], closed = [], restored = [];
  for (const key of dbKeys) {
    if (listed.has(key)) { if (previous[key]) restored.push(key); continue; }
    const days = [...new Set([...(previous[key]?.days ?? []), day])].sort();
    missing[key] = { days };
    (days.length >= CLOSE_AFTER_DAYS ? closed : recheck).push(key);
  }
  return { missing, recheck, closed, restored };
}
