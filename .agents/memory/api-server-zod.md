---
name: API Server Zod Pattern
description: api-server has no direct zod dependency; pattern for using generated schemas + manual validation for extra fields
---

## Constraint
The api-server package has NO direct zod dependency. It receives zod schemas through @workspace/api-zod but cannot import zod or zod/v4 directly.

**Why:** package.json only lists @workspace/api-zod and @workspace/db as workspace deps; zod is not in dependencies or devDependencies.

## Pattern for base body validation
Use the generated schemas from @workspace/api-zod (e.g. SimulateHiredEventBody.safeParse(req.body)).
These schemas are already typed; inference works correctly from them.

## Pattern for EXTRA fields beyond generated schema
Do NOT use .extend() — it requires a zod import and the inferred type degrades to {} on type mismatch.
Instead: define a plain TS interface for the extras, extract them with a typed helper function.

```typescript
interface MyExtras { notes?: string; documents?: DocStub[]; }

function extractExtras(body: Record<string, unknown>): MyExtras {
  const extras: MyExtras = {};
  if (typeof body.notes === "string") extras.notes = body.notes;
  // ...
  return extras;
}

// In handler:
const body = SomeGeneratedSchema.safeParse(req.body);
const extras = extractExtras(req.body as Record<string, unknown>);
```

## Pattern for inline validation without zod (route-local schemas)
Use manual parse functions that return the parsed value or an error string:

```typescript
function parseFoo(body: unknown): { field?: string } | string {
  if (typeof body !== "object" || body === null) return "Body must be object";
  const b = body as Record<string, unknown>;
  const result: { field?: string } = {};
  if (b.field !== undefined) {
    if (typeof b.field !== "string") return "field must be string";
    result.field = b.field;
  }
  return result;
}
// In handler:
const parsed = parseFoo(req.body);
if (typeof parsed === "string") { res.status(400).json({ error: parsed }); return; }
```

## Frontend type pattern
@workspace/api-zod is NOT available in the frontend (franklins-onboarding only has @workspace/api-client-react).
To add fields to a generated type, use `any`:
```typescript
type DriverWithCase = any; // cast rawDriver as unknown as DriverWithCase | undefined
```
