import { Card } from '@/components/ui/card';

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm text-center">
        <p className="text-lg font-bold">Page not found</p>
      </Card>
    </div>
  );
}
