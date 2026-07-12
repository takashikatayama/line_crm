# OSM Hair Water — LINE管理システム (LINE-first CRM)

Project README & build roadmap. This is the guiding document for development
(readable by Claude Code as project context). Build **in phases, starting from a
minimum core**, and calibrate all further estimates from the *actual* time the
core takes.

---

## 1. What this is

A LINE-first CRM for the **OSM Hair Water** brand (client: 株式会社ワンテンス /
BUZZTRIBE), specified in `docs/requirements_v0.x`. It replaces external tools
(L-Step / エルメ) with our own platform and adds the client's differentiator
features (source/ad attribution + AI engagement scoring).

Benchmark/reference: **LYNX (LINE-FIRST CRM)** — study for UX/feature ideas, do
**not** copy code or assets.

Operating model (v1.0): **one central LINE Official Account**; salons, stylists,
and ads are distinguished by **流入元 (source) codes**, not separate accounts.
Design the data model to allow future multi-account (per-salon) tenancy without
a rewrite.

---

## 2. Current status

- Echo bot foundation working on the **OSM test account** — webhook receive→reply
  proven. This is the seed the `server/webhook` module grows from.
- Channel secret + access token obtained; L Message disconnected from the test
  account (webhook slot free).
- Not yet built: everything below.

---

## 3. Target architecture

```
[LINE user] ──add / message / tap──▶ [LINE platform] ──webhook──▶ [server/webhook]
                                                                      │ verify, store, enqueue
        [LIFF app] ──ref + clickIDs──▶ [server/api] ◀── REST ── [web (admin PWA)]
                                          │                         (dashboard, customers,
                                   [PostgreSQL]                      karte, chat, source codes)
                                          ▲
                              [job queue + LLM] (AI drafts, broadcasts — later phases)
```

Five parts: **webhook receiver** (the hardened echo bot), **PostgreSQL** (the
customer DB built from events), **admin web app** (React, PWA-capable for mobile
chat), **LIFF app** (source tracking + forms), **job queue + LLM** (async work).

---

## 4. Tech stack

- **Backend:** Node.js + TypeScript, Express, `@line/bot-sdk`
- **Database:** PostgreSQL (NOT SQLite — spec assumes tens of thousands of friends)
- **Async:** Redis + a queue library (broadcasts, AI calls) — introduced when needed
- **Frontend:** React + TypeScript, PWA-enabled (mobile chat is required, NFR-8)
- **Auth:** passwordless magic-link (email), role-based access control
- **LIFF:** LINE Front-end Framework app for `ref` capture and forms
- **Hosting:** a real always-on host with a stable HTTPS webhook URL (ngrok is
  dev-only)
- **AI:** an LLM API, called asynchronously/batched for cost control (later phases)

---

## 5. Repository structure

```
osm-line-crm/
├── server/                 # Node+TS: webhook receiver + REST API + jobs
│   └── src/
│       ├── webhook/        # LINE webhook: verify → store → enqueue (200 fast)
│       ├── api/            # REST endpoints for the admin app
│       ├── line/          # LINE Messaging API client wrapper
│       ├── jobs/          # queue workers (AI drafts, broadcasts — later)
│       ├── db/            # schema, migrations, models
│       ├── auth/          # magic-link, sessions, RBAC
│       └── config/
├── web/                    # React admin app (PWA)
│   └── src/
│       ├── pages/          # dashboard, customers, karte, chat, source-codes
│       ├── components/
│       └── lib/
├── liff/                   # LIFF app (ref capture; forms later)
├── shared/                 # shared TypeScript types
├── infra/                  # deploy config, docker, env samples
├── docs/                   # requirements doc, design notes
├── .env.example
└── README.md               # this file
```

---

## 6. Build roadmap (phased, mapped to requirement FR IDs)

Phase 1 is the **minimum core** we build and demo first. Later phases are sized
*after* Phase 1, using its real velocity. Don't build later-phase features
without confirming scope.

- **Phase 1 — Minimum core CRM** *(this README's step list)*
  Capture, auth, customer list, カルテ, human chat, basic dashboard, source-code
  capture. FR-A1–2, FR-B, FR-C1–4, FR-K1/2/5, FR-Q6, NFR-2/3.
- **Phase 2 — Attribution & ad CV** ★ (needs §13 Q1, Q2, Q13)
  Link/CV funnel, click-ID capture, CAPI returns per platform (Meta first, then
  Google/TikTok/X), CPA, unified ad dashboard. FR-L, FR-M.
- **Phase 3 — AI layer** ★ (needs §13 Q4, Q11, Q14, Q15)
  AI chat analysis + draft replies, engagement scoring, auto-tagging, user-type
  classification. FR-C5–7, FR-J, FR-R, FR-S, FR-T.
- **Phase 4 — Marketing automation & extras**
  Step scenarios, segment delivery, templates, rich menu, auto-reply, follow-up,
  reservations, store-repeat, notifications, data migration. FR-D, E, F, G, H, I,
  O, P, U.

---

## 7. Phase 1 — step-by-step (build in this order)

Each step is self-contained; finish and verify before the next. Each lists its
FR IDs and a "done when."

**Step 1 — Scaffold & infra.** Monorepo (`server`, `web`, `liff`, `shared`),
TypeScript, lint, `.env.example`, a deploy target with a stable HTTPS URL.
*Done when:* `server` boots and responds to a health check on the host.

**Step 2 — Webhook receiver + DB.** Grow the echo bot into a hardened receiver:
verify signature, respond `200` immediately, store every event, enqueue heavy
work. PostgreSQL schema + migrations. (§8.1, NFR-2)
*Done when:* follows/messages from the test account are stored; duplicates are
idempotent; a message still echoes back.

**Step 3 — Auth + roles.** Magic-link login; sessions; RBAC with the 4 roles
(member / supervisor / admin / owner), row-level access by assignee. (NFR-3, FR-Q6)
*Done when:* a user can log in via emailed link and see role-gated pages.

**Step 4 — Customer list.** List / search / filter (tag, source, custom attr) /
CSV export, reading the friends captured in Step 2. (FR-B1–4)
*Done when:* captured friends appear, are searchable, and export to CSV.

**Step 5 — Customer カルテ (detail).** View + edit: attributes, memo, assignee,
source, history; **custom fields** (OSM: hair/scalp state, purchase history). (FR-B5–8)
*Done when:* a friend's detail opens, edits persist, custom fields work.

**Step 6 — Chat inbox (human only).** 3-pane inbox (list / thread / customer
panel), statuses (needs-response / snoozed / done), send text + media + template
insert. No AI yet. Realtime updates. (FR-C1–4)
*Done when:* a team member can hold a real 1:1 conversation from the web app,
and it works on mobile (PWA).

**Step 7 — Dashboard (basic KPIs).** Friend count, new-30d, needs-response,
conversation/resolution stats. (FR-A1–2)
*Done when:* the numbers reflect live DB data.

**Step 8 — Source codes + LIFF ref capture.** Create a source code → generate a
LIFF `?ref=` URL + QR; LIFF page reads `ref` (and, structurally, ad click-IDs),
sends `{userId, ref}` to the backend, which stamps the friend's record; show
流入元 ranking on the dashboard. (FR-K1/2/5, FR-A4)
*Done when:* adding via a `ref` link records the correct source on that friend.

**Step 9 — Deploy & harden.** Production deploy, HTTPS webhook URL set on the
channel, secrets encrypted, backups, error monitoring. Record **actual hours
spent** across Steps 1–9 → this is the calibration figure for estimating Phases
2–4.

---

## 8. Cross-cutting rules (apply in every step)

- **Webhook:** always `200` fast, process async, retry + idempotent (no lost events).
- **One webhook per channel:** this server is the account's only webhook.
- **Multi-account-ready:** key data by account/channel now, even though v1.0 is
  one account (§12.4, NFR-5). Retrofitting tenancy later is expensive.
- **Security:** TLS; encrypt stored secrets (tokens); audit log; RBAC everywhere.
- **UI:** Japanese; PC = full features; mobile (PWA) must do chat comfortably.
- **Scale:** design for tens of thousands of friends (indexing, pagination,
  queued sending). (NFR-1)
- **Scope discipline:** if a task belongs to Phase 2–4, confirm before building.

---

## 9. Open questions gating later phases (from requirements §13)

These block Phase 2–3, not Phase 1 — but chase them early:
Q1 EC platform (购入 CV), Q2 ad-account access/CAPI creds, Q4 LLM policy/budget,
Q9 scale/budget/deadline, Q11 engagement definition, Q13 ad-platform rollout
order, Q14 tag taxonomy, Q15 dealer/competitor criteria.

---

## 10. Setup (dev)

```bash
# server
cd server && npm install
cp ../.env.example .env      # fill LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, DATABASE_URL, ...
npm run db:migrate
npm run dev                  # starts webhook + API

# expose for LINE during dev
ngrok http 3000              # paste the HTTPS URL + /webhook into the channel; enable "Use webhook"

# web
cd ../web && npm install && npm run dev
```

Keep secrets in `.env` (gitignored). Never commit tokens.