// Bridges shared card links to the public app's detail cache without a circular import.
let handler: ((id: string) => void) | null = null;
export function setDetailPrefetch(next: ((id: string) => void) | null) { handler = next; }
export function prefetchDetailHref(href: string) {
  const id = href.match(/^\/properties\/([a-f0-9-]{36})(?:[/?]|$)/)?.[1];
  if (id) handler?.(id);
}
