const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Stat value at progress `t` (0 to 1) of a count-up: every number in `value` scales from 0, keeping
 * its separators, decimals and surrounding text ("800+" at 0.5 is "400+"). Years (1900 to 2099) stay as they are.
 */
export function countUp(value: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  return value.replace(NUMBER, (raw) => {
    if (/^(19|20)\d\d$/.test(raw)) return raw;
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const target = Number(raw.replace(/,/g, ""));
    const n = k >= 1 ? target : Math.round(target * k * 10 ** decimals) / 10 ** decimals;
    const fixed = n.toFixed(decimals);
    return raw.includes(",") ? Number(fixed).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : fixed;
  });
}
