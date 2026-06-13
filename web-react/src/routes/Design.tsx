import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AppShell } from '@/components/ui/app-shell'
import { H1, H2, H3, Lead, Muted, Prose } from '@/components/ui/typography'
import { Stack } from '@/components/ui/layout'

// Internal design-system gallery (M7). Not linked from the app nav; it renders
// every shared component and variant in one place so M7 can be verified visually
// against the frozen Flutter app and reused for the M18 side-by-side review.

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 border-t pt-8 first:border-t-0 first:pt-0">
      <H2>{title}</H2>
      {children}
    </section>
  )
}

const TOKENS = [
  'background',
  'foreground',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'border',
  'card',
] as const

export function Design() {
  return (
    <AppShell width="lg" brandTo="/design">
      <Stack gap={8}>
        <header>
          <H1>Design system</H1>
          <Lead>
            The M7 shared component layer, on the Material 3 indigo tokens
            ported from the Flutter app.
          </Lead>
        </header>

        <Section title="Color tokens">
          <div className="flex flex-wrap gap-3">
            {TOKENS.map((token) => (
              <div key={token} className="flex flex-col items-center gap-1">
                <div
                  className="size-16 rounded-lg border"
                  style={{ background: `var(--${token})` }}
                />
                <Muted className="text-xs">{token}</Muted>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <H1>Heading 1</H1>
          <H2>Heading 2</H2>
          <H3>Heading 3</H3>
          <Lead>Lead paragraph — a larger intro line.</Lead>
          <Prose>Body prose for longer-form copy and descriptions.</Prose>
          <Muted>Muted secondary text.</Muted>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
            <Button disabled>
              <Spinner /> Loading
            </Button>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </Section>

        <Section title="Form fields">
          <form
            className="max-w-md"
            onSubmit={(e) => {
              e.preventDefault()
              toast.success('Form submitted')
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="d-name">Name</FieldLabel>
                <Input id="d-name" placeholder="Ada Lovelace" />
                <FieldDescription>Shown to other voters.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="d-email">Email</FieldLabel>
                <Input
                  id="d-email"
                  type="email"
                  aria-invalid
                  placeholder="not-an-email"
                />
                <FieldError>Enter a valid email address.</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="d-bio">Description</FieldLabel>
                <Textarea id="d-bio" placeholder="A short description…" />
              </Field>
              <Field>
                <FieldLabel htmlFor="d-algo">Algorithm</FieldLabel>
                <Select>
                  <SelectTrigger id="d-algo">
                    <SelectValue placeholder="Choose an algorithm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approval">Approval</SelectItem>
                    <SelectItem value="irv">Instant runoff (IRV)</SelectItem>
                    <SelectItem value="star">STAR</SelectItem>
                    <SelectItem value="fptp">First past the post</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Button type="submit" className="w-fit">
                Submit
              </Button>
            </FieldGroup>
          </form>
        </Section>

        <Section title="Selection controls">
          <Field orientation="horizontal">
            <Switch id="d-switch" defaultChecked />
            <FieldLabel htmlFor="d-switch">Public ballots</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="d-check" defaultChecked />
            <FieldLabel htmlFor="d-check">
              Include first-past-the-post
            </FieldLabel>
          </Field>
          <RadioGroup defaultValue="approval" className="flex flex-col gap-2">
            <Field orientation="horizontal">
              <RadioGroupItem value="approval" id="d-r1" />
              <FieldLabel htmlFor="d-r1">Approval</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem value="star" id="d-r2" />
              <FieldLabel htmlFor="d-r2">STAR</FieldLabel>
            </Field>
          </RadioGroup>
        </Section>

        <Section title="Card">
          <Card className="max-w-sm">
            <CardHeader>
              <CardTitle>Best lunch spot</CardTitle>
              <CardDescription>Approval voting · 12 voters</CardDescription>
            </CardHeader>
            <CardContent>
              <Prose>Closes in 3 days. You haven&apos;t voted yet.</Prose>
            </CardContent>
            <CardFooter>
              <Button size="sm">Vote</Button>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Overlays & feedback">
          <div className="flex flex-wrap items-center gap-3">
            <Dialog>
              <DialogTrigger
                render={<Button variant="destructive">Delete election</Button>}
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this election?</DialogTitle>
                  <DialogDescription>
                    This permanently removes the election and all its ballots.
                    This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline">Cancel</Button>}
                  />
                  <DialogClose
                    render={
                      <Button
                        variant="destructive"
                        onClick={() => toast.success('Deleted')}
                      >
                        Delete
                      </Button>
                    }
                  />
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              onClick={() => toast('Heads up', { description: 'A toast.' })}
            >
              Show toast
            </Button>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading…
            </span>
          </div>
          <Separator />
          <Muted>Separator above.</Muted>
        </Section>
      </Stack>
    </AppShell>
  )
}
