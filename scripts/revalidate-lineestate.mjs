// Ask lineestate to drop its cached complex pages and recommendation pool once the daily market job
// has refreshed the tables behind them. URL and secret live in .env.local (domain may change).
process.loadEnvFile('.env.local');
const url=process.env.LINEESTATE_REVALIDATE_URL,secret=process.env.REVALIDATE_SECRET;
if(!url||!secret){console.error('LINEESTATE_REVALIDATE_URL or REVALIDATE_SECRET missing in .env.local');process.exit(1);}
const started=Date.now();
const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(60_000)});
const text=await res.text();
if(!res.ok){console.error(`revalidate failed: HTTP ${res.status} ${text.slice(0,200)}`);process.exit(1);}
let body;try{body=JSON.parse(text);}catch{body=text.slice(0,200);}
console.log(JSON.stringify({revalidated:body?.revalidated??body,seconds:Math.round((Date.now()-started)/1000)}));
