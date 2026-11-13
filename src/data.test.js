import { afterEach, describe, expect, it } from "vitest";
import { loadQuote, setHttp } from "./data.js";

afterEach(() => {
  setHttp(async () => { throw new Error("HTTP mock non configurato"); });
});

describe("Yahoo daily quote normalization",()=>{
  it("uses the last dated daily close instead of an undated intraday field",async()=>{
    const timestamps=[
      Math.floor(Date.UTC(2026,10,11,21,0,0)/1000),
      Math.floor(Date.UTC(2026,10,12,21,0,0)/1000)
    ];
    setHttp(async(url)=>{
      if(!url.includes("/v8/finance/chart/TEST"))throw new Error("URL inatteso: "+url);
      return {
        status:200,
        data:{chart:{result:[{
          meta:{currency:"USD",symbol:"TEST",regularMarketPrice:999,gmtoffset:0},
          timestamp:timestamps,
          indicators:{quote:[{close:[100,110],high:[101,111],low:[99,109],volume:[1000,1200]}]}
        }],error:null}}
      };
    });
    const quote=await loadQuote("TEST");
    expect(quote.price).toBe(110);
    expect(quote.priceType).toBe("daily_close");
    expect(quote.asOf).toBe("2026-11-12");
  });
});
