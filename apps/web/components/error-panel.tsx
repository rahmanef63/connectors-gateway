"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Shared error-boundary body. The caught error is NEVER rendered: a message can
 * carry a token, a Convex function path or a local filesystem path (P0). The
 * digest is a Next-generated correlation id and is safe to show.
 */
export function ErrorPanel({
  title,
  error,
  reset,
}: {
  title: string
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>
          Something went wrong on this screen. Nothing was changed by the failure.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {error.digest ? (
          <p>
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : (
          <p>No reference id was produced for this failure.</p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={reset}>Try again</Button>
      </CardFooter>
    </Card>
  )
}
