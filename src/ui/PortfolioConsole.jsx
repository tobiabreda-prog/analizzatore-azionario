import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { parseInvestingPortfolio } from "../modules/investing-portfolio.js";
import { buildPortfolioSnapshot } from "../modules/portfolio-snapshot.js";
import { loadPortfolioSnapshot, savePortfolioSnapshot } from "../services/portfolio-store.js";

const finite = value => typeof value === "number" && Number.isFinite(value);
const number = (value, decimals = 2) => finite(value)
  ? value.toLocaleString("it-IT", { maximumFractionDigits: decimals, minimumFractionDigits: Math.min(decimals, 2) }) : "n.d.";
const quantity = value => finite(value) ? value.toLocaleString("it-IT", { maximumFractionDigits: 8 }) : "n.d.";
const money = value => value && finite(value.amount)
  ? number(value.amount) + (value.currency ? " " + value.currency : " · valuta non indicata") : "n.d.";
const percent = value => finite(value) ? number(value) + "%" : "n.d.";
const TABS = [["summary", "Riepilogo"], ["open", "Lotti aperti"], ["closed", "Posizioni chiuse"], ["raw", "Dati originali"]];
const TH = "p-2 text-left whitespace-nowrap font-semibold";
const TD = "p-2 align-top whitespace-nowrap";

function downloadOriginal(snapshot) {
  const url = URL.createObjectURL(new Blob([snapshot.sourceText], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;link.download = snapshot.fileName || "portafoglio-investing.csv";
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RawFields({ row }) {
  const fields = Array.isArray(row.fields) ? row.fields : [];
  if (!fields.length) return <span className="text-xs">Ricostruito dai lotti</span>;
  return <details className="text-xs"><summary className="cursor-pointer text-emerald-600">Tutte le colonne · riga {row.line}</summary>
    <dl className="mt-2 grid gap-1 min-w-64 max-w-xl">{fields.map((field, i) => <div key={i} className="border-b border-slate-500/20 pb-1">
      <dt className="font-semibold">{field.name || "Colonna senza nome"} <span className="font-normal opacity-60">(colonna {field.index + 1})</span></dt>
      <dd className="break-words whitespace-pre-wrap">{field.raw || "—"}</dd>
    </div>)}</dl>
  </details>;
}

function HoldingsTable({ positions, muted, card, onSelectSymbol }) {
  return <div className={`overflow-x-auto border rounded-xl ${card}`}><table aria-label="Posizioni in portafoglio" className="w-full text-sm"><thead><tr className={muted}>
    {["Titolo", "Quantità", "Prezzo medio", "Prezzo CSV", "Valore di mercato", "Peso CSV", "P/L netto CSV", "Lotti / controlli", "Dettagli"].map(heading => <th key={heading} className={TH}>{heading}</th>)}
  </tr></thead><tbody>{positions.map((position, i) => <tr key={position.id || i} className="border-t border-slate-500/20">
    <td className={TD}><b>{position.name || position.originalSymbol}</b><div className={`text-xs ${muted}`}>{position.originalSymbol} · {position.exchange}</div>
      {position.symbol && !position.symbol.includes("=") && <button type="button" onClick={() => onSelectSymbol(position.symbol)} className="text-xs text-emerald-600 underline" aria-label={"Analizza " + position.symbol}>Apri analisi</button>}</td>
    <td className={TD}>{quantity(position.quantity)}</td><td className={TD}>{number(position.averagePrice, 4)} {position.currency || ""}</td><td className={TD}>{number(position.currentPrice, 4)} {position.currency || ""}</td>
    <td className={TD}>{money(position.marketValue)}</td><td className={TD}>{percent(position.weightPct)}</td><td className={TD}>{money(position.netPnl)}</td>
    <td className={TD}>{position.lots?.length || 0} lotti<div className="text-xs">{position.reconciliation?.status === "matched" ? "Quantità riconciliata" : position.reconciliation?.status === "warning" ? "Da verificare" : "Riepilogo disponibile"}</div></td>
    <td className={TD}><RawFields row={position}/></td>
  </tr>)}</tbody></table></div>;
}

function LotsTable({ rows, closed, muted, card }) {
  const title = closed ? "Posizioni chiuse" : "Lotti aperti";
  return <div className={`overflow-x-auto rounded-xl border ${card}`}><table aria-label={title} className="w-full text-sm"><thead><tr className={muted}>
    {["Titolo", "Apertura", ...(closed ? ["Chiusura"] : []), "Quantità", "Prezzo apertura", closed ? "Prezzo chiusura" : "Prezzo CSV", "Commissioni CSV", "P/L netto CSV", "Dettagli"].map(heading => <th key={heading} className={TH}>{heading}</th>)}
  </tr></thead><tbody>{rows.map((row, i) => <tr key={row.id || i} className="border-t border-slate-500/20"><td className={TD}>{row.name}<div className={`text-xs ${muted}`}>{row.originalSymbol} · {row.exchange}</div></td>
    <td className={TD}>{row.openDate || "n.d."}</td>{closed && <td className={TD}>{row.closeDate || "n.d."}</td>}<td className={TD}>{quantity(row.quantity)}</td>
    <td className={TD}>{number(row.openPrice, 4)} {row.currency || ""}</td><td className={TD}>{number(closed ? row.closePrice : row.currentPrice, 4)} {row.currency || ""}</td>
    <td className={TD}>{money(row.commission)}</td><td className={TD}>{money(row.netPnl)}</td><td className={TD}><RawFields row={row}/></td>
  </tr>)}</tbody></table></div>;
}

export default function PortfolioConsole({ dark = false, onBack = () => {}, onSelectSymbol = () => {} }) {
  const [saved, setSaved] = useState(null), [preview, setPreview] = useState(null);
  const [tab, setTab] = useState("summary"), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const requestId = useRef(0);
  const card = dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  useEffect(() => {
    try {
      const snapshot = loadPortfolioSnapshot();
      if (snapshot) setSaved({ snapshot, view: buildPortfolioSnapshot(snapshot) });
    } catch (err) { setError("Portafoglio salvato non leggibile: " + err.message); }
    setLoaded(true);
    return () => { requestId.current++; };
  }, []);
  const selectFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++requestId.current;
    setError("");setNotice("");setPreview(null);setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Il CSV supera il limite di 5 MB.");
      let sourceText;
      try { sourceText = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error("Il file deve essere un CSV codificato in UTF-8."); }
      const snapshot = parseInvestingPortfolio(sourceText, { fileName: file.name });
      const view = buildPortfolioSnapshot(snapshot);
      if (id === requestId.current) { setPreview({ snapshot, view });setTab("summary"); }
    } catch (err) { if (id === requestId.current) setError("Importazione non riuscita: " + err.message); }
    finally { if (id === requestId.current) setBusy(false);event.target.value = ""; }
  };
  const confirmImport = () => {
    if (!preview) return;
    try {
      savePortfolioSnapshot(preview.snapshot);
      setSaved(preview);setPreview(null);setError("");setNotice("Portafoglio importato e salvato sul dispositivo.");
    } catch (err) { setError("Salvataggio non riuscito: " + err.message); }
  };
  const active = preview || saved;
  const snapshot = active?.snapshot, view = active?.view;
  const warnings = [...new Set([...(snapshot?.warnings || []), ...(view?.warnings || [])])];
  const positions = view?.positions || [];
  const rows = tab === "open" ? snapshot?.openLots || [] : snapshot?.closedLots || [];
  return <div className={`min-h-screen ${dark ? "bg-slate-950 text-slate-100 theme-dark" : "bg-slate-50 text-slate-900 theme-light"}`}>
    <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-5">
      <header className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-2xl font-bold">Portafoglio</h1><p className={`text-sm ${muted}`}>Posizioni, lotti e storico importati da Investing.com</p></div>
        <button type="button" onClick={onBack} className={`border rounded-lg px-3 py-2 flex items-center gap-2 ${card}`}><ArrowLeft size={16}/>Analisi titolo</button></header>
      <section className={`border rounded-xl p-4 space-y-3 ${card}`}><h2 className="font-semibold">Importa il portafoglio Investing.com</h2>
        <p className={`text-sm ${muted}`}>Carica l’esportazione CSV completa e controlla l’anteprima prima di salvare. Ogni importazione sostituisce la fotografia precedente, senza aggiungere di nuovo gli stessi lotti.</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-white"><Upload size={16}/>{busy ? "Lettura in corso…" : "Seleziona CSV Investing.com"}
          <input aria-label="Importa CSV Investing.com" type="file" accept=".csv,text/csv" disabled={busy || !loaded} onChange={selectFile} className="sr-only"/></label>
        <p className={`text-xs ${muted}`}>Importazione e salvataggio locali sul dispositivo. File massimo 5 MB.</p></section>
      {error && <div role="alert" className="rounded-lg border border-red-500/50 p-3 text-sm"><AlertTriangle className="inline mr-2" size={16}/>{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-500/50 p-3 text-sm"><CheckCircle2 className="inline mr-2" size={16}/>{notice}</div>}
      {preview && <section aria-label="Anteprima importazione" className="rounded-xl border border-amber-500 p-4 space-y-3"><h2 className="font-semibold">Anteprima importazione</h2>
        <p className="text-sm">{view.counts.positions} posizioni · {view.counts.openLots} lotti aperti · {view.counts.closedLots} posizioni chiuse.</p>
        {saved && <p className="text-sm">La conferma sostituirà il portafoglio salvato con questo file.</p>}
        <div className="flex flex-wrap gap-2"><button type="button" onClick={confirmImport} className="rounded-lg bg-emerald-700 text-white px-4 py-2">{saved ? "Conferma sostituzione" : "Conferma importazione"}</button>
          <button type="button" onClick={() => { setPreview(null);setError(""); }} className="rounded-lg border px-4 py-2">Annulla importazione</button></div></section>}
      {!loaded && <p className={muted}>Caricamento portafoglio…</p>}
      {loaded && !active && <p className={muted}>Nessun portafoglio importato.</p>}
      {active && <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><div><b>{snapshot.fileName || "Esportazione Investing.com"}</b><p className={muted}>Importato il {new Date(snapshot.importedAt).toLocaleString("it-IT")}. Prezzi e risultati si riferiscono al CSV.</p></div>
          <button type="button" onClick={() => downloadOriginal(snapshot)} className={`rounded-lg border px-3 py-2 flex gap-2 items-center ${card}`}><Download size={16}/>Esporta CSV originale</button></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{snapshot.totals.map((total, i) => <div key={i} className={`border rounded-xl p-3 ${card}`}><div className={`text-xs ${muted}`}>{total.label} · CSV</div><div className="font-semibold">{total.value ? money(total.value) : total.raw || "n.d."}{total.percent != null ? " / " + percent(total.percent) : ""}</div></div>)}</div>
        {warnings.length > 0 && <details className="rounded-lg border border-amber-500/50 p-3 text-sm" open><summary className="font-semibold cursor-pointer">Controlli e riconciliazione ({warnings.length})</summary><ul className="list-disc pl-5 mt-2 space-y-1">{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sezioni portafoglio">{TABS.map(([id, label]) => <button key={id} type="button" role="tab" id={"portfolio-tab-" + id} aria-controls="portfolio-panel" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-lg border px-4 py-2 ${tab === id ? "bg-emerald-700 text-white" : card}`}>{label}</button>)}</div>
        <div role="tabpanel" id="portfolio-panel" aria-labelledby={"portfolio-tab-" + tab}>
          {tab === "summary" && <section aria-label="Riepilogo portafoglio" className="space-y-4"><h2 className="text-lg font-semibold">Posizioni in portafoglio</h2>
            <HoldingsTable positions={positions} muted={muted} card={card} onSelectSymbol={onSelectSymbol}/>
            <div className="grid sm:grid-cols-2 gap-3">{view.byCurrency.map(group => <div key={group.currency} data-testid={"currency-" + group.currency} className={`border rounded-xl p-3 text-sm ${card}`}><h3 className="font-semibold">Valori nella valuta del titolo · {group.currency}</h3><p>Valore di mercato: {number(group.marketValue)} {group.currency}</p><p>Costo con commissioni disponibili: {number(group.costBasis)} {group.currency}</p><p>P/L su prezzi e commissioni: {number(group.pnl)} {group.currency}</p>{group.partial && <p className={`text-xs ${muted}`}>Dati incompleti: i totali non disponibili restano n.d.</p>}</div>)}</div>
            {view.concentration.largestPosition && <p className={`text-sm ${muted}`}>Posizione con il peso maggiore nel CSV: {view.concentration.largestPosition.name || view.concentration.largestPosition.symbol} ({percent(view.concentration.largestPosition.weightPct)}). I pesi descrivono l’esportazione e non includono eventuali attività esterne.</p>}
            <p className={`text-xs ${muted}`}>Le valute restano separate. Il P/L netto riportato da Investing.com può includere cambio e costi: viene conservato nella sua valuta, distinto dai calcoli sui prezzi. I campi non disponibili restano indicati come n.d.</p>
          </section>}
          {(tab === "open" || tab === "closed") && <section aria-label={tab === "open" ? "Lotti aperti" : "Posizioni chiuse"} className="space-y-3"><h2 className="text-lg font-semibold">{tab === "open" ? "Lotti aperti" : "Posizioni chiuse"} ({rows.length})</h2>
            <LotsTable rows={rows} closed={tab === "closed"} muted={muted} card={card}/>{!rows.length && <p className={muted}>Sezione non presente nel file.</p>}
            {tab === "closed" && view.closedReportedPnlByCurrency.length > 0 && <p className={`text-xs ${muted}`}>Somma dei P/L chiusi riportati, per valuta: {view.closedReportedPnlByCurrency.map(group => `${number(group.amount)} ${group.currency}`).join(" · ")}. Include tutte le righe presenti, anche quelle identiche.</p>}
          </section>}
          {tab === "raw" && <section aria-label="Dati originali" className="space-y-4"><h2 className="text-lg font-semibold">Tutte le informazioni del CSV</h2><p className={`text-sm ${muted}`}>Intestazioni, colonne ripetute e valori originali sono conservati. Il numero della colonna distingue le intestazioni con lo stesso nome.</p>
            {snapshot.sections.map((section, index) => <details key={index} className={`border rounded-xl p-3 ${card}`}><summary className="font-semibold cursor-pointer">{section.title} · {section.rows.length} righe · {section.headers.length} colonne</summary>
              <div className="overflow-x-auto mt-3"><table aria-label={"Dati originali " + section.title} className="text-xs"><thead><tr><th className={TH}>Riga</th>{section.headers.map((header, i) => <th key={i} className={TH}>{header || "Senza nome"}<span className={`block font-normal ${muted}`}>Colonna {i + 1}</span></th>)}</tr></thead>
                <tbody>{section.rows.map((row, i) => <tr key={i} className="border-t border-slate-500/20"><td className={TD}>{row.line}</td>{row.cells.map((cell, j) => <td key={j} className={TD}>{cell || "—"}</td>)}</tr>)}</tbody></table></div></details>)}
          </section>}
        </div>
      </>}
    </div>
  </div>;
}
