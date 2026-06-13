import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, BarChart3, FileText, Settings, Users, UserCircle, LayoutDashboard } from 'lucide-react';

const items = [
  { to: '/dashboard', title: 'Dashboard', description: 'KPIs, charts, and recent activity.', icon: LayoutDashboard },
  { to: '/analytics', title: 'Analytics', description: 'Time series and acquisition channels.', icon: BarChart3 },
  { to: '/reports', title: 'Reports', description: 'Search, filter, sort, paginate.', icon: FileText },
  { to: '/users', title: 'Users', description: 'Heavy table with role, plan, status.', icon: Users },
  { to: '/settings', title: 'Settings', description: 'Theme, notifications, privacy.', icon: Settings },
  { to: '/profile', title: 'Profile', description: 'Form with Zod validation.', icon: UserCircle },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8" data-testid="home-page">
      <header className="space-y-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Acme Console</h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          A heavy, offline-first demo SPA. Everything runs locally — no CDNs, no analytics,
          no third-party calls. Press <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">⌘K</kbd>{' '}
          to search, or jump straight into a section below.
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild>
            <Link to="/dashboard">
              Open dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/reports">Browse reports</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link key={item.to} to={item.to} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <span className="inline-flex items-center text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open <ArrowRight className="ml-1 h-3 w-3" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Keyboard shortcuts</CardTitle>
          <CardDescription>Move faster across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Shortcut combo="⌘ K" description="Open search" />
            <Shortcut combo="G then D" description="Go to Dashboard" />
            <Shortcut combo="G then U" description="Go to Users" />
            <Shortcut combo="G then R" description="Go to Reports" />
            <Shortcut combo="?" description="Show this help" />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Shortcut({ combo, description }: { combo: string; description: string }) {
  return (
    <li className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
      <span>{description}</span>
      <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs">{combo}</kbd>
    </li>
  );
}
