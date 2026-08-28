---
name: App Storage in the pnpm monorepo
description: Non-obvious dependency resolution and initialization constraints for the Replit App Storage JavaScript SDK.
---

Install App Storage dependencies against the consuming pnpm workspace, not the repository root. The bundled API server may also need the SDK's cloud-storage runtime dependency declared directly because the build externalizes it.

**Why:** A root-level add can report success without creating an importer entry, while an API build can succeed and then fail at runtime resolving the SDK's external dependency.

**How to apply:** Use the API package filter for dependency changes, then verify the built server process—not only TypeScript. Keep the SDK client lazy and immediately await an operation; eager module-level construction can produce an unhandled initialization rejection when no default bucket has been provisioned.