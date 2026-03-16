'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUser } from '@/hooks/auth/useUser';
import { apiPost, getApiErrorMessage, unwrapApiResponse } from '@/lib/apiClient';
import type { GetCurrentUserResponse } from '@/types/contract';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, loading: userLoading } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userLoading && isAuthenticated) {
      router.replace('/tables');
    }
  }, [isAuthenticated, router, userLoading]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);

    try {
      await unwrapApiResponse(
        apiPost<GetCurrentUserResponse, { username: string; password: string }>(
          '/api/auth/login',
          {
            username: username.trim(),
            password,
          },
        ),
      );

      router.replace('/tables');
      router.refresh();
    } catch (submitError) {
      toast.error(
        getApiErrorMessage(
          submitError,
          'Giriş başarısız. Kullanıcı adı veya şifreyi kontrol edin.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.08),_transparent_28%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted))/0.55)] px-4">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5">
        <h1 className="-translate-y-[22px] text-center text-3xl font-semibold tracking-tight">
          Soprano Cafe
        </h1>

        <Card className="w-full border-border/60 bg-card/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-center text-2xl font-semibold">Giriş Yap</CardTitle>
          </CardHeader>

          <CardContent className="pt-2">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Kullanıcı adı"
                className="h-11"
                required
              />

              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Şifre"
                className="h-11"
                required
              />

              <Button type="submit" disabled={submitting} className="h-11 w-full">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Giriş yapılıyor
                  </>
                ) : (
                  'Giriş Yap'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
