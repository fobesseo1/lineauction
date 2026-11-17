// 시군구 codes of the enabled regions (scripts/regions.json; was court/regions.json).
import {catalogOf} from '../regions.mjs';
export const regionCatalog = catalogOf();
export function regionCode(name) {
 const normalized=String(name??'').trim().replace(/\s+/g,' ');
 if(Object.keys(regionCatalog.codes).some(candidate=>candidate.startsWith(`${normalized} `)))return null;
 // Renamed or split districts resolve to a comma-separated list of successor codes.
 return regionCatalog.codes[normalized]??regionCatalog.aliases?.[normalized]??null;
}
