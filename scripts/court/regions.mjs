import { readFileSync } from 'node:fs';
export const regionCatalog = JSON.parse(readFileSync(new URL('./regions.json',import.meta.url),'utf8'));
export function regionCode(name) {
 const normalized=String(name??'').trim().replace(/\s+/g,' ');
 if(Object.keys(regionCatalog.codes).some(candidate=>candidate.startsWith(`${normalized} `)))return null;
 // Renamed or split districts resolve to a comma-separated list of successor codes.
 return regionCatalog.codes[normalized]??regionCatalog.aliases?.[normalized]??null;
}
