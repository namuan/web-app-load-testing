import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  bio: z.string().max(280, 'Keep your bio under 280 characters').optional(),
});

type FormValues = z.infer<typeof schema>;

export default function ProfilePage() {
  const { data, isLoading } = useQuery({ queryKey: ['profile'], queryFn: api.getProfile });
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', bio: '' },
  });

  const updateMut = useMutation({
    mutationFn: (values: FormValues) =>
      Promise.resolve({ ...data, ...values }),
    onSuccess: (res) => {
      reset({ name: res.name, email: res.email, bio: res.bio });
      toast({ title: 'Profile updated' });
    },
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96" />;
  }

  return (
    <div className="grid gap-6" data-testid="profile-page">
      <header className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
          {data.name
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
          <p className="text-sm text-muted-foreground">
            {data.role} · {data.plan} · Member since {formatDate(data.memberSince)}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="info">{data.role}</Badge>
            <Badge variant="success">{data.plan}</Badge>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>Update how others see you across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={handleSubmit((values) => updateMut.mutate(values))}
          >
            <div className="grid gap-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" defaultValue={data.name} {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid gap-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue={data.email} {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" defaultValue={data.bio} {...register('bio')} />
              {errors.bio && <p className="text-xs text-destructive">{errors.bio.message}</p>}
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => reset()}>
                Discard
              </Button>
              <Button type="submit" disabled={!isDirty || isSubmitting}>
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Devices that have signed in to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {[
              { device: 'MacBook Pro · Chrome', location: 'Local network', current: true, at: '2026-06-13T09:14:00Z' },
              { device: 'iPhone · Safari', location: 'Local network', current: false, at: '2026-06-12T18:20:00Z' },
              { device: 'iPad · Safari', location: 'Local network', current: false, at: '2026-06-10T07:30:00Z' },
            ].map((s, i) => (
              <li key={i} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {s.device} {s.current && <Badge variant="success">current</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.location} · last active {formatDate(s.at)}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toast({ title: 'Session revoked' })}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
