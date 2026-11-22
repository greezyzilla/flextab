import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "~src/lib/utils"

/**
 * Tabs (TASK-103.6). Its one use is Settings › Spaces, so these defaults are that look: the list
 * above its panel (gap-7), a left-aligned row of triggers that wraps, on a bottom hairline; a
 * trigger caps at 12rem so a long space name truncates; the panel itself takes no focus ring.
 */
const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root ref={ref} className={cn("flex flex-col gap-7", className)} {...props} />
))
Tabs.displayName = TabsPrimitive.Root.displayName

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex flex-wrap items-center justify-start gap-1 rounded-none border-b border-ink/10 bg-transparent p-0 pb-3 text-fg-subtle",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex max-w-48 items-center justify-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium font-sans outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--accent-subtle)] data-[state=active]:text-fg-accent data-[state=inactive]:text-fg-subtle data-[state=inactive]:hover:bg-ink/[0.03] data-[state=inactive]:hover:text-fg-muted",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "outline-none",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
