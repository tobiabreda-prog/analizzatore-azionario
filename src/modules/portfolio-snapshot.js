const finite = value => typeof value === "number" && Number.isFinite(value);
const money = value => value && finite(value.amount) && typeof value.currency === "string" && value.currency ? value : null;
const identity = row => [String(row.exchange || "").toUpperCase(), String(row.symbol || row.originalSymbol || "").toUpperCase()].join("|");
const currencyOf = row => row.currency || row.priceCurrency || money(row.marketValue)?.currency || money(row.commission)?.currency || null;
const sumComplete = (rows, pick) => rows.length && rows.every(row => finite(pick(row))) ? rows.reduce((sum, row) => sum + pick(row), 0) : null;
const close = (a, b, tolerance = 0.02) => finite(a) && finite(b) && Math.abs(a - b) <= tolerance;

function moneySum(rows, key) {
  const values = rows.map(row => money(row[key]));
  if (!values.length || values.some(value => !value) || new Set(values.map(value => value.currency)).size !== 1) return null;
  return { currency: values[0].currency, amount: values.reduce((sum, value) => sum + value.amount, 0) };
}

function reportedBreakdown(rows, key) {
  const groups = new Map();
  const missing = rows.filter(row => !money(row[key])).length;
  for (const row of rows) {
    const value = money(row[key]);
    if (!value) continue;
    const group = groups.get(value.currency) || { currency: value.currency, amount: 0, observations: 0 };
    group.amount += value.amount;
    group.observations += 1;
    groups.set(value.currency, group);
  }
  return [...groups.values()].map(group => ({ ...group, missing, complete: missing === 0 })).sort((a, b) => a.currency.localeCompare(b.currency));
}

function aggregateLots(lots) {
  const first = lots[0];
  const quantity = sumComplete(lots, row => row.quantity);
  const gross = sumComplete(lots, row => finite(row.quantity) && finite(row.openPrice) ? row.quantity * row.openPrice : null);
  const prices = lots.map(row => row.currentPrice);
  const currencies = new Set(lots.map(currencyOf));
  return {
    id: "position:" + identity(first), symbol: first.symbol, originalSymbol: first.originalSymbol,
    name: first.name, exchange: first.exchange, side: lots.every(row => row.side === first.side) ? first.side : null,
    quantity, averagePrice: quantity > 0 && gross != null ? gross / quantity : null,
    currentPrice: prices.every(finite) && prices.every(value => close(value, prices[0], 1e-8)) ? prices[0] : null,
    currency: currencies.size === 1 ? currencyOf(first) : null,
    marketValue: moneySum(lots, "marketValue"), commission: moneySum(lots, "commission"),
    dailyPnl: moneySum(lots, "dailyPnl"), netPnl: moneySum(lots, "netPnl"),
    weightPct: sumComplete(lots, row => row.weightPct), netPnlPct: null, dailyPnlPct: null,
    openDate: null, fields: [], cells: [], derivedFromLots: true
  };
}

function reconcilePosition(row, lots, { hasSummary, hasOpenSection, duplicateSummary }) {
  const messages = [];
  const currency = currencyOf(row);
  const tolerance = Math.max(0.02, lots.length * 0.0051);
  const lotQuantity = sumComplete(lots, lot => lot.quantity);
  if (duplicateSummary) messages.push("Più righe di riepilogo per lo stesso titolo: dati aggregati ambigui.");
  if (hasSummary && hasOpenSection && !lots.length) messages.push("Titolo nel riepilogo senza lotti aperti corrispondenti.");
  if (!hasSummary && hasOpenSection) messages.push("Titolo presente nei lotti aperti e assente dal riepilogo: ricostruito dai lotti.");
  if (hasSummary && lots.length && !close(row.quantity, lotQuantity, 1e-6)) messages.push("Quantità del riepilogo diversa dalla somma dei lotti aperti.");
  const lotValue = moneySum(lots, "marketValue");
  if (hasSummary && lotValue && money(row.marketValue)) {
    if (row.marketValue.currency !== lotValue.currency) messages.push("Valuta del valore di mercato diversa tra riepilogo e lotti.");
    else if (!close(row.marketValue.amount, lotValue.amount, tolerance)) messages.push("Valore di mercato del riepilogo diverso dalla somma dei lotti.");
  }
  if (!currency) messages.push("Valuta di negoziazione non disponibile: calcoli nella valuta del titolo sospesi.");
  if (lots.some(lot => currencyOf(lot) !== currency)) messages.push("Valute di negoziazione non coerenti tra i lotti.");
  if (finite(row.weightPct) && (row.weightPct < 0 || row.weightPct > 100)) messages.push("Peso riportato fuori dall'intervallo 0–100%.");
  if (row.side !== "BUY" || lots.some(lot => lot.side !== "BUY")) messages.push("Calcolo del costo sospeso: posizione diversa da un acquisto long.");
  if (!finite(row.currentPrice) || row.currentPrice <= 0) messages.push("Prezzo corrente assente: valorizzazione calcolata non disponibile.");

  let calculatedMarketValue = finite(row.quantity) && finite(row.currentPrice) && row.quantity >= 0 && row.currentPrice > 0
    ? row.quantity * row.currentPrice : null;
  const observedValue = money(row.marketValue);
  const priceUnitsConsistent = !observedValue || !currency || observedValue.currency !== currency || calculatedMarketValue == null || close(observedValue.amount, calculatedMarketValue, tolerance);
  if (!priceUnitsConsistent) {
    messages.push("Quantità × prezzo non riconcilia il valore di mercato: verificare le unità dello strumento.");
    calculatedMarketValue = null;
  }
  if (observedValue && currency && observedValue.currency !== currency) messages.push("Il valore di mercato è in una valuta diversa dal prezzo: nessuna conversione implicita.");

  const basisRows = lots.length ? lots : [{ ...row, openPrice: row.averagePrice }];
  const grossCostBasis = sumComplete(basisRows, lot => finite(lot.quantity) && lot.quantity >= 0 && finite(lot.openPrice) && lot.openPrice > 0 ? lot.quantity * lot.openPrice : null);
  if (hasSummary && lots.length && close(row.quantity, lotQuantity, 1e-6) && lotQuantity > 0 && finite(row.averagePrice) && grossCostBasis != null && !close(row.averagePrice, grossCostBasis / lotQuantity, 0.0051)) messages.push("Prezzo medio del riepilogo diverso dalla media ponderata dei lotti oltre gli arrotondamenti.");
  const allFeesKnown = basisRows.every(lot => money(lot.commission)?.currency === currency && lot.commission.amount >= 0);
  const commissionTotal = allFeesKnown ? basisRows.reduce((sum, lot) => sum + lot.commission.amount, 0) : null;
  if (!allFeesKnown) messages.push("Commissioni assenti o in valuta diversa: costo netto e P/L calcolato non disponibili.");
  if (hasSummary && lots.length && allFeesKnown && money(row.commission)?.currency === currency && !close(row.commission.amount, commissionTotal, tolerance)) messages.push("Commissioni del riepilogo diverse dalla somma dei lotti.");
  const quantityConsistent = !hasSummary || !lots.length || close(row.quantity, lotQuantity, 1e-6);
  const eligibleCost = currency && priceUnitsConsistent && quantityConsistent && !duplicateSummary && row.side === "BUY"
    && basisRows.every(lot => lot.side === "BUY" && currencyOf(lot) === currency);
  const calculatedCostBasis = eligibleCost && grossCostBasis != null && commissionTotal != null ? grossCostBasis + commissionTotal : null;
  const nativeMarketValue = observedValue?.currency === currency ? observedValue.amount : calculatedMarketValue;
  const calculatedPnl = calculatedCostBasis != null && nativeMarketValue != null ? nativeMarketValue - calculatedCostBasis : null;
  if (money(row.netPnl) && row.netPnl.currency !== currency) messages.push("P/L riportato in " + row.netPnl.currency + ": separato dal P/L calcolato in " + (currency || "valuta non nota") + ".");
  if (row.netPnl?.currency === currency && calculatedPnl != null && !close(row.netPnl.amount, calculatedPnl, tolerance)) messages.push("P/L riportato diverso dal calcolo prezzo/costo/commissioni: possibili arrotondamenti o costi non specificati.");
  return {
    ...row, lots, currency, grossCostBasis: eligibleCost ? grossCostBasis : null,
    calculatedCostBasis, calculatedMarketValue, calculatedPnl,
    reconciliation: { status: messages.length ? "warning" : hasSummary && lots.length ? "matched" : "not_available", messages }
  };
}

function currencyBreakdown(positions) {
  const groups = new Map();
  for (const position of positions) {
    if (!position.currency) continue;
    const rows = groups.get(position.currency) || [];
    rows.push(position);
    groups.set(position.currency, rows);
  }
  return [...groups].map(([currency, rows]) => {
    const pickMarketValue = row => row.marketValue?.currency === currency ? row.marketValue.amount : row.calculatedMarketValue;
    const marketValue = sumComplete(rows, pickMarketValue);
    const costBasis = sumComplete(rows, row => row.calculatedCostBasis);
    const pnl = sumComplete(rows, row => row.calculatedPnl);
    return {
      currency, positions: rows.length, marketValue, costBasis, pnl,
      grossCostBasis: sumComplete(rows, row => row.grossCostBasis),
      marketValueKnown: rows.filter(row => finite(pickMarketValue(row))).length,
      costBasisKnown: rows.filter(row => finite(row.calculatedCostBasis)).length,
      pnlKnown: rows.filter(row => finite(row.calculatedPnl)).length,
      partial: marketValue == null || costBasis == null || pnl == null
    };
  }).sort((a, b) => a.currency.localeCompare(b.currency));
}

const norm = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function checkReportedTotal(totals, labels, rows, key, label, warnings) {
  const total = totals.find(row => labels.includes(norm(row.label)) && money(row.value));
  if (!total || !rows.length) return;
  const sum = moneySum(rows, key);
  if (sum && sum.currency === total.value.currency && !close(sum.amount, total.value.amount, Math.max(0.02, rows.length * 0.0051))) {
    warnings.push(label + " non riconciliato con il totale riportato nel CSV; entrambi i valori originali sono conservati.");
  }
}

/** Read an exported snapshot without inventing FX, fees or a transaction ledger. */
export function buildPortfolioSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.summaryPositions) || !Array.isArray(snapshot.openLots) || !Array.isArray(snapshot.closedLots)) throw new Error("Snapshot portafoglio non valido");
  const summary = snapshot.summaryPositions, open = snapshot.openLots, closed = snapshot.closedLots;
  const warnings = [...(Array.isArray(snapshot.warnings) ? snapshot.warnings : [])];
  const hasSummary = summary.length > 0;
  const hasOpenSection = snapshot.sections?.some(section => section.id === "open") || open.length > 0;
  const lotsByKey = new Map(), summaryByKey = new Map();
  for (const lot of open) lotsByKey.set(identity(lot), [...(lotsByKey.get(identity(lot)) || []), lot]);
  for (const row of summary) summaryByKey.set(identity(row), [...(summaryByKey.get(identity(row)) || []), row]);
  const keys = [...new Set([...summaryByKey.keys(), ...lotsByKey.keys()])];
  const positions = keys.map(key => {
    const summaryRows = summaryByKey.get(key) || [], lots = lotsByKey.get(key) || [];
    const row = summaryRows[0] || aggregateLots(lots);
    const result = reconcilePosition(row, lots, { hasSummary: summaryRows.length > 0, hasOpenSection: hasSummary && hasOpenSection, duplicateSummary: summaryRows.length > 1 });
    if (summaryRows.length > 1) { result.summaryRows = summaryRows; result.marketValue = null; result.calculatedMarketValue = null; }
    for (const message of result.reconciliation.messages) warnings.push((row.symbol || row.name) + ": " + message);
    return result;
  });
  const reportedTotals = Array.isArray(snapshot.totals) ? snapshot.totals : [];
  checkReportedTotal(reportedTotals, ["valore di mercato"], positions, "marketValue", "Valore di mercato", warnings);
  checkReportedTotal(reportedTotals, ["p/l attuale"], positions, "netPnl", "P/L attuale", warnings);
  checkReportedTotal(reportedTotals, ["p/l giornaliero"], positions, "dailyPnl", "P/L giornaliero", warnings);
  checkReportedTotal(reportedTotals, ["profitti/perdite posizioni chiuse"], closed, "netPnl", "P/L delle posizioni chiuse", warnings);
  const weights = positions.filter(row => finite(row.weightPct) && row.weightPct >= 0);
  const largest = weights.reduce((best, row) => !best || row.weightPct > best.weightPct ? row : best, null);
  const weightSumPct = positions.length && weights.length === positions.length ? weights.reduce((sum, row) => sum + row.weightPct, 0) : null;
  if (weightSumPct != null && !close(weightSumPct, 100, Math.max(0.05, positions.length * 0.0051))) warnings.push("La somma dei pesi riportati non è 100%: possibile estratto parziale o dati non riconciliati.");
  return {
    positions, byCurrency: currencyBreakdown(positions), reportedTotals,
    reportedPnlByCurrency: reportedBreakdown(positions, "netPnl"),
    dailyReportedPnlByCurrency: reportedBreakdown(positions, "dailyPnl"),
    closedReportedPnlByCurrency: reportedBreakdown(closed, "netPnl"),
    warnings: [...new Set(warnings)], counts: { positions: positions.length, openLots: open.length, closedLots: closed.length },
    concentration: { largestPosition: largest ? { name: largest.name, symbol: largest.symbol, weightPct: largest.weightPct } : null, weightSumPct }
  };
}
