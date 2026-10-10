import {findProperty} from "@/lib/repositories/property-repository";
import {VerifiedExamples} from "@/components/property/verified-examples";
export const dynamic="force-dynamic";
export default async function TestPage(){const rows=await Promise.all(["310d56e1-d6c4-4fef-970e-a844aa7b060b","0f28af10-adca-4627-9a5d-7d9a83c33db3","25641d71-b171-4b85-bb9f-fc90d4a1d1a7","7d617de7-e33d-4bda-a370-9c636d28eea7"].map(findProperty));return <VerifiedExamples properties={rows.filter(p=>p!==null)}/>;}
