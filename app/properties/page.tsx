import { loadPropertyList } from "@/lib/services/dashboard-service";
import { PropertyBrowser } from "@/components/property/property-browser";
import { CollectionState } from "@/components/collection-state";
import { DemoNotice } from "@/components/demo-notice";
export const dynamic = "force-dynamic";
export default async function Properties({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; demo?: string }>;
}) {
  const params = await searchParams;
  const { properties, state } = await loadPropertyList(params.demo);
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
        <PropertyBrowser properties={properties} initialQuery={query} />
      ) : (
        <CollectionState state={state === "demo" ? "ready" : state} />
      )}
    </div>
  );
}
