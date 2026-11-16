# QA assets for PR #49

Not app code. This branch holds the screenshots attached to
hackclub/attend-mobile#49 and the mock Attend API they were taken against.

- `mock-api/server.js`: plain Node 18+, no dependencies. `PORT` (default 4010).
  Logins: `admin@hackclub.com` (organiser, live event Harbourhack Sydney
  14–16 Nov 2026) and `participant-demo@hackclub.com` (attendee).
- `android/`: Android emulator screenshots.
- `SHOTS.md`: the shot list and setup both platforms follow, so their screenshots show the same data at the same moment.
- `app-hacks/qa-fake-now.js`: local-only clock pin for the app, paired with the mock's `FAKE_NOW`.
