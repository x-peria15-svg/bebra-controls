# Contributing

Use Node.js 24 or newer. Run `npm ci`, `npm test` and `npm run check` before proposing a change. Keep the API allowlist, session/CSRF checks and server-side permission enforcement intact. Add tests for authorization changes and regressions. Use synthetic data and example.com documentation hosts, never production fixtures.

Open a focused pull request describing the problem, resulting behavior and relevant validation. Do not upload node_modules, builds, user connection stores, credentials, logs or databases. New third-party code requires compatible licensing and attribution.
