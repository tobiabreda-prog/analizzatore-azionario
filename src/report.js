// Report stampabile: HTML autonomo (A4, colori adatti alla carta) + apertura della finestra di stampa.
// Su Android usa il plugin nativo "PrintReport" (aggiunto in fase di build); sul web ricade su window.print().
import { registerPlugin, Capacitor } from "@capacitor/core";

const PrintReport = registerPlugin("PrintReport");

const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = (x) => typeof x === "number" && isFinite(x);
const nf = (n, d = 2) => (!isNum(n) ? "n.d." : n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }));
const cf = (n) => (!isNum(n) ? "n.d." : n.toLocaleString("it-IT", { notation: "compact", maximumFractionDigits: 2 }));
const pf = (n) => (!isNum(n) ? "n.d." : (n > 0 ? "+" : "") + nf(n) + "%");
const mf = (n) => (!isNum(n) ? "n.d." : nf(n, Math.abs(n) >= 100 ? 0 : 1)); // milioni

const LABEL_HEX = { COMPRARE: ["#047857", "#ffffff"], ACCUMULARE: ["#4d7c0f", "#ffffff"], MANTENERE: ["#fbbf24", "#1e293b"], EVITARE: ["#c2410c", "#ffffff"], VENDERE: ["#b91c1c", "#ffffff"], "n.d.": ["#475569", "#ffffff"] };

function priceChartSvg(tech) {
  const rows = (tech || []).filter((r) => isNum(r.c));
  if (rows.length < 3) return "";
  const W = 640, H = 190, L = 44, R = 8, T = 10, B = 22;
  const all = rows.flatMap((r) => [r.c, r.s50, r.s200]).filter(isNum);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = (i) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (key) => {
    let d = "", pen = false;
    rows.forEach((r, i) => { if (!isNum(r[key])) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(r[key]).toFixed(1)} `; pen = true; });
    return d;
  };
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => { const v = lo + (hi - lo) * t; return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="#475569">${esc(nf(v, v >= 100 ? 0 : 2))}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Andamento del prezzo">
${grid}
<path d="${path("s200")}" fill="none" stroke="#b91c1c" stroke-width="1.4" stroke-dasharray="4 3"/>
<path d="${path("s50")}" fill="none" stroke="#b45309" stroke-width="1.4"/>
<path d="${path("c")}" fill="none" stroke="#1d4ed8" stroke-width="2"/>
<text x="${L}" y="${H - 6}" font-size="9" fill="#475569">${esc(rows[0].d)}</text>
<text x="${W - R}" y="${H - 6}" font-size="9" text-anchor="end" fill="#475569">${esc(rows[rows.length - 1].d)}</text>
</svg>
<div class="legend"><span style="color:#1d4ed8">&#9632; Prezzo (chiusure settimanali)</span> <span style="color:#b45309">&#9632; Media 10 sett.</span> <span style="color:#b91c1c">&#9632; Media 40 sett.</span></div>`;
}

function table(headers, rows) {
  if (!rows.length) return "";
  return `<table><thead><tr>${headers.map((h, i) => `<th${i ? ' class="r"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="r"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

export function buildReportHtml({ data, tech, S, label, warns = [] }) {
  const q = data.quote || {}, f = data.fin || {}, v = data.val || {}, a = data.an || {}, n = data.news || {}, fi = data.final || {};
  const [bg, fg] = LABEL_HEX[label] || LABEL_HEX["n.d."];
  const now = new Date();
  const stamp = now.toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });
  const conf = S.rel >= 75 ? "Alta" : S.rel >= 50 ? "Media" : "Bassa";

  const scoreRows = Object.entries(S.scores).map(([k, s]) => {
    const w = isNum(s) ? Math.round(s) : 0;
    return `<tr><td>${esc(k)}</td><td class="bar"><div class="track"><div class="fill" style="width:${w}%"></div></div></td><td class="r">${isNum(s) ? Math.round(s) + "/100" : "n.d."}</td></tr>`;
  }).join("");

  const annual = table(["Anno", "Ricavi (mln)", "Utile netto", "EBITDA", "FCF", "EPS"], (f.annual || []).map((r) => [r.y, mf(r.rev), mf(r.ni), mf(r.ebitda), mf(r.fcf), nf(r.eps)]));
  const quarters = table(["Trimestre", "Ricavi (mln)", "Utile netto", "EPS"], (f.quarters || []).map((r) => [r.p, mf(r.rev), mf(r.ni), nf(r.eps)]));
  const b = f.balance || {};
  const balance = [["Debito netto (mln)", mf(b.netDebt)], ["Debito totale (mln)", mf(b.totalDebt)], ["Patrimonio netto (mln)", mf(b.equity)], ["Current ratio", nf(b.currentRatio)], ["Copertura interessi", nf(b.interestCover, 1)], ["ROE", isNum(b.roe) ? nf(b.roe, 1) + "%" : "n.d."]];
  const val = table(["Multiplo", "Titolo", "Settore", "Storico 5a"], (v.metrics || []).map((m) => [m.k, nf(m.v), isNum(m.sector) ? nf(m.sector) : "n.d.", isNum(m.hist5y) ? nf(m.hist5y) : "n.d."]));

  const up = isNum(a.targetMean) && isNum(q.price) && q.price ? (a.targetMean / q.price - 1) * 100 : null;
  const rt = a.ratings || { buy: 0, hold: 0, sell: 0 };
  const hasRatings = rt.buy + rt.hold + rt.sell > 0;
  const arows = [];
  if (isNum(a.targetMean)) {
    arows.push(["Target medio", `${nf(a.targetMean)} ${q.currency || ""}`.trim()]);
    if (isNum(a.targetMin) || isNum(a.targetMax)) arows.push(["Target min / max", `${nf(a.targetMin)} / ${nf(a.targetMax)}`]);
    arows.push(["Potenziale rispetto al prezzo", pf(up)]);
  }
  if (hasRatings) arows.push(["Rating (acquisto / mantenere / vendita)", `${rt.buy} / ${rt.hold} / ${rt.sell}`]);
  const analysts = arows.length
    ? `<h3>Consenso degli analisti${a.source && a.source !== "n.d." ? ` <span class="mute">(${esc(a.source)})</span>` : ""}</h3>${table(["Voce", "Valore"], arows)}`
    : `<p class="mute">Consenso degli analisti (target price e rating) non disponibile per questo titolo: le fonti gratuite lo coprono solo per i titoli USA.</p>`;

  const ev = data.events || {};
  const earn = ev.earnings || {}, div = ev.dividends || {};
  const earnRows = [["Prossima pubblicazione risultati", earn.nextDate || "n.d."], ["Periodo stima", earn.estimatePeriod || "n.d."], ["EPS atteso", nf(earn.epsEstimate)], ["Ricavi attesi (mln)", mf(earn.revenueEstimate)]];
  const earnHistory = table(["Periodo", "EPS effettivo", "EPS stimato", "Sorpr. %"], (earn.history || []).slice().reverse().map((x) => [x.quarter || "n.d.", nf(x.epsActual), nf(x.epsEstimate), pf(x.surprisePct)]));
  const divRows = [["Dividendo annuo per azione", isNum(div.annualRate) ? nf(div.annualRate) + " " + (q.currency || "") : "n.d."], ["Dividend yield", isNum(div.yield) ? nf(div.yield, 2) + "%" : "n.d."], ["Payout ratio", isNum(div.payoutRatio) ? nf(div.payoutRatio, 1) + "%" : "n.d."], ["Data ex-dividendo", div.exDividendDate || "n.d."], ["Yield medio 5 anni", isNum(div.fiveYearAvgYield) ? nf(div.fiveYearAvgYield, 2) + "%" : "n.d."]];
  const divHistory = table(["Data stacco", "Importo per azione"], (div.history || []).slice(-8).reverse().map((x) => [x.date, nf(x.amount) + " " + (q.currency || "")]));
  const eventsHtml = ev && (ev.earnings || ev.dividends) ? '<section><h2>Calendario utili e dividendi</h2><div class="two"><div><h3>Earnings Intelligence</h3>' + table(["Indicatore", "Valore"], earnRows) + earnHistory + '</div><div><h3>Dividend Intelligence</h3>' + table(["Indicatore", "Valore"], divRows) + divHistory + '</div></div><p class="mute">Fonte: ' + esc(ev.source || "n.d.") + ', dati al ' + esc(ev.asOf || "n.d.") + '. Copertura e stime possono variare. Dividend yield non garantito. La data di pagamento non è esposta in modo uniforme. Questi dati non modificano il punteggio.</p></section>' : "";
  const mk = data.mkt;
  const rsRows = mk && mk.stock ? [["3 mesi", "r13"], ["6 mesi", "r26"], ["12 mesi", "r52"]].filter(([, k]) => isNum(mk.stock[k])).map(([lab, k]) => {
    const ix = mk.index && isNum(mk.index[k]) ? mk.index[k] : null;
    return [lab, pf(mk.stock[k]), ix != null ? pf(ix) : "n.d.", ix != null ? (mk.stock[k] - ix >= 0 ? "+" : "") + nf(mk.stock[k] - ix, 1) + " pt" : "n.d."];
  }) : [];
  const strength = rsRows.length
    ? `<h3>Forza relativa e momentum${mk.bench ? ` <span class="mute">(contro ${esc(mk.bench.name)})</span>` : ""}</h3>${table(["Periodo", "Titolo", "Indice", "Differenza"], rsRows)}${isNum(mk.pos52) ? `<p class="mute">Posizione nel range a 52 settimane: ${mk.pos52}% (0% = minimo, 100% = massimo).</p>` : ""}`
    : "";

  const dot = { pos: "#047857", neg: "#b91c1c", neu: "#b45309" };
  const news = (n.items || []).map((it) => `<li><span style="color:${dot[it.sentiment] || dot.neu}">&#9679;</span> ${esc(it.title)} <span class="mute">(${esc([it.date, it.source].filter(Boolean).join(" · "))})</span></li>`).join("");

  const list = (arr) => (Array.isArray(arr) && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  const verdict = fi && !fi.failed && fi.motivation
    ? `<p>${esc(fi.motivation)}</p><div class="two"><div><h3>Punti di forza</h3>${list(fi.strengths)}</div><div><h3>Rischi</h3>${list(fi.risks)}</div></div>
<table class="levels"><tbody><tr><td>Ingresso</td><td>Stop</td><td>Target</td></tr><tr><th>${esc(fi.entry || "n.d.")}</th><th>${esc(fi.stop || "n.d.")}</th><th>${esc(fi.target || "n.d.")}</th></tr></tbody></table>`
    : `<p class="mute">Commento del modello non disponibile.</p>`;

  const tr = [["Prezzo", `${nf(q.price)} ${q.currency || ""}`], ["Variazione", pf(q.changePct)], ["Capitalizzazione", cf(q.marketCap)], ["SMA 50 / SMA 200", `${nf(q.sma50)} / ${nf(q.sma200)}`], ["RSI (14)", nf(q.rsi14, 1)], ["Supporti", (q.support || []).map((x) => nf(x)).join(" · ") || "n.d."], ["Resistenze", (q.resistance || []).map((x) => nf(x)).join(" · ") || "n.d."]];

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Analisi ${esc(q.ticker || "")}</title>
<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 11.5px; line-height: 1.45; margin: 0; }
h1 { font-size: 20px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 2px solid #0f3a8c; color: #0f3a8c; text-transform: uppercase; letter-spacing: .04em; }
h3 { font-size: 12px; margin: 6px 0 3px; }
section { margin: 0 0 14px; break-inside: avoid; page-break-inside: avoid; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.sub, .mute { color: #475569; } .mute { font-size: 10.5px; }
.chip { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 16px; background: ${bg}; color: ${fg}; }
table { width: 100%; border-collapse: collapse; } th, td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
th { background: #f1f5f9; font-size: 10.5px; } .r { text-align: right; }
td.bar { width: 55%; } .track { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; } .fill { height: 100%; background: #0f3a8c; }
ul { margin: 2px 0 0; padding-left: 16px; } li { margin: 1px 0; }
.two { display: flex; gap: 14px; } .two > div { flex: 1; }
.levels td, .levels th { text-align: center; width: 33%; } .levels td { font-size: 10px; color: #475569; }
.legend { font-size: 10px; margin-top: 2px; } .legend span { margin-right: 10px; }
.foot { margin-top: 10px; padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 9.5px; color: #475569; }
</style></head><body>
<div class="head"><div><h1>${esc(q.name || q.ticker || "Titolo")}</h1><div class="sub">${esc([q.ticker, q.exchange, q.currency].filter(Boolean).join(" · "))}</div><div class="mute">Report generato il ${esc(stamp)} &middot; dati aggiornati al ${esc(q.asOf || "n.d.")} &middot; fonte: ${esc(q.source || "n.d.")}</div></div>
<div style="text-align:right"><span class="chip">${esc(label)}</span><div class="mute" style="margin-top:4px">Punteggio ${isNum(S.overall) ? Math.round(S.overall) : "n.d."}/100 &middot; Confidenza ${conf} (${S.rel}%)<br>Orizzonte: ${esc(fi.horizon || "n.d.")}</div></div></div>
<section><h2>Punteggi</h2><table><tbody>${scoreRows}</tbody></table></section>
<section><h2>Prezzo e analisi tecnica</h2>${priceChartSvg(tech)}${table(["Indicatore", "Valore"], tr)}</section>
<section><h2>Bilanci</h2>${annual}${quarters ? `<div style="height:6px"></div>${quarters}` : ""}<div style="height:6px"></div>${table(["Solidità finanziaria", "Valore"], balance)}</section>
<section><h2>Valutazione</h2>${val || '<p class="mute">Multipli non disponibili.</p>'}</section>${eventsHtml}
<section><h2>Sentiment di mercato</h2>${analysts}${strength}</section>
<section><h2>Notizie recenti</h2>${n.officialSentiment ? `<p><b>Tono complessivo:</b> ${esc(n.officialSentiment)}</p>` : ""}${news ? `<ul>${news}</ul>` : '<p class="mute">Nessuna notizia disponibile.</p>'}${n.risks && n.risks.length ? `<p class="mute">Rischi segnalati dalle notizie: ${esc(n.risks.join(" · "))}</p>` : ""}</section>
<section><h2>Giudizio</h2>${verdict}</section>
<div class="foot">${warns.length ? `Note sui dati: ${esc(warns.join(" | "))}<br>` : ""}Analisi informativa e automatizzata, non è consulenza finanziaria. I dati possono contenere errori: verificarli su fonti ufficiali prima di qualsiasi decisione. Dati da Yahoo Finance${a.source && /Finnhub/.test(a.source) ? " e Finnhub" : ""}; commento generato da un modello di intelligenza artificiale.</div>
</body></html>`;
}

// Apre la finestra di stampa di Android (o quella del browser sul web)
export async function printReport(args) {
  const html = buildReportHtml(args);
  const name = `Analisi_${(args.data.quote?.ticker || "titolo").replace(/[^A-Za-z0-9._-]/g, "")}_${new Date().toISOString().slice(0, 10)}`;
  if (Capacitor.isNativePlatform()) {
    await PrintReport.print({ html, name });
    return "native";
  }
  await new Promise((resolve, reject) => {
    const fr = document.createElement("iframe");
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); resolve(); } catch (e) { reject(e); } setTimeout(() => fr.remove(), 60000); };
    document.body.appendChild(fr);
    fr.srcdoc = html;
  });
  return "web";
}
