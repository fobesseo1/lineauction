// Regions open to the public on lineestate, read from its region table (app.service_regions, status
// 'public') through app.service_sido(). Collection follows scripts/regions.json (enabled); everything that
// leaves the factory for the outside world (IndexNow, member and staff Telegram alerts) follows this list.
// So a 광역시 can be collected before it opens: its pages are not sent to search engines and its
// properties are not sent to anyone until lineestate turns it public (lineestate docs/metro-expansion-plan.md).
// A failed read throws: sending nothing is the safe side, and the next run retries.

export async function publicSidoNames(db){
 const {data,error}=await db.schema('app').rpc('service_sido',{p_admin:false});
 if(error)throw Error(`PUBLIC_REGIONS_UNAVAILABLE: ${error.message}`);
 if(!Array.isArray(data)||data.some(s=>typeof s!=='string'))throw Error('PUBLIC_REGIONS_BAD_RESPONSE');
 return data;
}

// The collected 시도 that are also public, in the order of `collected`.
export const publicOf=(collected,publicNames)=>{const pub=new Set(publicNames);return collected.filter(s=>pub.has(s));};

export const isPublicSido=publicNames=>{const pub=new Set(publicNames);return sido=>pub.has(sido);};
