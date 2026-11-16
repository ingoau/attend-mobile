# Screenshot protocol (Android and iOS)

Both platforms follow this exactly, so each pair of shots shows the same data
at the same moment. Filenames are shared; a shot that can't exist on one
platform is skipped there and noted.

## Setup, every run

1. **Fake clock.** Use the same moment, `2026-11-15T10:30:00+11:00` (day 2 of
   Harbourhack Sydney, mid-event), on both sides:
   - Mock: start it **fresh** right before shooting, with
     `FAKE_NOW=2026-11-15T10:30:00+11:00 PORT=4010 node mock-api/server.js`.
     Its state is in memory, so a restart resets every change.
   - App: build with `EXPO_PUBLIC_FAKE_NOW=2026-11-15T10:30:00+11:00` and the
     local hack `app-hacks/qa-fake-now.js` (instructions in that file).
   - Leave the device's system clock alone. On Android, turn auto time back on
     if a previous run turned it off.
2. **Time zone.** Set the device to Australia/Sydney (AEDT, +11:00).
3. **Status bar.** Show 10:30, a full battery, full wifi and no notifications.
   - iOS: `xcrun simctl status_bar booted override --time 10:30 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4`
   - Android: SystemUI demo mode (`sysui_demo_allowed 1`, then `clock -e hhmm 1030`, battery 100, wifi level 4, notifications hidden).
4. **Fresh install.** Not signed in, light appearance (in-app Appearance: System,
   device in light mode). Device PIN/biometric enrolled: Android
   `locksettings set-pin 1234`; iOS Face ID enrolled.
5. **Other local-only hacks.** Dev sign-in buttons, cleartext http to
   localhost, and skipping `preventScreenCaptureAsync`, as needed. Never commit
   them.

## Rules

- Take the shots **in filename order, in one mock session**. Don't create,
  send, scan or check in anything except where a step says so. Later shots
  depend on earlier changes (for example, the scan in 34 adds a check-in).
- Wait for data to load and animations to settle. Re-take anything mid-transition.
- Use the exact text inputs given below.

## Shots

### Organiser (sign in with dev login `admin@hackclub.com`)

| File | What |
|---|---|
| 01-login | Sign-in screen, before signing in |
| 03-switcher | Event switcher after sign-in (Ongoing section) |
| 04-switcher-past | Switcher scrolled to the past events |
| 05-overview | Pick Harbourhack Sydney 2026: Overview top, data loaded |
| 06-overview-scrolled | Overview scrolled a little, with content under the status bar |
| 07-overview-bottom | Overview further down (Needs attention / Next arrivals) |
| 08-incidents | Overview → Incidents, Open filter |
| 09-incidents-closed | Incidents, Closed filter |
| 10-incidents-menu | Incidents overflow menu open |
| 11-incident-detail | First open incident (the high-severity one) |
| 12-incident-detail-2 | Same, scrolled to the timeline |
| 13-incident-status-picker | Its status picker open |
| 14-triage-chart | Triage chart (from New incident's "Which level?") |
| 15-new-incident | New incident form, empty |
| 16-new-incident-2 | Same, scrolled |
| 17-new-incident-3 | Same, scrolled to the bottom |
| 18-discard-prompt | Type `Main hall` in Location, then back out: the discard prompt. Discard. |
| 19-overview-end | Overview scrolled to the end |
| 20-messages | Overview → Messages list |
| 21-message-draft | Open the draft "Demo order and judging" |
| 22-message-draft-2 | Same, scrolled |
| 23-message-actions | Its overflow menu |
| 24-message-edit | Edit: compose screen, step 1 |
| 25-message-edit-2 | Same, scrolled |
| 26-message-preview | Continue to Preview & send. Don't send. |
| 27-message-preview-2 | Same, scrolled. Then back out without saving. |
| 28-scan | Scan tab, no context chosen |
| 29-scan-context-picker | Context picker open |
| 30-scan-ready | Context "Check-in" chosen, camera ready |
| 31-scan-more-menu | Scan overflow menu |
| 32-scan-search | Find an attendee, empty |
| 33-scan-search-results | Type `ar` |
| 34-scan-result | Pick the first result: result card. (This scans them.) |
| 35-scan-participant-sheet | Open their details and unlock (PIN 1234 / Face ID): the participant sheet |
| 36b-locked | Open details again and cancel the unlock: the locked view |
| 50-people | People tab |
| 51-people-filter | Filter and sort sheet |
| 52-people-filter-2 | Same, scrolled |
| 53-people-attention | Needs-attention quick filter applied |
| 54-travel | Travel tab |
| 55-travel-scrolled | Travel scrolled |
| 56-travel-person | Tap the first person on Travel |
| 57-participant-1..4 | Participant detail for that person, scrolled through in four shots |
| 60-account | Account sheet |
| 61-account-2 | Account scrolled (skip if it all fits) |
| 62-account-dark | In-app Appearance → Dark |
| 63-overview-dark | Overview, top |
| 64-overview-dark-2 | Overview scrolled (status bar scrim) |
| 64b-overview-dark-3 | Overview further down |
| 65-people-dark | People |
| 65b-filter-dark | People filter sheet |
| 66-travel-dark | Travel |
| 67-scan-dark | Scan, context chosen |
| 67b-scan-context-dark | Scan context picker. Then set Appearance back to System. |
| 68-signout-confirm | Account → Sign out: the confirm. Confirm. |

### Attendee (dev login `participant-demo@hackclub.com`)

| File | What |
|---|---|
| 70-participant-home | My tickets |
| 72-ticket | The live/upcoming ticket's pass |
| 73-ticket-2 | Same, scrolled |
| 74-ticket-3 | Same, scrolled to the end |
| 75-ticket-4 | Skip if 74 is already the end |
| 76-inbox | Messages inbox |
| 77-inbox-message | First message |
| 78-report | Report an incident form |
| 79-report-2 | Same, scrolled |
| 79b-report-3 | Same, scrolled to the end. Back out and discard. |
| 80-ticket-registering | The ticket still in registration |
| 81-participant-home-past | My tickets scrolled to past events |
| 82-ticket-past | The past ticket |
| 83-participant-account | Account. Sign out. |

### Kiosk (sign in again as `admin@hackclub.com`)

| File | What |
|---|---|
| 90-switcher-overlay | Event switcher opened over Harbourhack's tabs |
| 91-kiosk-setup | Scan → overflow → Kiosk mode setup |
| 92-kiosk-pin | Set PIN: enter `1234` |
| 93-kiosk-pin-confirm | Confirm PIN: `1234` |
| 94-kiosk | Kiosk screen |
| 95-kiosk-idle | Kiosk after going idle |
| 96-kiosk-unlock | Exit kiosk: the PIN pad |

Platform-only extras go after 96 (for example `97-ios-verify-id`).
