import { Construction } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Honest placeholder. It says what the screen will do and what is missing,
 * rather than faking a working surface.
 */
export function NotBuiltYet({ title, blockedOn }: { title: string; blockedOn: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Construction className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>Not built yet.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{blockedOn}</CardContent>
    </Card>
  )
}
