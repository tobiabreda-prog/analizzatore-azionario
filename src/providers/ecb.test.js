import {describe,it,expect} from "vitest";
import {parseEcbCsvLine} from "./ecb.js";
describe("ECB CSV parser",()=>{
 it("preserves commas inside quoted fields",()=>{expect(parseEcbCsvLine('A,"Company, Inc.",2026-01,12.5')).toEqual(["A","Company, Inc.","2026-01","12.5"]);});
 it("unescapes doubled quotes",()=>{expect(parseEcbCsvLine('"a ""quoted"" value",2')).toEqual(['a "quoted" value',"2"]);});
 it("rejects unterminated quoted fields",()=>{expect(()=>parseEcbCsvLine('"broken,2')).toThrow(/virgolette/);});
});
