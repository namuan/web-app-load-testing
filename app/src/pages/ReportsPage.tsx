import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Report } from '@/lib/api';
import { useFilterStore } from '@/stores';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/DataTable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { formatDate, formatNumber } from '@/lib/utils';
import { FileText, Eye, Trash2, Download } from 'lucide-react';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'secondary'> = {
  published: 'success',
  draft: 'secondary',
  review: 'warning',
};

export default function ReportsPage() {
  const { reports, setReports } = useFilterStore();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reports', reports],
    queryFn: () => api.getReports({ q: reports.q, type: reports.type, status: reports.status }),
  });
  const { toast } = useToast();
  const [selected, setSelected] = useState<Report | null>(null);
  const [drawerReport, setDrawerReport] = useState<Report | null>(null);
  const [drawerNote, setDrawerNote] = useState('');

  const columns: Column<Report>[] = [
    {
      id: 'title',
      header: 'Title',
      accessor: (r) => r.title,
      sortValue: (r) => r.title,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.title}</p>
          <p className="text-xs text-muted-foreground">{r.id}</p>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      accessor: (r) => r.type,
      cell: (r) => <Badge variant="info">{r.type}</Badge>,
      width: '120px',
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (r) => r.status,
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>{r.status}</Badge>,
      width: '110px',
    },
    {
      id: 'author',
      header: 'Author',
      accessor: (r) => r.author,
      cell: (r) => <span>{r.author}</span>,
      width: '180px',
    },
    {
      id: 'rows',
      header: 'Rows',
      accessor: (r) => r.rows,
      cell: (r) => <span className="font-mono">{formatNumber(r.rows)}</span>,
      width: '100px',
    },
    {
      id: 'size',
      header: 'Size',
      accessor: (r) => r.size,
      width: '90px',
    },
    {
      id: 'createdAt',
      header: 'Created',
      accessor: (r) => r.createdAt,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>,
      width: '130px',
    },
    {
      id: 'actions',
      header: '',
      accessor: () => '',
      sortable: false,
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="View"
            onClick={(e) => {
              e.stopPropagation();
              setSelected(r);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Download"
            onClick={(e) => {
              e.stopPropagation();
              toast({ title: 'Download started', description: r.title });
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete"
            onClick={(e) => {
              e.stopPropagation();
              toast({ variant: 'destructive', title: 'Report deleted', description: r.title });
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      width: '140px',
    },
  ];

  return (
    <div className="grid gap-6" data-testid="reports-page">
      <header className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Search, filter, sort, and review report records.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <FileText className="mr-2 h-4 w-4" /> New report
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create report</DialogTitle>
              <DialogDescription>This is a UI-only mock action.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <input
                id="title"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Q3 Revenue Recap"
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() =>
                  toast({ title: 'Report queued', description: 'Mock data — no real persistence.' })
                }
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow down by type or status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label>Type</Label>
            <Select
              value={reports.type || 'all'}
              onValueChange={(v) => setReports({ type: v === 'all' ? '' : v })}
            >
              <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
                <SelectItem value="analytics">Analytics</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="operations">Operations</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="product">Product</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Status</Label>
            <Select
              value={reports.status || 'all'}
              onValueChange={(v) => setReports({ status: v === 'all' ? '' : v })}
            >
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="review">In review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Result</Label>
            <p className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
              {data?.total ?? 0} matching reports
            </p>
          </div>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <DataTable
          testId="reports-table"
          data={data.reports}
          columns={columns}
          pageSize={8}
          onSearch={(q) => setReports({ q })}
          searchValue={reports.q}
          onRowClick={(r) => setDrawerReport(r)}
        />
      )}

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected?.id} · {selected?.type} · {selected?.status}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Author:</span> {selected?.author}
            </p>
            <p>
              <span className="text-muted-foreground">Rows:</span> {formatNumber(selected?.rows ?? 0)}
            </p>
            <p>
              <span className="text-muted-foreground">Size:</span> {selected?.size}
            </p>
            <p>
              <span className="text-muted-foreground">Created:</span>{' '}
              {selected ? formatDate(selected.createdAt) : ''}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawer (inline panel, no portal) */}
      {drawerReport && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/50"
          onClick={() => setDrawerReport(null)}
        >
          <div
            data-testid="report-drawer"
            className="h-full w-full max-w-md overflow-y-auto border-l bg-background p-6 shadow-xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{drawerReport.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {drawerReport.id} · {drawerReport.type} · {drawerReport.status}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDrawerReport(null)}>
                Close
              </Button>
            </header>
            <div className="grid gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">Author:</span> {drawerReport.author}
              </p>
              <p>
                <span className="text-muted-foreground">Rows:</span> {formatNumber(drawerReport.rows)}
              </p>
              <p>
                <span className="text-muted-foreground">Size:</span> {drawerReport.size}
              </p>
              <p>
                <span className="text-muted-foreground">Created:</span> {formatDate(drawerReport.createdAt)}
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              <Label htmlFor="note">Add review note</Label>
              <Textarea
                id="note"
                placeholder="Notes for the author…"
                value={drawerNote}
                onChange={(e) => setDrawerNote(e.target.value)}
              />
              <Button
                onClick={() => {
                  toast({ title: 'Note saved', description: drawerNote || '(empty)' });
                  setDrawerNote('');
                  setDrawerReport(null);
                }}
              >
                Save note
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tip: hit{' '}
        <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">/</kbd>{' '}
        to focus search. Click a row to open the side panel.
      </p>
      <Button variant="ghost" className="self-start" onClick={() => refetch()}>
        Refresh
      </Button>
    </div>
  );
}
