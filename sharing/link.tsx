import { forwardRef, type AnchorHTMLAttributes } from "react";

export default forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function PublicLink({ href = "", ...props }, ref) {
  const destination = href.startsWith("/") ? `#${href.split("?")[0]}` : href;
  return <a {...props} ref={ref} href={destination} />;
});
