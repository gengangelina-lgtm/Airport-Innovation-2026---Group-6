# Unified Identity Gateway

<div align="center">
  <img width="328" height="65" alt="Unified Identity Gateway project banner" src="https://github.com/user-attachments/assets/94cde17a-04b2-47f6-bf4e-9e7f6566ccbb" />
</div>

The Unified Identity Gateway is a working example for the [Passenger Clearance Subproblem](../README.md). It combines booking lookup, document checks, seat selection, bag declaration, boarding-pass issuance, agent review, and audit logging in one check-in flow.

The project demonstrates how several small decisions contribute to one passenger status: `NOT_STARTED`, `IN_PROGRESS`, `CLEARED`, `BLOCKED`, or `NEEDS_REVIEW`. That status is derived from the underlying document, seat, bag, and boarding-pass state. 

This is a learning prototype. The role switcher is not real authentication, and the identity checks are not suitable for production use.

## Table of Contents

- [Getting Started](#getting-started)

## Getting Started

Run commands from the `departure-control-system/unified-identity-gateway` folder.

You need Node.js, npm, and either Docker or a local PostgreSQL 16 installation.

### 1. Start PostgreSQL

With Docker:

```bash
docker compose up -d postgres
```

### 2. Start the API

On macOS or Linux:

```bash
cd apps/api
cp .env.example .env
npm install
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run dev
```

On Windows PowerShell:

Windows PowerShell 5.1 does not support `&&` command chaining, so run each command on its own line.

```powershell
cd apps\api
copy .env.example .env
npm install
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run dev
```

The API runs on `http://localhost:3001`.

Check it before starting the web app:

```powershell
Invoke-WebRequest http://localhost:3001/health
```

The response should contain `{"status":"ok"}`.

If the request hangs or is refused, the API is not listening. Check the terminal running `npm run dev` before debugging a "failed to fetch" message in the browser.

### 3. Start the Web App

Open a second terminal in the Unified Identity Gateway folder.

On macOS or Linux:

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

On Windows PowerShell:

```powershell
cd apps\web
copy .env.example .env
npm install
npm run dev
```

Open the Vite address printed in the terminal, usually `http://localhost:5173`.

### 4. Try the Seeded Examples

| Booking | Last name | Expected case |
| --- | --- | --- |
| `CLEAN1` | `Doe` | Clean check-in flow |
| `NOPASS` | `Lee` | Missing passport number and blocked status |
| `EXPIRD` | `Khan` | Expired document and blocked status |
| `NAMEMM` | `Smith` | Name mismatch and blocked status |
| `OVRWGT` | `Patel` | Overweight bag and manual review |
| `GROUP1` | `Nguyen` | Passenger in a shared booking group |
| `GROUP2` | `Nguyen` | Second passenger in the same booking group |
| `XCHECK` | `Chen` | Passenger on the second seeded flight |

Switch to the agent view to review a blocked passenger, enter an override reason, and inspect the audit history.

All examples except `XCHECK` are on flight `DC101` from JFK to LHR. `XCHECK` is on flight `DC202` from JFK to DXB.

### 5. Run Tests

With PostgreSQL running and migrated:

```bash
cd apps/api
npx vitest run
```
</content>
