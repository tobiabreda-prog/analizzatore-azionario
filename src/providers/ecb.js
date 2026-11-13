const ECB_BASE = "https://data-api.ecb.europa.eu/service/data";
function parseCsvLine(line){
 const fields=[];let value="",quoted=false;
 for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===","&&!quoted){fields.push(value);value="";}else value+=ch;}
 if(quoted)throw new Error("CSV ECB non valido: virgolette non chiuse");fields.push(value);return fields;
}
export async function loadEcbSeries({flowRef,key,startPeriod,endPeriod,fetchImpl=fetch}){
 if(!/^[A-Za-z0-9._-]+$/.test(flowRef??""))throw new Error("Identificativo serie ECB non valido");
 const url=new URL(ECB_BASE+"/"+flowRef);url.search=new URLSearchParams({...(startPeriod?{startPeriod}:{}),...(endPeriod?{endPeriod}:{}),detail:"dataonly"});
 const response=await fetchImpl(url,{headers:{Accept:"text/csv",...(key?{"Ocp-Apim-Subscription-Key":key}:{})}});
 if(!response.ok)throw new Error("ECB HTTP "+response.status);
 const csv=(await response.text()).replace(/^\uFEFF/,"").trim();const lines=csv.split(/\r?\n/);
 if(lines.length<2)return [];
 const headers=parseCsvLine(lines[0]),timeIndex=headers.indexOf("TIME_PERIOD"),valueIndex=headers.indexOf("OBS_VALUE");
 if(timeIndex<0||valueIndex<0)throw new Error("Formato CSV ECB inatteso");
 return lines.slice(1).filter(Boolean).map(parseCsvLine).filter(cols=>cols.length>Math.max(timeIndex,valueIndex)).map(cols=>({date:cols[timeIndex],value:Number(cols[valueIndex]),source:"ECB"})).filter(x=>x.date&&Number.isFinite(x.value));
}
export {parseCsvLine as parseEcbCsvLine};
