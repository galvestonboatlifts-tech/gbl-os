# Galveston Boat Lifts OS — Production Stage 1

This is the deployable React + Vite + Supabase application.

## Included

- Secure email/password authentication
- Shared Supabase database
- Customers
- Waterfront properties
- Estimates with line items
- Estimate-to-job conversion
- Jobs, costs, crews, dates and warranties
- Private job photo uploads
- Invoices and payment balances
- Inventory and reorder alerts
- Employees
- Maintenance reminders
- Dashboard and financial reports
- Netlify SPA configuration

## GitHub upload

Extract this ZIP. Upload the CONTENTS of the extracted folder to the root of your GitHub repository.
The repository root must show `package.json`, `index.html`, `netlify.toml`, `src`, and this README.

## Netlify

Import the GitHub repository.

Build command:
`npm run build`

Publish directory:
`dist`

Add these environment variables before deploying:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the Supabase Project URL and Publishable key. Never use the secret/service-role key.

## Database

Use the Supabase V2 installer that already completed successfully with 10 tables and 1 photo bucket.
