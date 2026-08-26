---
name: Recruiting Operational Metadata
description: Rules for presenting imported legacy profile information without exposing technical source identifiers.
---

Technical import identifiers such as `google-sheet:` source IDs are audit/debug metadata only. Do not show them in ordinary Recruiting lists, dashboard/war-room panels, pipeline cards, or standard case headers.

**Why:** Operational users need the driver’s actionable phone, type, and truck information—not implementation identifiers that are confusing and leak internal integration structure.

**How to apply:** List APIs should provide nullable main-tab legacy phone, driver type, and truck text efficiently in the existing query. Render an em dash when unavailable; label imported cases with safe operational names such as `JIDO workbook`. Direct Recruiting deep links must select the Recruiting route even in a fresh session.