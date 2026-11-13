import {describe,it,expect} from "vitest";
import {classifyMacroRegime} from "./macro-regime.js";
const now=new Date("2026-11-13T12:00:00Z");
const rows=[
 {id:"VIXCLS",value:32,date:"2026-11-12",status:"ok"},
 {id:"T10Y2Y",value:-.6,date:"2026-11-12",status:"ok"},
 {id:"BAMLH0A0HYM2",value:6.2,date:"2026-11-12",status:"ok"},
 {id:"FEDFUNDS",value:4,date:"2026-10-01",status:"ok"},
 {id:"DGS10",value:4.1,date:"2026-11-12",status:"ok"}
];
describe("macro regime classifier",()=>{
 it("classifies a stressed macro snapshot without inventing probabilities",()=>{const r=classifyMacroRegime(rows,now);expect(r.regime).toBe("risk_off");expect(r.methodology).toMatch(/non calibrate/);});
 it("blocks a regime when fewer than three core indicators are fresh",()=>{const r=classifyMacroRegime(rows.map(x=>({...x,date:"2026-01-01"})),now);expect(r.status).toBe("insufficient_data");});
 it("does not treat missing indicators as zero",()=>{const r=classifyMacroRegime([],now);expect(r.regime).toBe("unknown");});
});
