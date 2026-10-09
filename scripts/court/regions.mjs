import { readFileSync } from 'node:fs';
export const regionCatalog = JSON.parse(readFileSync(new URL('./regions.json',import.meta.url),'utf8'));
export function regionCode(name) {
 const normalized=String(name??'').trim().replace(/\s+/g,' ');
 if(Object.keys(regionCatalog.codes).some(candidate=>candidate.startsWith(`${normalized} `)))return null;
 return regionCatalog.codes[normalized]??null;
}
