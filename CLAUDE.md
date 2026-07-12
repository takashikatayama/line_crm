# CLAUDE.md — OSM Hair Water LINE CRM

## Source of truth
**`readme.md`** is the canonical spec: what this is, target architecture, tech
stack, repo structure, and the phased build roadmap (Phase 1 step-by-step).
It is a living document and **subject to change** as requirements firm up —
always re-read it before starting work rather than relying on memory of it.
This file only holds working-style rules for Claude Code that don't belong in
the README.

## The core concept (important — don't lose this)
LINE does NOT hand over a customer database. You build the DB yourself by
making this platform the account's **webhook endpoint**: every follow /
message / tap is POSTed to our server as an event, and we store it. That
accumulated event log IS the "customer database." Data only accrues from the
moment our webhook goes live — there is no historical backfill.

## Where we are
The echo bot (webhook receive → reply) is proven working on the OSM test
account — see readme.md §2 "Current status". That's the seed the hardened
`server/webhook` module grows from in Phase 1, Step 2. Check readme.md §7 for
the current step before picking up new work; steps are meant to be finished
and verified in order.

## Working style for Claude Code in this repo
- Build one Phase 1 step at a time, in the order listed in readme.md §7.
  Finish and verify a step (its "done when") before starting the next.
- If a task looks like it belongs to Phase 2–4 (readme.md §6) or is otherwise
  not part of the current step, ask before building it.
- The roadmap and repo structure in readme.md are expected to change as the
  client requirements firm up — if a step or architecture choice looks stale
  or contradicted by what's actually in the repo, flag it and confirm rather
  than silently building around the mismatch.
- Respect the cross-cutting rules in readme.md §8 (webhook always 200-fast,
  one webhook per channel, key data by account/channel for future multi-
  tenancy, secrets encrypted, RBAC everywhere) in every step, not just when
  explicitly reminded.
- Never commit secrets; keep them in `.env` (gitignored).

## Key LINE constraints to remember
- **One webhook URL per channel.** Only one tool can own it at a time (that's
  why L Message / エルメ had to be disconnected from the test account).
- User ID from LINE is an opaque per-channel id — NOT phone/email/real name.
  Profile API gives display name, picture, status message, language only.
- Full follower list fetch is gated to Verified/Premium accounts — assume "no
  backfill, capture forward only" until the account tier is confirmed.
- Reply messages use a short-lived `replyToken` from the webhook and are
  FREE; push messages count against a paid monthly quota.

## Credentials needed
- Channel secret — LINE Developers Console → channel → Basic settings tab.
- Channel access token — LINE Developers Console → channel → Messaging API
  tab → Issue (long-lived).
- Store them in `.env` (never commit them): `LINE_CHANNEL_SECRET`,
  `LINE_CHANNEL_ACCESS_TOKEN`, plus whatever readme.md's `.env.example` adds
  per step (e.g. `DATABASE_URL` from Step 2 onward).
