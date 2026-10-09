import {loadPropertyList} from "@/lib/services/dashboard-service";
import {VerifiedExamples} from "@/components/property/verified-examples";
export const dynamic="force-dynamic";
export default async function TestPage(){const {properties}=await loadPropertyList("0");return <VerifiedExamples properties={properties}/>;}
