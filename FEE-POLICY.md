# Fee policy

Spectacle exists so both the marketing provider and the marketing purchaser
**keep more**. Closed booking platforms take a larger cut. The **~18% cut**
figure is framing for that class of take — not a named competitor's
published rate, and not a number invented for a specific firm.

## The live number

The take is the integer column `platform_config.fee_bps`.

Today that singleton row is **1000** basis points — **10% of the booking**
(package price plus the chosen usage-rights option).

The **database is authoritative**. `PLATFORM_FEE_BPS` in the environment
feeds UI estimates only. `booking_status_transition()` (SECURITY DEFINER,
owner-owned) re-derives `fee_cents` from `packages` +
`usage_rights_options` + `platform_config` at `inquiry → proposal`.
Changing the env var does not change what the database writes.

A different default than 1000 is a product decision and must be recorded
in [PROGRESS.md](PROGRESS.md) before the schema default moves.

## Who pays it

`fee_cents = floor(price_cents × fee_bps / 10000)`.

The booking total shown to both parties is `price_cents + fee_cents`. The
purchaser (brand) is the one who would pay that total. The provider's
package-plus-rights figure is `price_cents` and is not reduced by the fee.
The platform's take is `fee_cents`.

Nothing is charged today. There is no card capture and no payout. The
columns still account the split so a later money-in phase does not invent
a new formula. Until then the booking stops at `awaiting_payment` with
`payment_state = none`. When funds move, the status is `funded`.

## Who can change it

`app_user` cannot write `platform_config`. There is no SELECT, INSERT, or
UPDATE grant to `app_user` or `auth_user` (`REVOKE ALL` in the journal).
Row-level security is enabled with no policies, so a tenant role is denied
even if a grant were added later. Only `spectacle_owner` (table owner)
can change `fee_bps`.

Self-host operators who own the database may set their own row. That is
an operator choice, not a change to this repository's default.

## How to read the live row

As `spectacle_owner` (never as `app_user`):

```sql
SELECT fee_bps FROM platform_config WHERE id = 1;
```

1000 means 10%. The env var is not this query.
