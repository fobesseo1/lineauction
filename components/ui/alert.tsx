import * as React from "react";
import { cn } from "cn";

function Alert({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert" role="alert" className={cn("relative grid w-full grid-cols-[0_1fr] gap-y-1 rounded-xl border bg-card p-4 text-sm has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5", className)} {...props}/>;
}
function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 font-medium tracking-[-0.005em]", className)} {...props}/>;
}
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("col-start-2 text-sm text-muted-foreground", className)} {...props}/>;
}
export { Alert, AlertTitle, AlertDescription };
