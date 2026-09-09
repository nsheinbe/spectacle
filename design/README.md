# Design reference

Live Claude Design exports for BUILD-PLAN Phase 1.
Source: https://claude.ai/design/p/d2d84e31-7d1f-45fc-93ea-b653ea666460
Rebuild components properly — exports are reference, not production markup.

| File | Artboard |
| --- | --- |
| `home.dc.html` | Spectacle Home |
| `booking-rail.dc.html` | Booking Rail |
| `creator-storefront.dc.html` | Creator Storefront |
| `theme-contract.dc.html` | Theme Contract |

Honesty deviations (invariant wins) are logged in [`PROGRESS.md`](../PROGRESS.md).
The shipped homepage uses `LAUNCH_COPY` (`src/lib/launch-copy.ts`): no invented
GMV/ratings, no `/browse` while `FEATURE_BROWSE` is false, no briefs CTA, and
payment language that matches what the app does today.
