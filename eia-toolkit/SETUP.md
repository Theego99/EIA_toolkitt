# EIA Toolkit — Backend Setup Guide
Complete instructions for Supabase, PWA, and Lambda.

---

## PART 1 — Supabase (auth + database)
Time: ~30 minutes

### Step 1 — Create project
1. Go to supabase.com → sign up (free)
2. New Project → name: "eia-toolkit" → region: **Northeast Asia (Tokyo)**
3. Choose a strong database password → save it somewhere
fu2Z1279GNLdmfqd
4. Wait ~2 minutes for it to spin up

### Step 2 — Run the schema
1. Dashboard → SQL Editor → New Query
2. Paste the entire contents of `supabase/schema.sql`
3. Click Run (green button)
4. Should show "Success. No rows returned"
5. Run `supabase/seed.sql` the same way

### Step 3 — Get your API keys
1. Dashboard → Project Settings (gear icon) → API
2. Copy "Project URL" — looks like `https://abcdefgh.supabase.co`
3. Copy "anon public" key — long string starting with `eyJ...`

### Step 4 — Add keys to your app
In your local project folder:
```
copy .env.example .env.local
```
Open `.env.local` in Notepad and fill in:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 5 — Add keys to Vercel (for production)
1. Vercel dashboard → your project → Settings → Environment Variables
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. Redeploy (Deployments → ... → Redeploy)

### Step 6 — Create your first user
1. Supabase Dashboard → Authentication → Users → "Invite user"
2. Email: your email address
3. You'll get an email — set your password
4. Then in SQL Editor run:
```sql
-- Replace <your-user-uuid> with the UUID shown in Auth → Users
INSERT INTO profiles (id, organization_id, name, role) VALUES
  ('<your-user-uuid>',
   '00000000-0000-0000-0000-000000000001',
   'あなたの名前',
   'admin');
```

### Step 7 — Add supabase package to your app
In your project terminal:
```
cd eia-toolkit
npm install @supabase/supabase-js
```

### Step 8 — Copy the new files into your project
Copy these files into your `eia-toolkit` folder:
- `src/lib/supabase.js`   → `eia-toolkit/src/lib/supabase.js`
- `src/lib/hooks.js`      → `eia-toolkit/src/lib/hooks.js`
- `src/lib/pwa.js`        → `eia-toolkit/src/lib/pwa.js`
- `src/main.jsx`          → `eia-toolkit/src/main.jsx`
- `index.html`            → `eia-toolkit/index.html`
- `public/manifest.json`  → `eia-toolkit/public/manifest.json`
- `public/sw.js`          → `eia-toolkit/public/sw.js`

Test locally: `npm run dev` — login should now persist and data saves to Supabase.

---

## PART 2 — PWA (add to home screen)
Time: ~15 minutes

The service worker and manifest are already in your `public/` folder.
You just need app icons.

### Create icons (2 sizes needed)
Option A — free online tool:
1. Go to favicon.io or realfavicongenerator.net
2. Upload any square image (a green leaf emoji screenshot works)
3. Download the PNG files
4. Rename them: `icon-192.png` and `icon-512.png`
5. Put them in `eia-toolkit/public/`

Option B — minimal placeholder (paste in browser console):
```javascript
// Creates a simple green square icon — replace with real art later
const canvas = document.createElement('canvas');
canvas.width = 192; canvas.height = 192;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#1B4332';
ctx.fillRect(0, 0, 192, 192);
ctx.fillStyle = 'white';
ctx.font = 'bold 120px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('🌿', 96, 145);
const link = document.createElement('a');
link.download = 'icon-192.png';
link.href = canvas.toDataURL();
link.click();
```

### Test PWA install on iPhone
1. Deploy to Vercel (git push)
2. Open Safari on iPhone → go to your Vercel URL
3. Tap the Share button (box with arrow) → "ホーム画面に追加"
4. The app appears on home screen and opens fullscreen

### Test on Android
1. Open Chrome → go to your Vercel URL
2. Chrome shows "Add to Home Screen" banner automatically
3. Or: tap ⋮ menu → "Add to Home Screen"

---

## PART 3 — AWS Lambda (report generation)
Time: ~45 minutes
Cost: First 1,000,000 requests/month are FREE forever

### Step 1 — Install prerequisites
```
# Install AWS CLI (Windows)
# Go to: https://aws.amazon.com/cli/ → download MSI installer → run it
# Verify: open new terminal → aws --version

# Install Python 3.12+
# Go to: https://www.python.org/downloads/ → download → install
# Check "Add Python to PATH" during install
# Verify: python --version
```

### Step 2 — Create AWS account
1. aws.amazon.com → Create account (free tier)
2. Need a credit card but Lambda free tier = effectively free at your scale

### Step 3 — Configure AWS CLI
```
aws configure
# AWS Access Key ID: (get from AWS → IAM → Users → your user → Security credentials)
# AWS Secret Access Key: (same place)
# Default region: ap-northeast-1
# Default output format: json
```

### Step 4 — Create IAM role for Lambda
In AWS Console → IAM → Roles → Create role:
1. Trusted entity: Lambda
2. Permissions: `AWSLambdaBasicExecutionRole`
3. Name: `lambda-eia-role`
4. Copy the ARN (looks like `arn:aws:iam::123456789:role/lambda-eia-role`)

### Step 5 — Deploy the Lambda
```
cd lambda/

# Windows: set the env var first
set LAMBDA_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-eia-role

# Run deploy script (Windows needs bash — use Git Bash or WSL)
bash deploy.sh
```

Or manually (no bash needed):
```
pip install python-docx -t package/
copy lambda_function.py package/
cd package
# Use 7-Zip or built-in Windows zip:
# Select all files in package/ → right-click → Send to → Compressed folder
# Name it eia-report.zip, move to lambda/ folder
cd ..

aws lambda create-function ^
  --function-name eia-report-generator ^
  --runtime python3.12 ^
  --handler lambda_function.lambda_handler ^
  --zip-file fileb://eia-report.zip ^
  --role YOUR_ROLE_ARN ^
  --region ap-northeast-1 ^
  --memory-size 512 ^
  --timeout 60

aws lambda create-function-url-config ^
  --function-name eia-report-generator ^
  --auth-type NONE ^
  --region ap-northeast-1

aws lambda get-function-url-config ^
  --function-name eia-report-generator ^
  --region ap-northeast-1
```

### Step 6 — Test it
```
python lambda/test_lambda.py https://your-lambda-url.lambda-url.ap-northeast-1.on.aws
# Should create test_output.docx — open it in Word to verify
```

### Step 7 — Add Lambda URL to Vercel
1. Vercel → your project → Settings → Environment Variables
2. Add: `VITE_LAMBDA_URL` = your Lambda function URL
3. Redeploy

---

## SUMMARY — What you now have

| Layer       | What it does                          | Cost       |
|-------------|---------------------------------------|------------|
| Vercel      | Hosts the web app, auto-deploys       | Free       |
| Supabase    | Auth, database, file storage          | Free       |
| PWA         | iPhone/Android installable app        | Free       |
| AWS Lambda  | Word/PDF report generation            | Free tier  |

Total monthly cost at MVP scale: **¥0**

---

## NEXT STEPS (after MVP validation)

1. Add email invitations for new org members (Supabase auth.admin.inviteUserByEmail)
2. Store generated reports in Supabase Storage (not re-generate each time)
3. Add Japan Red List database as a real lookup (env ministry CSV → Supabase table)
4. Stripe integration for billing (stripe.com — supports Japanese cards and yen)
5. Custom domain email (your-name@eia-toolkit.jp) via Resend or SendGrid
