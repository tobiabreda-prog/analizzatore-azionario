import { describe, expect, it } from "vitest";
import { buildReportHtml } from "./report.js";

describe("exported report reliability",()=>{
 it("does not publish unverified AI entry, stop or target even if legacy cache contains them",()=>{
  const html=buildReportHtml({
   data:{quote:{ticker:"TEST",price:100,currency:"USD",source:"fixture",asOf:"2026-11-13"},
     final:{motivation:"Commento illustrativo",entry:"123.45",stop:"88.25",target:"179.90",strengths:[],risks:[]}},
   tech:[],S:{rel:80,overall:60,scores:{}},label:"MANTENERE",warns:[]
  });
  expect(html).toContain("Copertura dati");
  expect(html).toContain("Livelli ingresso, stop e target omessi");
  for(const risky of ["123.45","88.25","179.90"])expect(html).not.toContain(risky);
  expect(html).not.toContain("Confidenza Alta");
 });
});
