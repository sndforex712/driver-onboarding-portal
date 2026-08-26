---
name: Orval barrel exports
description: Contract regeneration can append a conflicting type barrel export in api-zod.
---

Keep the generated Zod validators as the direct public API and expose generated component models through the existing `ApiTypes` namespace, rather than adding a wildcard type-barrel export.

**Why:** An operation validator and its generated parameter model may have the same exported name. A second wildcard barrel export makes TypeScript reject the library because the name becomes ambiguous.

**How to apply:** After regenerating API contracts, inspect the api-zod public index for an added wildcard export of generated types. Retain the namespaced component-model export and preserve any existing intentional generated-validator behavior unrelated to the schema change.