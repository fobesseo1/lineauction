"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Building2, SlidersHorizontal, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
const links = [
  { href: "/dashboard", label: "홈", icon: Home },
  { href: "/properties", label: "경매·공매물건", icon: Building2 },
  { href: "/test", label: "테스트", icon: FlaskConical },
  { href: "/settings", label: "설정", icon: SlidersHorizontal },
];
export function SiteHeader() {
  const pathname = usePathname();
  const mode = useSearchParams().get("demo");
  const destination = (href: string) =>
    mode === "1" || mode === "0" ? `${href}?demo=${mode}` : href;
  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="mx-auto flex min-h-20 max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-10">
        <Link href={destination("/dashboard")} aria-label="선경매 홈">
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
          className="order-3 flex w-full justify-center gap-6 md:order-none md:w-auto md:gap-10"
          aria-label="주 메뉴"
        >
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={destination(href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 py-3 font-medium transition-colors hover:text-foreground",
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
