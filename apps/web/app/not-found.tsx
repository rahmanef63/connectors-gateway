import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>
            That address does not exist in this dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          If you followed a pairing link, check the code has not been truncated.
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/devices">Go to Devices</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
