import {describe,it,expect} from "vitest";
import {parseTradeCsv,serializeTradesCsv} from "./trade-csv.js";
describe("trade CSV",()=>{
 it("imports semicolon CSV with decimal comma and localized operations",()=>{const rows=parseTradeCsv("data;strumento;operazione;quantita;prezzo;valuta;commissioni\n13/11/2026;ENI.MI;Acquisto;10;15,25;EUR;2,50");expect(rows[0].date).toBe("2026-11-13");expect(rows[0].price).toBe(15.25);expect(rows[0].fees).toBe(2.5);});
 it("round-trips the exported format",()=>{const original=parseTradeCsv("date;symbol;side;quantity;price;currency;fees;taxes\n2026-01-01;ABC;BUY;2;10;EUR;1;3");const again=parseTradeCsv(serializeTradesCsv(original));expect(again[0].symbol).toBe("ABC");expect(again[0].price).toBe(10);expect(again[0].taxes).toBe(3);});
 it("rejects absent required values",()=>{expect(()=>parseTradeCsv("date;symbol;side;quantity;price;currency\n2026-01-01;ABC;BUY;;10;EUR")).toThrow(/Quantità/);});
});
