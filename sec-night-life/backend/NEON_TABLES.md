# Create Tables in Neon (fix "table users does not exist")

The app connects to Neon, but the **tables have not been created** yet. Use one of these:

---

## Option A: One command (recommended)

From the **backend** folder run:

```bash
npm run db:neon-schema
```

This uses your `DATABASE_URL` in `.env` and the Neon serverless driver to run the schema SQL. If you see "Neon schema applied successfully", restart the backend and try Sign up again.

---

## Option B: Run SQL in Neon Console

If the command above fails (e.g. timeout or error):

1. Open [Neon Console](https://console.neon.tech) → your project **sec-nightlife-prod** → **SQL Editor**.
2. Open the file **`backend/scripts/neon-schema.sql`** in your code editor.
3. Copy **all** of its contents and paste into the Neon SQL Editor.
4. Click **Run**.
5. Restart your backend (`npm run dev`) and try **Sign up** again.

---

After tables exist, sign up and sign in will work.
