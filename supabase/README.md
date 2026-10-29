# Enable Dicedle accounts

The site stays playable as a guest until you connect a Supabase project.
Players sign in with email and password. New accounts choose a unique username
and must confirm their email. Existing players can still sign in by email link.

## Upgrade an existing Dicedle project

1. Run [usernames.sql](usernames.sql) in the Supabase SQL Editor. It adds the
   username table, uniqueness rules, and signup trigger. Existing scores and
   Auth users are preserved; running this migration again is safe.
2. Under **Authentication → Sign In / Providers → Email**, keep **Confirm email**
   enabled and allow new sign-ups. Set the minimum password length to **8** so
   the Auth server enforces the same minimum as the forms.
3. Under Authentication's email templates, keep **Confirm Signup**, **Reset
   Password**, and **Magic Link** using `{{ .ConfirmationURL }}`. The existing
   SMTP setup continues to send these messages.
4. Keep **Site URL** set to `https://www.dicedle.org/` and allow both
   `https://www.dicedle.org/#profile` and
   `https://www.dicedle.org/index.html#profile` as redirect URLs. Signup
   confirmation, password reset, and legacy sign-in links use these same URLs.
5. Publish the updated browser files through GitHub Pages. New players select
   **Create account**, enter a username, email, and password, and follow their
   confirmation email. Existing players can use **Use an email sign-in link**
   or **Forgot password?**, then choose their username and password in account
   settings. Their saved runs stay attached to the same Auth user ID.

## Set up a new project

1. Create a Supabase project and run [schema.sql](schema.sql) in its SQL Editor.
2. Copy the project's URL and **publishable key** into `config.js`:

   ```js
   window.DICEDLE_CONFIG = Object.freeze({
     supabaseUrl: "https://YOUR_PROJECT.supabase.co",
     supabasePublishableKey: "sb_publishable_YOUR_KEY",
   });
   ```

   These two values are public. A legacy `anon` key also works. Never use a
   secret key, `service_role` key, or database password in browser files.

3. In Authentication, enable the Email provider and allow new sign-ups.
   Keep **Confirm email** enabled and set the minimum password length to **8**.
   Keep the default Magic Link, Confirm Signup, and Reset Password templates
   using `{{ .ConfirmationURL }}`.
4. Under Authentication → URL Configuration, set Site URL to your deployed
   website. Add the exact local and deployed page URLs as allowed redirect URLs,
   including the `#profile` fragment, for example:
   `http://localhost:5500/index.html#profile` and
   `https://your-domain.example/#profile`. Match the actual path you serve.
5. Configure custom SMTP before inviting public players. Supabase's default
   sender is restricted to project team addresses and is intended for initial
   setup. Your SMTP provider credentials belong in Supabase, never `config.js`.
6. Serve Dicedle over HTTP on localhost for development and HTTPS in production.
   Directly opening `index.html` with `file:` still supports guest play; account
   sign-in needs a website URL.

## What is saved

Usernames live in `dicedle_profiles`, with a unique index on `lower(username)`.
The signup trigger claims the requested username atomically with account
creation; only the signed-in owner can read or update their profile. The public
availability function returns a boolean and never exposes email addresses.
Existing email-link accounts can claim a username after confirming their email.
Passwords are managed and hashed by Supabase Auth. Neither the username table
nor Dicedle's browser cache stores plaintext passwords. Password fields are
cleared when requests finish or the account dialog closes.

Every account has a private row per local calendar date in `dicedle_runs`.
Rows contain dice results and a summary so current runs, history, personal bests,
and today's bust can be restored on another device. No email address is copied
to the score table; Supabase Auth manages emails and sessions.

Guest progress keeps its existing browser keys. Account caches use
`dicedle.account.<user-id>.*` keys. Signing out returns to the original guest
records. Importing guest records requires pressing **Save this device's guest
scores** in the account dialog; it does not remove the original guest records.
An existing account run takes priority for a duplicate date. Import is
idempotent, so retrying after an interruption does not duplicate scores.

Account rolls require a server confirmation before the dice animation plays.
If the connection fails after saving, retrying or syncing restores the saved
result. A stale device receives the existing server run and cannot overwrite a
bust or replace its dice prefix. Offline account caches can be viewed, but new
account rolls need a connection. Returning to the tab or reconnecting refreshes
the account, and **Sync scores** also refreshes manually.

## Database protections and limits

Row Level Security permits reads only where `auth.uid()` matches `user_id`.
Guests cannot read score rows. Clients have no direct insert/update/delete
grants. The save function derives identity from the session, validates dice,
calculates scores, and locks the row to serialize concurrent writes.

Dice are still generated by the browser, and historical guest totals are
imported from browser storage. This is personal score persistence, not a
cheat-proof competitive leaderboard. Local calendar dates are supplied by the
client. Server-generated dice and a server-owned daily schedule would be needed
for stronger competitive enforcement.

Run [tests/accounts.sql](tests/accounts.sql) in the SQL Editor after the schema
to verify account isolation and save/conflict behavior. It runs in a transaction
and rolls back its fixtures. Live email delivery and real sign-in still need
verification with your project and SMTP configuration.

References: [Email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[Email and password](https://supabase.com/docs/guides/auth/passwords),
[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
