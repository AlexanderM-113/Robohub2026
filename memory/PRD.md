# Robotics Team Communication Hub — PRD

## Original Problem Statement
Build a robotics team communication hub. Users with roles member/mentor/owner. Chat broken into VEX/FRC categories, each with Programming/Building/Business/Team sub-channels. A separate Members-Only chat that mentors cannot see at all. Only one owner (hardcoded email), nobody else can be owner. Places to upload/share images, code files, and zip files. A calendar of events the owner and mentors can edit. Email + text notifications.

## User Choices
- Auth: Email + password (JWT).
- Owner: hardcoded email alexander_m113@outlook.com (seeded, role forced to owner, cannot be deleted).
- Theme: accessible light + dark mode, friendly (not techno), spaced-out multi-page layout.
- Chat: near-real-time (4s polling).
- Phone notifications for new messages: Web Push (PWA, free) + Email-to-SMS carrier gateways (free).
- Email: WEEKLY-ONLY digest, Wednesdays 10:00 America/Phoenix (Arizona). No instant emails.

## Architecture
- Backend: FastAPI + MongoDB (Motor). JWT bearer auth (localStorage 'rh_token').
- Frontend: React + react-router + Tailwind + shadcn/ui, next-themes (light/dark). Fonts: Outfit (headings), Work Sans (body), JetBrains Mono.
- Object storage: Emergent object storage for file uploads.
- Email: Resend. SMS: email-to-SMS carrier gateways (Resend-backed). Web Push: VAPID (pywebpush).
- Scheduler: APScheduler weekly digest (Wed 10:00 America/Phoenix).

## Personas
- Owner (you): full control, team management, calendar, all channels incl. Members-Only.
- Mentor: all channels EXCEPT Members-Only; can edit calendar; can delete any file.
- Member: all channels incl. Members-Only; can post, upload, view calendar.

## Implemented (2026-06-17)
- JWT auth: register (member/mentor), login, /me, settings; owner seeded & reserved.
- Role-based chat: VEX/FRC x Programming/Building/Business/Team + Members-Only (mentors blocked at API + hidden in UI).
- Messaging with file attachments; 4s polling.
- File sharing: image gallery + code/zip list, upload/download/soft-delete, permission checks.
- Calendar: event CRUD (owner/mentor), list; dashboard "Next Event".
- Team panel (owner): list, change role (member<->mentor), ADD member, DELETE member (owner protected).
- Dashboard with stats + recent files.
- Notifications:
  - Web Push (VAPID) for new messages — Settings "Enable push on this device".
  - Email-to-SMS for new messages via carrier gateway (phone + carrier in Settings, SMS toggle).
  - Weekly email digest Wed 10:00 Arizona (msgs/channel, new files, upcoming events); owner can trigger via POST /api/digest/send-now.
- Light/dark theme toggle. Full data-testid coverage. 49/49 backend tests passing.

## KNOWN EXTERNAL LIMITATION (action needed by user)
- Resend account is in SANDBOX/TEST mode: it can only deliver to the account's own verified address (fhardy25@susdgapps.org). Sends to any other address (members' emails AND carrier email-to-SMS gateways) are attempted correctly but rejected by Resend until a domain is verified.
- To go live: verify a domain at resend.com/domains, then set SENDER_EMAIL in backend/.env to an address on that domain (e.g., notify@yourteam.com). No code changes needed.

## Backlog / Next
- P1: Verify Resend domain so weekly digest + SMS actually deliver.
- P1: Optional — instant email per message (currently weekly-only by design).
- P2: PWA manifest + app icons for cleaner iOS "Add to Home Screen" push.
- P2: Per-channel mute / notification preferences.
- P2: Message edit/delete, reactions, typing indicators.
- P2: Pagination for long message histories.
