import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface Column<T> {
  id: string;
  header: string;
  accessor: (row: T) => unknown;
  sortValue?: (row: T) => string | number;
  className?: string;
  cell?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  searchPlaceholder?: string;
  onSearch?: (q: string) => void;
  searchValue?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  testId?: string;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  initialSort?: { id: string; dir: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
}

type SortState = { id: string; dir: 'asc' | 'desc' } | null;

export function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  searchPlaceholder = 'Search…',
  onSearch,
  searchValue,
  isLoading,
  emptyMessage = 'No results.',
  testId,
  toolbarLeft,
  toolbarRight,
  initialSort,
  onRowClick,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [internalQuery, setInternalQuery] = useState('');

  useEffect(() => {
    setPage(0);
  }, [data, size, searchValue]);

  const query = searchValue ?? internalQuery;
  const filtered = useMemo(() => {
    if (!onSearch || query === '') return data;
    return data;
  }, [data, onSearch, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.id);
    if (!col) return filtered;
    const getter = col.sortValue ?? col.accessor;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = getter(a) as string | number;
      const vb = getter(b) as string | number;
      if (va === vb) return 0;
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb));
    });
    if (sort.dir === 'desc') copy.reverse();
    return copy;
  }, [filtered, sort, columns]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pageCount - 1);
  const slice = sorted.slice(safePage * size, safePage * size + size);

  const toggleSort = (id: string) => {
    setSort((curr) => {
      if (!curr || curr.id !== id) return { id, dir: 'asc' };
      if (curr.dir === 'asc') return { id, dir: 'desc' };
      return null;
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          {onSearch && (
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid={`${testId}-search`}
                aria-label="Search"
                placeholder={searchPlaceholder}
                className="pl-9"
                value={query}
                onChange={(e) => {
                  const v = e.target.value;
                  if (searchValue === undefined) setInternalQuery(v);
                  onSearch(v);
                }}
              />
            </div>
          )}
          {toolbarLeft}
        </div>
        <div className="flex items-center gap-2">
          {toolbarRight}
          <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
            <SelectTrigger className="h-9 w-[110px]" aria-label="Page size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                const active = sort?.id === col.id;
                return (
                  <TableHead
                    key={col.id}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(col.className, isSortable && 'cursor-pointer select-none')}
                    onClick={() => isSortable && toggleSort(col.id)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {isSortable && (
                        <ArrowUpDown
                          className={cn(
                            'h-3 w-3',
                            active ? 'text-foreground' : 'text-muted-foreground/50',
                          )}
                        />
                      )}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.id}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : slice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              slice.map((row, i) => (
                <TableRow
                  key={i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {columns.map((c) => (
                    <TableCell key={c.id} className={c.className}>
                      {c.cell ? c.cell(row) : (c.accessor(row) as React.ReactNode)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          Showing {total === 0 ? 0 : safePage * size + 1}-{Math.min(total, (safePage + 1) * size)} of {total}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setPage(0)} disabled={safePage === 0} aria-label="First page">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-sm">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(pageCount - 1)}
            disabled={safePage >= pageCount - 1}
            aria-label="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
