import { forwardRef, useEffect, type AnchorHTMLAttributes } from "react";
import { prefetchDetailHref } from "@/sharing/prefetch";

export default forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & {prefetch?:boolean}>(function PublicLink({ href = "", prefetch, ...props }, ref) {
  // Cards pass prefetch only while on screen; a short dwell skips cards scrolled past quickly.
  useEffect(() => {
    if (!prefetch) return;
    const timer = setTimeout(() => prefetchDetailHref(href), 200);
    return () => clearTimeout(timer);
  }, [prefetch, href]);
  const destination = href.startsWith("/") ? `#${href.split("?")[0]}` : href;
  return <a {...props} ref={ref} href={destination} />;
});
