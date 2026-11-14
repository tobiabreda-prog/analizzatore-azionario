import { describe, expect, it } from "vitest";
import { approvedReportModels, APPROVED_GEMINI_REPORT_MODEL } from "./gemini-models.js";

describe("Gemini report allowlist",()=>{
 it("allows only Gemini 3.5 Flash Lite with generateContent",()=>{
  const models=[
   {name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"]},
   {name:APPROVED_GEMINI_REPORT_MODEL,supportedGenerationMethods:["generateContent"]},
   {name:"models/gemini-3.5-flash",supportedGenerationMethods:["generateContent"]}
  ];
  expect(approvedReportModels(models).map(x=>x.name)).toEqual([APPROVED_GEMINI_REPORT_MODEL]);
 });
 it("never falls back when only an unsupported model is available",()=>{
  expect(approvedReportModels([{name:"models/gemini-3.5-flash",supportedGenerationMethods:["generateContent"]}])).toEqual([]);
  expect(approvedReportModels([{name:APPROVED_GEMINI_REPORT_MODEL,supportedGenerationMethods:["countTokens"]}])).toEqual([]);
 });
});
