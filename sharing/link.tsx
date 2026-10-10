import { forwardRef, type AnchorHTMLAttributes } from "react";

export default forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & {prefetch?:boolean}>(function PublicLink({ href = "", prefetch: _prefetch, ...props }, ref) {
  void _prefetch;
  const destination = href.startsWith("/") ? `#${href.split("?")[0]}` : href;
  return <a {...props} ref={ref} href={destination} />;
});
