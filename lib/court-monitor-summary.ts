type PhotoResult={state:string;photos?:number;allPhotosChecked?:boolean};
type Media={id:string;key:string};
export function photoCollectionSummary(targets:string[],results:Record<string,PhotoResult>,media:Media[],baseline:number|null){
 const targetSet=new Set(targets),checked=targets.filter(key=>results[key]);
 const counts=new Map<string,Set<string>>();
 for(const row of media){if(!targetSet.has(row.key))continue;const ids=counts.get(row.key)??new Set<string>();ids.add(row.id);counts.set(row.key,ids);}
 const values=[...counts.values()].map(ids=>ids.size),totalPhotos=values.reduce((a,b)=>a+b,0);
 return {target:targets.length,checked:checked.length,remaining:targets.length-checked.length,
  fivePlus:values.filter(n=>n>=5).length,multiple:values.filter(n=>n>=2).length,one:values.filter(n=>n===1).length,
  noPhotos:targets.length-values.length,totalPhotos,newPhotos:baseline===null?null:Math.max(0,totalPhotos-baseline),
  unavailable:checked.filter(key=>['detail-disabled','property-not-provided','case-not-found'].includes(results[key].state)||results[key].state==='detail-saved'&&!results[key].photos).length,
  errors:checked.filter(key=>results[key].state==='error').length};
}
