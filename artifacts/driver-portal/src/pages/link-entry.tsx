import { useEffect, useState } from 'react';
import { Redirect } from 'wouter';
import { useDriver } from '@/context/driver-context';
import { Card } from '@/components/ui/card';

export function LinkEntry({ token }: { token: string }) {
  const { signIn } = useDriver();
  const [result, setResult] = useState<'checking' | 'valid' | 'invalid'>('checking');

  useEffect(() => {
    const match = signIn(token);
    setResult(match ? 'valid' : 'invalid');
    // Only re-run if the token in the URL actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (result === 'checking') return null;
  if (result === 'valid') return <Redirect to="/" />;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm text-center">
        <p className="text-lg font-bold">This link has expired</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Text or call your recruiter to get a new onboarding link.
        </p>
      </Card>
    </div>
  );
}
