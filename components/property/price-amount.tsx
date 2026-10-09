import { cn } from "cn";
import { formatKoreanWon, formatWon } from "@/lib/utils/money";

export function PriceAmount({ value, className }: { value: string | null; className?: string }) {
  return <span className="inline-flex flex-col gap-1">
    <span className={cn("font-semibold", className)}>{formatKoreanWon(value)}</span>
    {value !== null && <span className="text-xs font-normal text-muted-foreground">{formatWon(value)}</span>}
  </span>;
}
