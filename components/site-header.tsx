"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Gavel, Landmark, Sparkles, SlidersHorizontal, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
type Here = { pathname: string; demo: string | null; source: string | null };
// Real-data menus pin demo=0 so a local DEMO_MODE default never leaks into them.
const menu: { href: string; label: string; icon: typeof Home; active: (h: Here) => boolean }[] = [
  { href: "/dashboard?demo=0", label: "홈", icon: Home, active: h => h.pathname === "/dashboard" && h.demo !== "1" },
  { href: "/properties?demo=0&source=court", label: "경매", icon: Gavel, active: h => h.pathname === "/properties" && h.demo !== "1" && h.source !== "onbid" },
  { href: "/properties?demo=0&source=onbid", label: "공매", icon: Landmark, active: h => h.pathname === "/properties" && h.demo !== "1" && h.source === "onbid" },
  { href: "/dashboard?demo=1", label: "데모", icon: Sparkles, active: h => h.demo === "1" },
  { href: "/test", label: "테스트", icon: FlaskConical, active: h => h.pathname.startsWith("/test") },
  { href: "/settings", label: "설정", icon: SlidersHorizontal, active: h => h.pathname.startsWith("/settings") },
];
const links = menu.filter(link => !(process.env.NEXT_PUBLIC_READ_ONLY_SITE === "1" && link.href === "/settings"));
export function SiteHeader() {
  const pathname = usePathname();
  const params = useSearchParams();
  const here = { pathname, demo: params.get("demo"), source: params.get("source") };
  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="mx-auto flex min-h-20 max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-10">
        <Link href="/dashboard?demo=0" aria-label="선경매 홈">
          <Image
            src="/brand/lineauction-logo.svg"
            alt="선경매 LINE AUCTION"
            width={540}
            height={220}
            priority
            className="h-auto w-[145px] md:w-[170px]"
          />
        </Link>
        <nav
          className="order-3 flex w-full justify-center gap-4 overflow-x-auto text-sm sm:gap-6 md:order-none md:w-auto md:gap-8 md:text-base"
          aria-label="주 메뉴"
        >
          {links.map(({ href, label, icon: Icon, active: isActive }) => {
            const active = isActive(here);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 py-3 font-medium md:gap-2 transition-colors hover:text-foreground",
                  active
                    ? "border-hof text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <Badge
          variant="secondary"
          className="rounded-full px-3 py-1.5 text-xs font-normal"
        >
          경매·공매 리서치
        </Badge>
      </div>
    </header>
  );
}
