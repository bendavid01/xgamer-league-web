# X-Gamer Pro League — Web Frontend

A live gaming league platform built to manage and display match schedules, team standings, community updates, and league rules for X-Gamer Pro League Season 1.

**Live Site:** [xgamer-league-web.vercel.app](https://xgamer-league-web.vercel.app)

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| CMS | Sanity (headless, via studio repo) |
| Deployment | Vercel |

---

## Features

- **Match Center** — live scores, schedules, and match results
- **Standings Table** — team rankings and stats updated via CMS
- **Community** — league announcements and updates
- **Rules** — official league ruleset
- **PWA-ready** — static, secure, and fast-loading

---

## Project Structure

```
src/
├── app/          → Next.js App Router pages (Home, Matches, Table, Community, Rules)
├── components/   → Reusable UI components
├── lib/          → Sanity client and query helpers
└── types/        → TypeScript type definitions
```

---

## Architecture

This project uses a **two-repo architecture**:

- **This repo** — the frontend (Next.js + Tailwind), deployed on Vercel
- **[xgamer-league-studio](https://github.com/bendavid01/xgamer-league-studio)** — the Sanity CMS backend, where all content (matches, standings, rules) is managed

Content is fetched from Sanity at build time and/or on demand using GROQ queries.

---

## What I Learned

- Setting up a Next.js project with TypeScript and Tailwind CSS from scratch
- Integrating a headless CMS (Sanity) with a Next.js frontend using GROQ queries
- Structuring a project across two separate repos (frontend + CMS)
- Deploying and managing a live site via Vercel

---

## Local Development

```bash
git clone https://github.com/bendavid01/xgamer-league-web
cd xgamer-league-web
npm install
npm run dev
```

> Requires a `.env.local` file with your Sanity project ID and dataset. See the [studio repo](https://github.com/bendavid01/xgamer-league-studio) for setup.

---

*Personal project — built to practice modern full-stack web development with a real-world use case.*
