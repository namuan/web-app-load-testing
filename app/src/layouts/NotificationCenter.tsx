import { useEffect, useRef } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react';
import type { AppNotification } from '@/lib/api';
import { useNotificationStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';

interface Props {
  serverNotifications: AppNotification[];
  onClose: () => void;
}

const iconFor: Record<string, JSX.Element> = {
  info: <Info className="h-4 w-4 text-blue-500" />,
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
};

export function NotificationCenter({ serverNotifications, onClose }: Props) {
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid="notification-center"
      className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover text-popover-foreground shadow-xl animate-fade-in"
    >
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="font-semibold">Notifications</h3>
        <Button variant="ghost" size="sm" onClick={markAllRead}>
          Mark all read
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto scrollbar-thin">
        {items.length > 0 && (
          <div className="border-b">
            <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground">Inbox</p>
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={cn(
                  'flex w-full items-start gap-3 border-b p-3 text-left text-sm transition-colors hover:bg-accent',
                  !n.read && 'bg-accent/40',
                )}
              >
                {iconFor[n.type] ?? iconFor.info}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="px-3 pt-2 text-xs font-semibold text-muted-foreground">System</p>
        {serverNotifications.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No notifications.</p>
        ) : (
          serverNotifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 border-b p-3 text-sm last:border-b-0"
            >
              {iconFor[n.type] ?? iconFor.info}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(n.at)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
