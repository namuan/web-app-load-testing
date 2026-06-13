import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type User } from '@/lib/api';
import { useFilterStore } from '@/stores';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/DataTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { relativeTime } from '@/lib/utils';
import { Mail, MessageSquare, Shield } from 'lucide-react';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  active: 'success',
  invited: 'warning',
  churned: 'destructive',
};

export default function UsersPage() {
  const { users, setUsers } = useFilterStore();
  const { data, isLoading } = useQuery({
    queryKey: ['users', users],
    queryFn: () => api.getUsers({ q: users.q, role: users.role, status: users.status, plan: users.plan }),
  });
  const { toast } = useToast();
  const [detail, setDetail] = useState<User | null>(null);
  const [action, setAction] = useState<'email' | 'message' | 'role' | null>(null);

  const columns: Column<User>[] = [
    {
      id: 'name',
      header: 'Name',
      accessor: (u) => u.name,
      cell: (u) => (
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-semibold">
            {initials(u.name)}
          </div>
          <div>
            <p className="font-medium">{u.name}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      accessor: (u) => u.role,
      cell: (u) => <Badge variant="outline">{u.role}</Badge>,
      width: '100px',
    },
    {
      id: 'plan',
      header: 'Plan',
      accessor: (u) => u.plan,
      cell: (u) => <Badge variant="info">{u.plan}</Badge>,
      width: '110px',
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (u) => u.status,
      cell: (u) => <Badge variant={STATUS_VARIANT[u.status] ?? 'secondary'}>{u.status}</Badge>,
      width: '110px',
    },
    {
      id: 'lastSeen',
      header: 'Last seen',
      accessor: (u) => u.lastSeen,
      sortValue: (u) => new Date(u.lastSeen).getTime(),
      cell: (u) => <span className="text-muted-foreground">{relativeTime(u.lastSeen)}</span>,
      width: '130px',
    },
    {
      id: 'actions',
      header: '',
      accessor: () => '',
      sortable: false,
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDetail(u);
            }}
          >
            View
          </Button>
        </div>
      ),
      width: '100px',
    },
  ];

  return (
    <div className="grid gap-6" data-testid="users-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          {data?.total ?? 0} users · click a row for actions.
        </p>
      </header>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="invited">Invited</TabsTrigger>
          <TabsTrigger value="churned">Churned</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <FilterCard onChange={setUsers} state={users} />
          {isLoading || !data ? (
            <Skeleton className="h-96" />
          ) : (
            <DataTable
              testId="users-table"
              data={data.users}
              columns={columns}
              pageSize={10}
              onSearch={(q) => setUsers({ q })}
              searchValue={users.q}
              onRowClick={(u) => setDetail(u)}
            />
          )}
        </TabsContent>
        <TabsContent value="active">
          {isLoading || !data ? (
            <Skeleton className="h-96" />
          ) : (
            <DataTable
              testId="users-table"
              data={data.users.filter((u) => u.status === 'active')}
              columns={columns}
              pageSize={10}
            />
          )}
        </TabsContent>
        <TabsContent value="invited">
          {isLoading || !data ? (
            <Skeleton className="h-96" />
          ) : (
            <DataTable
              testId="users-table"
              data={data.users.filter((u) => u.status === 'invited')}
              columns={columns}
              pageSize={10}
            />
          )}
        </TabsContent>
        <TabsContent value="churned">
          {isLoading || !data ? (
            <Skeleton className="h-96" />
          ) : (
            <DataTable
              testId="users-table"
              data={data.users.filter((u) => u.status === 'churned')}
              columns={columns}
              pageSize={10}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>{detail?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Role:</span> {detail?.role}
            </p>
            <p>
              <span className="text-muted-foreground">Plan:</span> {detail?.plan}
            </p>
            <p>
              <span className="text-muted-foreground">Status:</span> {detail?.status}
            </p>
            <p>
              <span className="text-muted-foreground">Last seen:</span>{' '}
              {detail ? relativeTime(detail.lastSeen) : ''}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAction('email'); }}>
              <Mail className="mr-2 h-4 w-4" /> Email
            </Button>
            <Button variant="outline" onClick={() => { setAction('message'); }}>
              <MessageSquare className="mr-2 h-4 w-4" /> Message
            </Button>
            <Button onClick={() => { setAction('role'); }}>
              <Shield className="mr-2 h-4 w-4" /> Change role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={action !== null}
        onOpenChange={(o) => !o && setAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'email' && 'Send email'}
              {action === 'message' && 'Send message'}
              {action === 'role' && 'Change role'}
            </DialogTitle>
            <DialogDescription>Mock action for {detail?.email}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {action === 'role' && (
              <div className="grid gap-1">
                <Label>New role</Label>
                <Select defaultValue={detail?.role}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="manager">manager</SelectItem>
                    <SelectItem value="support">support</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {action !== 'role' && (
              <div className="grid gap-1">
                <Label>Message</Label>
                <textarea
                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Type your message…"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                toast({ title: 'Action complete', description: `Mock ${action} for ${detail?.email}` });
                setAction(null);
                setDetail(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterCard({
  state,
  onChange,
}: {
  state: { role: string; status: string; plan: string };
  onChange: (partial: Partial<{ role: string; status: string; plan: string }>) => void;
}) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Filters</CardTitle>
        <CardDescription>Refine the table by role, status, or plan.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label>Role</Label>
          <Select value={state.role || 'all'} onValueChange={(v) => onChange({ role: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
              <SelectItem value="manager">manager</SelectItem>
              <SelectItem value="support">support</SelectItem>
              <SelectItem value="user">user</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>Status</Label>
          <Select value={state.status || 'all'} onValueChange={(v) => onChange({ status: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="invited">invited</SelectItem>
              <SelectItem value="churned">churned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label>Plan</Label>
          <Select value={state.plan || 'all'} onValueChange={(v) => onChange({ plan: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="Free">Free</SelectItem>
              <SelectItem value="Pro">Pro</SelectItem>
              <SelectItem value="Team">Team</SelectItem>
              <SelectItem value="Enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
