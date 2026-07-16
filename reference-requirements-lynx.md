# Reference product notes — "LYNX" LINE-first CRM

## What this is

A high-level summary of a competitor/reference product called **LYNX**
(リンクス, "LINE-FIRST CRM"), reverse-engineered from ~99 screenshots of it
in live use by a hair/scalp-diagnosis salon client, managed by an agency.
Screenshots: `/Users/fatcat/Documents/buzz/static/LINE_ALBUM_バイオテックLINE管理システム画面_260715_*.jpg`.

**Purpose:** give a planning session a map of what a mature product in this
space covers, so it can decide what's worth borrowing and when. This is
aspirational reference material, not a backlog — per this repo's
`CLAUDE.md`, the current build is a small SQLite-only test prototype, and
nothing below should be built without checking it against the live
`readme.md` roadmap first.

## Product framing

Built for **agencies managing many client LINE accounts**: workspace →
client → LINE channel hierarchy, one client can have several LINE OAs
(customer-facing, recruiting, etc.), passwordless client login, mixed
agency/client staff in one org.

## Feature pillars

- **Onboarding & ops health** — a fixed setup checklist (connect LINE →
  track inflow → get first friends → staff profile → drip scenario → rich
  menu → loyalty → booking → first broadcast), plus a systemic "is
  everything wired up" health dashboard and a live preview of what a new
  follower actually sees.
- **Multi-channel LINE connection** — one shared webhook per workspace,
  auto-routed internally by LINE's `destination` field, with a per-channel
  "forward to another vendor's webhook" option so LYNX can be the sole
  receiver while coexisting with other tools. LIFF is optional but gates a
  documented subset of features (bookings, loyalty, quizzes, identity
  capture) if missing.
- **Customer data** — searchable/taggable customer list mixing LINE-linked
  and manually-entered contacts, admin-definable custom fields, shared
  key-value snippets for message templating, CSV import/export, Gmail
  merge into the same timeline, and AI-suggested follow-up nudges for
  stalled conversations.
- **Chat inbox & AI response** — unified inbox (needs-response/snoozed/
  resolved) with four AI modes (auto/assist/manual/test), multi-signal
  escalation to a human (confidence, urgency score, topic/keyword match),
  a knowledge base the AI cites (bulk-buildable from CSV/URL/YouTube/past
  chats), and vision-based photo classification feeding customer
  attributes.
- **Broadcast & scenarios** — drip campaigns triggered by follow or by a
  customer-attribute change, segment-targeted one-off broadcasts (by inflow
  source or behavioral filter), reusable rich message templates, and
  configurable auto-reply/away-message rules.
- **Acquisition & attribution** — per-source tracking codes/QRs with
  auto-actions on arrival, rich menu as an automation trigger (not just
  links), referral campaigns, link/conversion funnel tracking, and
  server-side ad conversion sync to Meta/TikTok/LINE Ads/GA4.
- **Loyalty & engagement** — coupons, stamp cards, receipt-photo OCR
  point-awarding (with an optional human-approval mode), bulk point/coupon/
  gift-code distribution, live event quizzes/polls/predictions, RSVP
  events, AI-drafted surveys, a cross-industry mini-app template gallery,
  and a lightweight gig-matching marketplace.
- **Commerce** — product catalog (manual/CSV/Amazon-sync/feed), an
  embeddable inquiry-funnel script that turns any external site into a LINE
  lead funnel, calendar-backed booking pages, and Stripe Connect payments.
- **Sales pipeline** — a Kanban board of deals tied to LINE contacts, with
  per-stage value rollups and an optional AI auto-update from conversation
  content.
- **Staff & permissions** — a 4-tier visibility model (Member → Supervisor →
  Admin → Owner), per-staff profiles/shifts feeding booking availability,
  and a gated native staff app.
- **Analytics** — a daily-snapshot dashboard, a multi-channel rollup view,
  and a monthly client-facing "ROI" report framed around AI-estimated hours
  saved (useful for renewal/subsidy conversations).

## Patterns most relevant to this project right now

- **Webhook multi-tenancy solution** (§ above) is the most directly
  applicable precedent — it's the same "only one tool can own the webhook"
  constraint flagged in `CLAUDE.md`, solved by owning the endpoint and
  fanning out server-side.
- **Customer data model**: one table blending LINE-linked and
  non-LINE-linked contacts, with tags/attributes as the shared automation
  trigger bus across otherwise-unrelated features (a survey completing, a
  photo being classified, and a diagnosis finishing all just "set an
  attribute," which anything else can trigger off of).
- **UI conventions worth copying later**: consistent empty-states with an
  inline create CTA, "(optional)" inline field labeling, an AI-generate
  panel pattern (prompt box + generate button) reused everywhere content
  needs drafting, and a 3-tier green/yellow/red status vocabulary for
  "is this configured correctly."

## Caveat

This reflects one client's *configured instance*, not LYNX's own product
docs — some inferred behavior (exact segment logic, pipeline AI-update
rules) is a best guess from UI copy and should be validated, not assumed.
