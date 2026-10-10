import { loadPropertyList } from "@/lib/services/dashboard-service";
import { PropertyBrowser } from "@/components/property/property-browser";
import { CollectionState } from "@/components/collection-state";
import { DemoNotice } from "@/components/demo-notice";
import { isDemoMode } from "@/lib/services/dashboard-service";
import { PagedCatalog } from "@/components/property/paged-catalog";
import { loadCatalogPage } from "@/lib/services/catalog-service";
import { parseCatalogFilters } from "@/types/catalog";
export default async function Properties({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; demo?: string; source?: string }>;
}) {
  const params = await searchParams;
  if(!isDemoMode(params.demo)) {
    const filters=parseCatalogFilters(new URLSearchParams({source:params.source??'court',q:params.q??''}));
    const page=await loadCatalogPage(filters).catch(()=>null);
    const heading=filters.source==="onbid"?"공매물건 찾기":filters.source==="court"?"경매물건 찾기":"경매·공매물건 찾기";
    return page?<div className="space-y-7"><h1>{heading}</h1><PagedCatalog initialFilters={filters} initialPage={page} explore/></div>:<CollectionState state="error"/>;
  }
  const { properties, state } = await loadPropertyList(params.demo,params.source==="onbid"?"onbid":params.source==="all"?undefined:"court");
  const query = params.q || "";
  return (
    <div className="space-y-8">
      <DemoNotice active={state === "demo"} />
      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          EXPLORE PROPERTIES
        </p>
        <h1>경매·공매물건 찾기</h1>
        <p className="mt-2 text-muted-foreground">
          지역과 가격으로 좁혀보고, 입찰 조건을 자세히 살펴보세요.
        </p>
      </div>
      {properties.length ? (
        <PropertyBrowser key={params.source??"court"} properties={properties} initialQuery={query} initialSource={params.source??"court"} />
      ) : (
        <CollectionState state={state === "demo" ? "ready" : state} />
      )}
    </div>
  );
}
