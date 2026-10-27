# Dicedle

A small, dependency-free dice risk game.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server.

## Current foundation

- Responsive game shell and visual identity
- Two animated dice with randomized rolls from 2–12
- A score that accumulates on every roll, including the busting seven
- Immediate bust when the dice total seven, after adding 7 points
- Welcome popup with Dicedle rules, plus help and today's run statistics
- One run per local calendar day, saved between page visits
- Automatic unlock each new day and a live countdown to the next run
- A woven background, raised score displays, dice, and tactile buttons
- A large BUSTED roll button that still presses but cannot change a finished run

## Temporary testing mode

The daily limit is currently paused using `const dailyLimitEnabled = false` near the top of `script.js`. After a bust, the main button reads **BUSTED** and stays pressable without changing the dice or score. Select the separate **NEW TEST RUN** button to reset the score, then **ROLL** to start another run. The countdown continues to run.

Test progress is saved separately under `dicedle.testingRun.v1`, preserving the normal daily run. To restore the daily limit, set `dailyLimitEnabled` to `true` and reload the page.

## Daily play (when enabled)

Opening the welcome popup does not use your daily run. Your first roll starts it. You can resume an unfinished run in the same browser later that day. A seven adds 7 points and ends that day's run, with no play-again button.

Dice results are saved before the animation starts, so refreshing during a roll cannot discard a bust. Tabs share the same run, and browsers with the Web Locks API serialize simultaneous rolls across tabs.

The next run unlocks when the player's local date changes, including daylight-saving changes. An open page updates automatically as the new day begins, and returning to a sleeping or backgrounded tab also rechecks the date.

Daily progress uses `localStorage` under `dicedle.dailyRun.v1`. The limit applies to this browser and site address; clearing site data, using another browser, or changing devices can bypass it. Enforcing one run per person across devices would require accounts and a server. Browser storage must be available to play.

For consistent saved progress, serve the site from the same local or hosted URL; storage behavior for directly opened `file:` URLs varies by browser.
