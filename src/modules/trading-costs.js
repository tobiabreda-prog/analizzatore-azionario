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

export function minimumCapitalForOrder({minNotional=MIN_INVESTMENT_NOTIONAL,fixedFee=0,feeBps=0,buyTaxBps=0}={}) {
  for (const value of [minNotional,fixedFee,feeBps,buyTaxBps]) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error("Parametri di costo non validi");
    }
  }
  return minNotional * (1 + (feeBps + buyTaxBps) / 10000) + fixedFee;
}

export function formatItalianInteger(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n.d.";
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
