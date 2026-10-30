# Dicedle

A small dice risk game built with HTML, CSS, and JavaScript. Optional email accounts use Supabase.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server.

## Site icons

`favicon.svg` is the source for Dicedle's pixel dice icon. `favicon.ico` includes
16, 32, and 48 pixel versions for browser tabs and bookmarks. The `icons/` folder
contains PNG icons for browser fallbacks, Apple home-screen shortcuts, and web
app icons, including a version with extra padding. The SVG, PNG, and ICO images
have transparent backgrounds. The die shows one pip on top, two on the right,
and three on the left. The manifest uses the standard transparent icons.
`index.html` and `site.webmanifest` reference these assets with relative paths
so they also work when the site is served from a GitHub Pages subdirectory.
Publish the icon files and manifest alongside the HTML. Browsers may cache an
older tab icon; a fresh tab or browser restart can help show the update.

## Arcade appearance and classic restore point

The current skin is an 8-bit arcade theme with a peach background, white/gray
pixel dice, hard borders, and locally served Press Start 2P and VT323 fonts.
`arcade.css` handles the visual theme; `styles.css` retains the original layout
and classic styling. No game or account logic changes are needed to switch skins.
Font licenses and attribution are included in `assets/fonts/`.
The game dice use `assets/arcade/die-face-1.svg` through `die-face-6.svg`, matching
the logo's grayscale pixel style. Six-sided cubes tumble in place for 0.75 seconds,
then settle into flat faces showing the results. Reduced motion skips the tumble.

The previous raised mint design was saved before the restyle. See
[DESIGN_HISTORY.md](DESIGN_HISTORY.md) for its Git commit, local ZIP snapshot,
and restoration instructions. The backup is not published to the website.

## Current foundation

- Responsive game shell and visual identity
- Two animated dice with randomized rolls from 2–12
- A score that accumulates on every roll, including the busting seven
- Immediate bust when the dice total seven, after adding 7 points
- Welcome popup with Dicedle rules, plus help and PLAY / PROFILE / ACHIEVEMENTS navigation
- One run per local calendar day, saved between page visits
- Automatic unlock each new day and a live countdown to the next run
- A pixel arcade theme, raised score displays, dice, and tactile buttons
- A large BUSTED roll button that still presses but cannot change a finished run
- A profile with personal bests, today's run, roll-by-roll results, and paginated score history
- Unique usernames, email/password sign-in with email confirmation, saved account scores, and guest score import

## Optional email accounts

Select the account icon in the header, or **Sign in / create account** on your profile. New players choose a unique username, email, and password, then confirm their email before signing in. Sign-in uses email and password; usernames appear on profiles. Usernames contain 3–24 letters, numbers, or underscores and are unique regardless of capitalization. New passwords require at least 8 characters. Signed-in runs and history are saved to that account. Guest play is still available.

**Forgot password?** sends an email link that opens the new-password form. **Resend confirmation** requests another signup confirmation email. Existing email-link players can still use **Use an email sign-in link**, then save a username and password in their account settings without changing their scores. Passwords are handled by Supabase Auth; the site does not save plaintext passwords in browser storage, score records, or profile rows.

For an already configured Supabase project, run [usernames.sql](supabase/usernames.sql) once in its SQL Editor before publishing this update. Keep **Confirm email** enabled and the Confirm Signup and Reset Password templates using `{{ .ConfirmationURL }}`. See the [upgrade instructions](supabase/README.md).

Account saving requires a Supabase project. Follow [the Supabase setup guide](supabase/README.md), run its SQL schema, and fill in the public values in `config.js`. Until connected, the account dialog explains that accounts are unavailable and the game continues to work for guests. The Supabase browser SDK is loaded only when accounts are configured.

Guest scores and each account's local copy are kept separate. Signed-in players can explicitly add this device's guest records from the account dialog. Signing out returns to guest records. Existing account runs take priority over guest imports for the same date. Signed-in rolls require an internet connection so saved progress is confirmed before rolling; existing account records can be viewed from the device's cache.

## Profile and score history

Select **PROFILE** in the header, or open `index.html#profile` directly. Select **PLAY** to return to the game. Switching pages does not reset the current run.

The profile shows best score, the most rolls in a single run, runs played, average final score, lifetime roll and point totals, and days played. Personal bests include the current run; average final scores include finished runs only. Run history shows 10 results per page.

The profile tracks your daily runs. Completed runs are stored under individual `dicedle.history.v1.daily.*` keys in browser storage, with one stable record per day so refreshing or opening another tab does not count a run twice. The busting seven counts toward both the score and roll count. An unfinished run is saved as **Day ended** when its local day passes.

The most recent existing saved daily run is imported automatically into local history. Earlier results already overwritten before this feature was added cannot be recovered. Guest records remain local to this browser and site address; clearing site data removes them. Account records remain in Supabase and are restored after signing in.

## Achievements

Open **ACHIEVEMENTS** in the header, or `index.html#achievements`, for the trophy
room. It includes 126 achievements: seven regular categories plus a separate
Secret section for 12 curated rare discoveries. Locked secrets hide their names,
conditions, targets, and progress, including in search results. Collecting one
reveals its details and keeps its existing saved ID and collection date. The collection
has progress bars, collected dates, search, category selection, and status filters.

Achievements collect automatically from confirmed saved runs after the dice
settle. Notifications appear on any page, including over open help/account
dialogs, without taking keyboard focus. They dismiss after six seconds, pause
while hovered, focused, or in a background tab, and include a link to the trophy
room. Large batches show two individual awards and one summary notification.

Guest unlocks are saved under `dicedle.achievements.v1.<achievement-id>`;
accounts use their existing `dicedle.account.<user-id>.` storage namespace. Each
award is saved once and remains collected. Web Locks serialize collection across
tabs where available, so revisiting, refreshing, or switching pages does not
repeat the notifications. Signing out clears pending account notifications and
restores the guest collection.

Existing history automatically earns applicable awards. New history records
retain raw dice, and syncing an account enriches older summaries when the cloud
still has the original run. This lets dice-pattern achievements follow synced
scores without a Supabase migration. Summary-only older records still count
toward score, roll, day, and bust milestones; missing dice patterns cannot be
reconstructed. Collection timestamps are local to the device that first
collects the award. "First-ever" refers to the earliest run in retained history.

Edit `achievements.js` to rename achievements, change targets, or remove entries
from the catalog. `achievements-ui.js` controls filtering and notifications;
`achievements.css` styles the collection. `achievement_ideas.md` remains the
original ideas file.

Open `tests/achievements.html` locally to run the automated achievement checks
using memory-only fixtures. They cover milestones, patterns, old-history
backfill, duplicate prevention, separate accounts, calendar streaks, and failed
saves without accessing real scores or Supabase.

## Daily play

The play page shows your saved best score and best streak beneath the current counters. A streak is the number of rolls in one run, including the final seven, matching the profile's most-rolls record. Personal bests update during a run and stay available after a refresh or a new day.

Opening the welcome popup does not use your daily run. Your first roll starts it. You can resume an unfinished run in the same browser later that day. A seven adds 7 points and ends that day's run, with no play-again button.

The first roll uses two fair dice, giving a 1-in-6 chance of seven. Each subsequent
roll has a 1-in-7 chance of seven. Adjust `subsequentBustChance` in `script.js` to
change the later-roll odds. All non-seven ordered pairs remain equally likely;
the six seven-producing pairs are also equally likely. Saved rolls determine
whether this is the first roll, so refreshing does not reset the odds.

Dice results are saved before the animation starts, so refreshing during a roll cannot discard a bust. Tabs share the same run, and browsers with the Web Locks API serialize simultaneous rolls across tabs.

The next run unlocks when the player's local date changes, including daylight-saving changes. An open page updates automatically as the new day begins, and returning to a sleeping or backgrounded tab also rechecks the date.

Guest daily progress uses `localStorage` under `dicedle.dailyRun.v1`. The guest limit applies to this browser and site address; clearing site data, using another browser, or changing devices can bypass it. Account caches use separate `dicedle.account.<user-id>.*` keys and the server keeps one run per account and local date. Server saves preserve the existing dice prefix and cannot overwrite a bust. Dice and local dates still come from the browser; this is personal score saving rather than competitive anti-cheat enforcement. Browser storage must be available to play.

For consistent saved progress, serve the site from the same local or hosted URL; storage behavior for directly opened `file:` URLs varies by browser.
