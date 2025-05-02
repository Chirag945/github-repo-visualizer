"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <Button variant="outline" size="icon" className="w-10 h-10 rounded-full" />
  }

  // Use resolvedTheme instead of theme to get the actual applied theme
  const currentTheme = resolvedTheme || "system"
  const isDark = currentTheme === "dark"

  return (
    <Button
      variant="outline"
      size="icon"
      className="w-10 h-10 rounded-full"
      onClick={() => {
        setTheme(isDark ? "light" : "dark")
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Show sun icon when in dark mode, moon icon when in light mode */}
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  )
}
