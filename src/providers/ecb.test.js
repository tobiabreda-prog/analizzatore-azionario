import {describe,it,expect} from "vitest";
import {loadEcbSeries,parseEcbCsvLine} from "./ecb.js";
describe("ECB CSV parser",()=>{
 it("preserves commas inside quoted fields",()=>{expect(parseEcbCsvLine('A,"Company, Inc.",2026-01,12.5')).toEqual(["A","Company, Inc.","2026-01","12.5"]);});
 it("unescapes doubled quotes",()=>{expect(parseEcbCsvLine('"a ""quoted"" value",2')).toEqual(['a "quoted" value',"2"]);});
 it("rejects unterminated quoted fields",()=>{expect(()=>parseEcbCsvLine('"broken,2')).toThrow(/virgolette/);});
 it("requests the correct official SDMX dataflow/series path and parses observations",async()=>{
  let requested;
  const rows=await loadEcbSeries({flowRef:"EXR",seriesKey:"D.USD.EUR.SP00.A",fetchImpl:async(url)=>{requested=new URL(url);return {ok:true,text:async()=>"KEY,TIME_PERIOD,OBS_VALUE\\nD.USD.EUR.SP00.A,2026-11-12,1.12"};}});
  expect(requested.pathname).toBe("/service/data/EXR/D.USD.EUR.SP00.A");
  expect(requested.searchParams.get("format")).toBe("csvdata");
  expect(rows[0]).toMatchObject({date:"2026-11-12",value:1.12,source:"ECB"});
 });

});
