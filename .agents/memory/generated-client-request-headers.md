---
name: Generated client request headers
description: Header compatibility rule for the OpenAPI-generated React client.
---

When adding request headers around an OpenAPI-generated client operation, pass them as a plain record rather than a `Headers` instance.

**Why:** Generated operations merge request headers with object spread. A `Headers` instance has no enumerable header properties, so values such as `Idempotency-Key` silently disappear before the request reaches the API.

**How to apply:** Normalize any `HeadersInit` value to a plain string record before calling a generated operation, preserving existing headers and then adding the required header.