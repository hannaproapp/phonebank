# Phone Bank

Volunteer call lists and canvassing results, feeding the GHL Canvassing custom object.

Interim tool: volunteers call from their own phones. No dialer, no Twilio, no campaign
caller ID. The app hands out contacts, captures the result, and produces an import file.

## Roles

- **Super admin** — sees every campaign. Creates campaigns. Seeded from `SUPER_ADMIN_EMAIL`.
- **Campaign admin** — one campaign. Adds volunteers, uploads lists, assigns contacts, exports.
- **Volunteer** — sees only the contacts assigned to them, across any campaign they belong to.

## Volunteer flow

Magic link login → assigned lists as cards → contact card with script → tap the number to
dial from their own phone → pick a disposition → if the voter answered, three questions →
save → next contact.

Answered gives the full canvass form. Anything else gives a short form.

## Admin flow

1. In GHL, add **Contact ID** to the Smart List view (Manage Fields), then export.
2. Upload that CSV here. Rows without a Contact ID or a phone number are skipped and counted.
3. Paste a call script.
4. Assign a block of contacts to each volunteer.
5. When calls are in, hit **Download new results**.

The export is incremental. Each download marks its rows exported, so the next one only
contains new results and you never double-import. **Download everything** re-exports all
results without changing the marks.

## Export format

The file is the Canvassing template's 125 columns verbatim, with the Contacts lookup column
prepended (name it in campaign settings to match your Canvassing object's lookup field).

Populated per row:

| Column | Source |
| --- | --- |
| *lookup column* | GHL Contact ID from the uploaded list |
| `Canvass Attempt Name` | generated, `Phone - Last, First - MM/DD/YYYY` |
| `Disposition (Phone)` | volunteer's pick |
| `Disposition` | `Phone - ` + the above |
| `Candidate Awareness`, `Current Support Level`, `Vote Plan` | only when Voter Contacted |
| `Phone — Correct?`, `→ New Phone Number` | Correct when reached, Incorrect on Wrong Number |
| `Internal Notes` | volunteer's notes |
| `Contact Method`, `Purpose of Contact`, `Canvassing For`, `Canvasser`, `Canvasser Contact Name`, `Contact Time`, `Form Submission Time` | auto-filled |

All other template columns are emitted blank so GHL's field mapping stays 1:1 by header name.

Picklist values must match the GHL dropdowns character for character. They live in
`lib/fields.ts`. If a dropdown changes in GHL, change it there.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and SESSION_SECRET
npm run dev
```

The schema is created on first database connection. There is no migration step.

## Deploy on Railway

1. Add a Postgres database to the project.
2. Add this repo as a service.
3. Set variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `SESSION_SECRET` = a long random string
   - `SUPER_ADMIN_EMAIL` = your email
   - `APP_URL` = the generated domain, once you have it
4. Generate a domain.

Without `RESEND_API_KEY`, "Send link" shows the magic link on screen for the admin to copy
and send by text or email. Set the key to have the app email it directly.
