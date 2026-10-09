import {PropertyCard} from "./property-card";
import type {PropertyListing} from "@/types/listing";

// Real examples checked against stored official photos and matched MOLIT trades.
const examples=["310d56e1-d6c4-4fef-970e-a844aa7b060b","0f28af10-adca-4627-9a5d-7d9a83c33db3","25641d71-b171-4b85-bb9f-fc90d4a1d1a7","7d617de7-e33d-4bda-a370-9c636d28eea7"];
export function VerifiedExamples({properties}:{properties:PropertyListing[]}){
 const selected=examples.flatMap(id=>{const property=properties.find(p=>p.id===id);return property?[property]:[];});
 return <div className="space-y-7"><div><h1>테스트</h1><p className="mt-2 text-sm text-muted-foreground">법원 사진 여러 장과 국토부 실거래 비교가 저장된 실제 물건입니다.</p></div>{selected.length?<div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{selected.map(property=><PropertyCard key={property.id} property={property}/>)}</div>:<p role="status">테스트 물건을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>}</div>;
}
