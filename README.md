# Dicedle

A small dice risk game built with HTML, CSS, and JavaScript. Optional email accounts use Supabase.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server.

## Current foundation

- Responsive game shell and visual identity
- Two animated dice with randomized rolls from 2–12
- A score that accumulates on every roll, including the busting seven
- Immediate bust when the dice total seven, after adding 7 points
- Welcome popup with Dicedle rules, plus help and PLAY / PROFILE navigation
- One run per local calendar day, saved between page visits
- Automatic unlock each new day and a live countdown to the next run
- A woven background, raised score displays, dice, and tactile buttons
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

## Daily play

The play page shows your saved best score and best streak beneath the current counters. A streak is the number of rolls in one run, including the final seven, matching the profile's most-rolls record. Personal bests update during a run and stay available after a refresh or a new day.

Opening the welcome popup does not use your daily run. Your first roll starts it. You can resume an unfinished run in the same browser later that day. A seven adds 7 points and ends that day's run, with no play-again button.

Dice results are saved before the animation starts, so refreshing during a roll cannot discard a bust. Tabs share the same run, and browsers with the Web Locks API serialize simultaneous rolls across tabs.

The next run unlocks when the player's local date changes, including daylight-saving changes. An open page updates automatically as the new day begins, and returning to a sleeping or backgrounded tab also rechecks the date.

Guest daily progress uses `localStorage` under `dicedle.dailyRun.v1`. The guest limit applies to this browser and site address; clearing site data, using another browser, or changing devices can bypass it. Account caches use separate `dicedle.account.<user-id>.*` keys and the server keeps one run per account and local date. Server saves preserve the existing dice prefix and cannot overwrite a bust. Dice and local dates still come from the browser; this is personal score saving rather than competitive anti-cheat enforcement. Browser storage must be available to play.

For consistent saved progress, serve the site from the same local or hosted URL; storage behavior for directly opened `file:` URLs varies by browser.
