export const MIN_INVESTMENT_NOTIONAL = 5000;

export const FINECO_DEFAULT_FEES = Object.freeze({
  EUR: 19.00,
  USD: 12.95
});

export function defaultFinecoFee(currency) {
  const code = String(currency || "").toUpperCase();
  return Object.prototype.hasOwnProperty.call(FINECO_DEFAULT_FEES, code)
    ? FINECO_DEFAULT_FEES[code]
    : 0;
}

// Italian FTT rates effective from 1 January 2026.
// The regulated-market rate is half the statutory 0.40% rate.
export const ITALIAN_FTT_BPS_2026 = Object.freeze({
  REGULATED: 20,
  OTC: 40
});
