# 🎮 Pitch Please! — Live Game Pitching Event Platform

Built exclusively for **Dimensions** club's game pitching event.

---

## ⚡ Features & Requirements Implemented

1. **FastAPI Backend**: Real-time async REST & WebSockets server.
2. **Neon Database Support**: Native PostgreSQL configuration with fallback to local SQLite for instant testing before setting up Neon.
3. **Cloudflare Pages Frontend**: Zero-build, ultra-fast static SPA (`_redirects` included).
4. **Railway Backend Hosting**: Ready-to-deploy configuration with `Procfile`, `Dockerfile`, and `requirements.txt`.
5. **Round 1 Scoring Out of 10**: Tactile, thumb-friendly 1–10 score selector.
6. **Admin Team Management**:
   - Add teams by name.
   - Automatically generates a secure, unique **6-digit numeric code** for each team.
   - List, pause/activate, or remove teams.
   - One-click copy for team codes.
7. **Clean Mobile-First Team Entry**:
   - For anyone not signed in, only a **large centered 6-digit PIN box** is displayed.
   - No clutter, no distractions.
8. **Strict One-Vote-Per-Team Enforcement**:
   - **Database Level**: `UniqueConstraint("poll_id", "voter_team_id")` prevents duplicates.
   - **Application Level**: Pre-insert validation returns 409 Conflict.
   - **Client/WebSocket Level**: Live broadcast locks all devices logged in under the same team code as soon as a vote is cast.
   - Pitching team is prevented from voting on their own pitch.
9. **Spin The Wheel (Roulette)**:
   - Canvas-based roulette wheel dynamically loaded with active playing teams.
   - Deceleration physics with retro audio ticks and winner fanfare.
10. **Manual Team Selection**:
    - Admin can bypass the wheel and pick any active team directly.
11. **Live Poll & Timer Controls**:
    - Admin triggers "Start Voting" for the selected team.
    - Timer options: **15 sec**, **30 sec**, **1 min**, **2 min**.
    - Digital countdown synchronized across all connected devices via WebSockets.
12. **Admin End Poll**:
    - Admin can manually end the poll at any time.
13. **Extend Poll by +15s**:
    - Admin can add 15 seconds dynamically while a poll is active.
14. **Delete Result (Testing)**:
    - Admin panel includes a **Delete** button for any poll result to clear test runs without touching the database directly.
15. **Average Score & Breakdown**:
    - Automatically calculates and displays the Round 1 average score (out of 10) and full 1–10 histogram.
16. **Game-Relevant, Non-AI Aesthetic**:
    - Powered by Dimensions branding and logo (`assets/dimensions_logo.png`).
    - Authentic retro arcade aesthetic with `Press Start 2P` pixel font and `Chakra Petch` HUD font.
    - CRT screen scanlines, arcade push-buttons, haptic-feeling feedback, and Web Audio API arcade synthesizer sounds.

---

## 🚀 Quick Start (Local Development)

### 1. Start Backend (FastAPI)

```bash
cd backend

# (Optional) Create and activate virtual environment
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run server (defaults to local SQLite if DATABASE_URL is not set)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be live at `http://localhost:8000`.
Interactive Swagger API documentation: `http://localhost:8000/docs`.

### 2. Run Frontend

You can serve `frontend/` using any static file server (or Python's built-in HTTP server):

```bash
cd frontend
python -m http.server 3000
```

- **Team Voting Interface**: Open `http://localhost:3000` (or `http://<your-lan-ip>:3000` on mobile phones connected to same Wi-Fi).
- **Admin Command Center**: Open `http://localhost:3000/admin.html` (Default passkey: `pitchadmin2026`).

---

## 🗄️ Setting Up Neon Database

When you are ready to connect your Neon PostgreSQL database:

1. Create a project at [Neon.tech](https://neon.tech).
2. Copy your PostgreSQL connection string from the Neon dashboard (e.g., `postgresql://user:pass@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`).
3. Set the `DATABASE_URL` environment variable:
   - Locally in `backend/.env`:
     ```env
     DATABASE_URL=postgresql://user:pass@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
     ADMIN_SECRET=pitchadmin2026
     ```
   - On Railway: Add `DATABASE_URL` in the Railway service Variables tab.
4. The backend will automatically create all tables (`teams`, `rounds`, `polls`, `votes`) on startup!

---

## 🌐 Production Deployment

### Frontend Deployment: Cloudflare Pages

1. Push this repository to GitHub.
2. In the [Cloudflare Dashboard](https://dash.cloudflare.com/), go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your repository.
4. Set build settings:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `frontend`
5. Click **Save and Deploy**.
6. **Connecting to your Backend**:
   - **Option A (Zero-Config Global Default)**: In `frontend/js/config.js`, set `BACKEND_API_URL: "https://pitch-please.up.railway.app"` before pushing to Git. All students and admins will automatically connect to Railway!
   - **Option B (Instant Link with `?api=`)**: Share `https://pitch-please.pages.dev/?api=https://pitch-please.up.railway.app`.
   - **Option C (Admin Settings Modal)**: On the deployed Admin panel (`/admin.html`), click **⚙️ API URL** and enter your Railway backend URL.

### Backend Deployment: Render (Free Web Service)

1. Go to [**Render.com**](https://render.com) and log in with GitHub.
2. Click **New +** > select **Web Service**.
3. Connect your repository: `Pitch Please!`.
4. Configure the settings:
   - **Name**: `pitch-please-backend`
   - **Language**: `Python`
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
5. Under **Environment Variables**, add:
   - `DATABASE_URL`: `postgresql://neondb_owner:npg_frgHux5V9jDK@ep-dry-haze-aoo551ug-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
   - `ADMIN_SECRET`: `pitchadmin2026`
   - `PYTHON_VERSION`: `3.11.9`
6. Click **Deploy Web Service**.
7. Render will build and deploy in ~2 minutes and provide your public URL:
   `https://pitch-please-backend.onrender.com`.

---

## 📱 Event Workflow Walkthrough

1. **Admin sets up teams**:
   - Open `/admin.html` -> enter passkey `pitchadmin2026`.
   - In **1. TEAMS & CODES**, type team names one by one.
   - The system generates unique 6-digit codes (e.g. `#482917`).
2. **Teams join on their phones**:
   - Team members open the frontend URL on mobile.
   - Enter their 6-digit code.
   - Their screen shows "WAITING FOR NEXT PITCH...".
3. **Pick the pitching team**:
   - Admin goes to **2. SPIN THE WHEEL** and clicks **SPIN THE WHEEL** (or selects manually from dropdown).
   - Wheel spins with arcade audio ticks and lands on a team!
   - Click "ACCEPT & GO TO POLL CONTROLS".
4. **Conduct the live vote**:
   - Choose poll duration (15s, 30s, 1m, 2m).
   - Click **START VOTING POLL**.
   - **Pitching team's phone**: Shows yellow banner indicating they are pitching (cannot vote).
   - **Other teams' phones**: Active countdown timer appears with large thumb-friendly 1–10 score buttons.
   - As soon as one member from a team taps a score and submits, that team's vote is officially locked in.
   - Admin can extend by +15s or end the poll early.
5. **View & Manage results**:
   - In **4. ROUND 1 RESULTS & AVERAGES**, the average score out of 10 and vote distribution histogram are displayed immediately.
   - If doing test runs before the event, click **🗑️ DELETE** on any result to remove test data.
