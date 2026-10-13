// vworld 2D data API (국가중점데이터). Licence: 출처표시 — results may be stored with attribution
// ("출처: 국토교통부 브이월드"). Unlike the vworld geocoder, whose results must not be stored.
export async function vworldFeatures(layer,params,{key=process.env.VWORLD_API_KEY,page=1,size=1000}={}){
 const url=new URL('https://api.vworld.kr/req/data');
 for(const [k,v] of Object.entries({service:'data',request:'GetFeature',data:layer,key,format:'json',crs:'EPSG:4326',size:String(size),page:String(page),domain:'http://localhost',...params}))url.searchParams.set(k,v);
 const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
 const text=await r.text();
 let body;try{body=JSON.parse(text).response;}catch{throw Error(`VWORLD_HTTP_${r.status}`);}
 if(body.status==='NOT_FOUND')return {features:[],total:0,pages:0};
 if(body.status!=='OK')throw Error(`VWORLD_${body.error?.code??body.status}`);
 return {features:body.result.featureCollection.features,total:Number(body.record.total),pages:Number(body.page.total)};
}

export async function allFeatures(layer,params,opts={}){
 const out=[];
 for(let page=1;;page++){const r=await vworldFeatures(layer,params,{...opts,page});out.push(...r.features);if(page>=r.pages)break;}
 return out;
}

// Centre of a feature's bounding box, enough for a map pin.
export function bboxCenter(bbox){
 if(!Array.isArray(bbox)||bbox.length<4||bbox[2]<bbox[0])return null;
 return {lng:Math.round((bbox[0]+bbox[2])/2*1e6)/1e6,lat:Math.round((bbox[1]+bbox[3])/2*1e6)/1e6};
}

// Bounding box of a GeoJSON geometry when the feature has no bbox.
export function boxOf(g){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;const walk=c=>{if(typeof c[0]==='number'){x0=Math.min(x0,c[0]);x1=Math.max(x1,c[0]);y0=Math.min(y0,c[1]);y1=Math.max(y1,c[1]);}else c.forEach(walk);};walk(g?.coordinates??[]);return [x0,y0,x1,y1];}
