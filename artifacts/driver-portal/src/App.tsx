import { Switch, Route } from 'wouter';
import { DriverProvider } from '@/context/driver-context';
import { LinkEntry } from '@/pages/link-entry';
import { Home } from '@/pages/home';
import { Documents } from '@/pages/documents';
import { Instructions } from '@/pages/instructions';
import { Help } from '@/pages/help';
import { NotFound } from '@/pages/not-found';

export default function App() {
  return (
    <DriverProvider>
      <Switch>
        <Route path="/link/:token">{(params) => <LinkEntry token={params.token} />}</Route>
        <Route path="/" component={Home} />
        <Route path="/documents" component={Documents} />
        <Route path="/instructions" component={Instructions} />
        <Route path="/help" component={Help} />
        <Route component={NotFound} />
      </Switch>
    </DriverProvider>
  );
}
