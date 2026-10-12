Push reminder checks (synthetic data only)

Run from repository root:

    npm ci --prefix tests/push-validation --ignore-scripts
    NODE_PATH="$PWD/tests/push-validation/node_modules" node tests/push-database.cjs
    NODE_PATH="$PWD/tests/push-validation/node_modules" node tests/push-settings.cjs

Database tests cover migration compilation, opt-in, paid/cancelled exclusion, four reminder types, agreement precedence, lease/sent deduplication, membership permissions, cross-user RLS and invalid time zones. UI tests cover expansion, multi-select, 24/60/60 wheels, disabling, store-change protection and modal cleanup.

Operational notes:
- iOS requires a Home Screen web app and explicit device notification permission.
- The saved IANA time zone stays fixed until the user updates it from their phone.
- The scheduler checks every minute, never before the chosen HH:MM:SS; Web Push/OS delivery can be delayed.
- One daily digest per device/store combines matching reminders. Failed sends retry up to five times with a five-minute lease. Provider expiry responses remove the subscription.
- Keys and scheduler token are provisioned once into Vault as `nayad_web_push_config`. Never commit them. Rotation requires resubscribing devices.
- `POST {"health":true}` with the scheduler credential checks configuration without reading store financial data or sending messages.
- Financial records are never modified by reminders. Settings default off; only opted-in users are evaluated.
- A locked physical phone delivery check must be performed after its owner enables notifications.
