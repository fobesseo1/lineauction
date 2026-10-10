import { loadCatalogPage } from "@/lib/services/catalog-service";
import { parseCatalogFilters } from "@/types/catalog";
export async function GET(request:Request) {
 try{return Response.json(await loadCatalogPage(parseCatalogFilters(new URL(request.url).searchParams)),{headers:{'Cache-Control':'public, max-age=60, s-maxage=180'}});}
 catch{return Response.json({error:'목록을 불러오지 못했습니다.'},{status:503});}
}
