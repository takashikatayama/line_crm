# Test plan — 10h prototype

Three phases. Do them in order; each one de-risks the next.

## 1. Smoke test (local, no LINE account needed) — run now

Checks the server boots and the DB/API work before touching anything live.

- `npm start` (or `node index.js`) boots without error, logs `Listening on
  http://localhost:3000`.
- `data.db` is created on first boot (SQLite file, WAL mode).
- `GET /api/stats` on an empty DB returns
  `{ followerCount: 0, newFollowerCount: 0, messageCount: 0, customers: [], messages: [] }`.
- `GET /` serves the dashboard HTML (`public/index.html`), stat cards show
  `0` / empty-state tables, no console errors.

## 2. Simulated webhook test (local, no LINE account needed)

Proves the webhook → DB → dashboard path works end-to-end without needing a
real LINE follow/message. Fires signed fake `follow` and `message` events at
`POST /webhook` (signature computed with `LINE_CHANNEL_SECRET`, same as LINE
would send).

- A fake `follow` event → row appears in `customers`, `followerCount` and
  `newFollowerCount` increment, name shows in the Customer List table (name
  will be `null` since `client.getProfile` can't be faked without hitting the
  real LINE API — expected, not a bug).
- A fake `message` event → row appears in `messages`, `messageCount`
  increments, message shows in the Message Log table.
- Dashboard auto-refresh (10s poll) picks up both without a manual reload.

## 3. Live test (real LINE account — needed before calling the prototype done)

This is the one that matters for the actual "someone else messages the
account and sees it on the dashboard" demo. Requires:

1. `ngrok http 3000` (or equivalent tunnel) → get the HTTPS URL.
2. LINE Developers Console → OSM test channel → Messaging API tab → set
   Webhook URL to `<ngrok-url>/webhook`, click **Verify**, enable **Use
   webhook**.
3. Confirm the webhook slot is still free (L Message stays disconnected —
   only one tool can own it, per CLAUDE.md).
4. Ask 1+ other person (not just you) to scan the OSM test account QR /
   add as friend, then send it a text message.
5. Check within ~10s the dashboard reflects: follower count +1, that
   person's display name in the Customer List, their message text in the
   Message Log, message count +1.
6. Confirm the bot still echoes the message back to them (existing echo
   behavior, kept as a liveness signal — not a feature requirement).

**Known limits to expect, not bugs:** no auth (anyone with the dashboard URL
can view it), no search/filter, no karte edit, unfollow isn't surfaced in the
UI (only affects the follower count), ngrok URL changes on restart unless on
a paid plan (re-set the webhook URL each time you restart the tunnel).

**Status:** Phase 1 (smoke) run 2026-07-15. Phase 3 confirmed working live —
webhook connected via ngrok, multiple real LINE accounts (including someone
other than the requester) followed/messaged the OSM test account and showed
up correctly on the dashboard, including FAQ auto-reply and segment tagging.

**Actual hours vs. 10h estimate:** ~5–8 hours, faster than budgeted — see
readme.md §2.1 for the calibration note.
