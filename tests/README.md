# Account checks

Use a **disposable browser profile** with no real saved Dicedle progress.
These checks write fixture guest and account records to that browser's storage.
They use in-memory PostgreSQL through PGlite and a fake Supabase Auth transport;
they do not send emails, use a real Supabase project, or create real accounts.

Serve the repository with a static server, open `index.html` in the disposable
profile, and run this in the browser's developer console:

```js
const harness = await fetch("tests/accounts.browser.js").then(r => r.text());
(0, eval)(harness);
await runDicedleAccountChecks(
  await fetch("supabase/schema.sql").then(r => r.text()),
  await fetch("supabase/tests/accounts.sql").then(r => r.text()),
  await fetch("supabase/tests/usernames.sql").then(r => r.text()),
);
```

The checks cover SQL permissions and Row Level Security, stale saves,
immutable busts, separate account caches, explicit guest import, switching
accounts, fresh-device restoration, offline rolls, and lost save responses.
The PostgreSQL engine loads from jsDelivr for this check only.

The harness also checks username uniqueness and permissions, signup without an
active session, blocked sign-in before email confirmation, incorrect passwords,
confirmation resend, password recovery, legacy account upgrades, and password
fields/storage. Auth is mocked: no actual confirmation/reset emails are sent.

To verify the actual hosted Supabase environment, run
`supabase/tests/accounts.sql` and `supabase/tests/usernames.sql` in that project's SQL Editor. The SQL fixtures
roll back. Then verify email-link delivery, sign-in, refresh, sign-out, and
restoration in a second browser using real email accounts after following
`supabase/README.md`.
