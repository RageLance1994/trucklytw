"use client"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-6">

        {/* Left: Logo */}
        <div className="text-xl font-bold tracking-tight">Truckly</div>

        {/* Center Menu */}
        <nav className="flex items-center gap-8 text-sm">

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1">
                Fleet <span>▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[140px]">
              <DropdownMenuItem>Vehicles</DropdownMenuItem>
              <DropdownMenuItem>Drivers</DropdownMenuItem>
              <DropdownMenuItem>Routes</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1">
                Analytics <span>▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[140px]">
              <DropdownMenuItem>Fuel</DropdownMenuItem>
              <DropdownMenuItem>Events</DropdownMenuItem>
              <DropdownMenuItem>Compliance</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1">
                Settings <span>▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[140px]">
              <DropdownMenuItem>Users</DropdownMenuItem>
              <DropdownMenuItem>Integrations</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </nav>

        {/* Right: User */}
        <div className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          AB
        </div>

      </div>
    </header>
  )
}
