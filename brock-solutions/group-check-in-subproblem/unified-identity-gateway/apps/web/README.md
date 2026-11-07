# Unified Identity Gateway Web App

This React application is the passenger, agent, and admin interface for the [Unified Identity Gateway](../../README.md). It communicates with the Fastify API in `../api` and turns passenger state into a guided check-in flow.

Use the parent project README for the complete database and API setup.

The web project uses React, TypeScript, and Vite with hot module replacement during development and Oxlint for linting.

## Table of Contents

- [Challenge](#challenge)
- [Potential Solutions](#potential-solutions)
- [Getting Started](#getting-started)
- [Resources](#resources)

## Challenge

Present check-in state and decisions clearly to people with different roles and needs.

The interface should help users:

- understand their current step and overall status
- see why an action is blocked or needs review
- choose only available seats
- declare bags and understand exceptions
- issue or display a boarding pass when cleared
- complete agent overrides with a recorded reason

The role switcher is provided for demonstration and is not real authentication.

## Potential Solutions

| Potential solution | Description | Starting point |
| --- | --- | --- |
| Accessible forms | Improve labels, focus order, keyboard use, validation summaries, and live status announcements. | [`src/components/CheckInWizard.tsx`](src/components/CheckInWizard.tsx) |
| Clearer passenger status | Explain what `BLOCKED` and `NEEDS_REVIEW` mean and what the user can do next. | [`src/components/StatusBadge.tsx`](src/components/StatusBadge.tsx) |
| Better seat selection | Improve mobile use, cabin-zone context, and accessible seat availability. | [`src/components/SeatMap.tsx`](src/components/SeatMap.tsx) |
| Agent review queue | Add sorting, prioritization, filters, or clearer next actions. | [`src/components/AgentView.tsx`](src/components/AgentView.tsx) |
| Privacy-aware document capture | Minimize displayed data and clearly explain consent and retention. | [`src/components/DocumentCapture.tsx`](src/components/DocumentCapture.tsx) |
| Operations summary | Show flight-level check-in completion and unresolved exceptions. | [`src/components/AdminView.tsx`](src/components/AdminView.tsx) |

## Getting Started

### Run the Web App

Start the API and database by following the [Unified Identity Gateway setup](../../README.md#getting-started).

Then run from this folder:

On macOS or Linux:

```bash
cp .env.example .env
npm install
npm run dev
```

On Windows PowerShell:

```powershell
copy .env.example .env
npm install
npm run dev
```

Open the Vite address printed in the terminal, usually `http://localhost:5173`.

The `.env` file sets the API address:

```text
VITE_API_URL=http://localhost:3001
```

Useful checks:

```bash
npm run lint
npm run build
```

## Resources

### Project Files

| Location | Purpose |
| --- | --- |
| [`src/App.tsx`](src/App.tsx) | Keeps the three role views mounted and switches between them |
| [`src/components/`](src/components/) | Passenger, agent, admin, seat, document, override, and boarding-pass views |
| [`src/api.ts`](src/api.ts) | Typed API request functions |
| [`src/types.ts`](src/types.ts) | Shared web types |
| [`src/faceMatch.ts`](src/faceMatch.ts) | Local face-comparison helper used by the document flow |
| [`src/styles.css`](src/styles.css) | Application styling |

### Technical Resources

- [Parent project guide](../../README.md)
- [React documentation](https://react.dev/)
- [Vite documentation](https://vite.dev/guide/)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
- [Oxlint documentation](https://oxc.rs/docs/guide/usage/linter/rules)

### Vite and React Configuration

Vite supports two official React plugins:

- [`@vitejs/plugin-react`](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react), which this project uses, is powered by Oxc.
- [`@vitejs/plugin-react-swc`](https://github.com/vitejs/vite-plugin-react-swc) uses SWC as an alternative compiler path.

The React Compiler is not enabled because it adds build configuration and can affect development and build performance. If you want to evaluate it, follow the [React Compiler installation guide](https://react.dev/learn/react-compiler/installation) and compare behaviour before and after enabling it.

### Expanding the Oxlint Configuration

For a production application, you can add type-aware lint rules by installing `oxlint-tsgolint` and extending `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rule reference](https://oxc.rs/docs/guide/usage/linter/rules) for the available rules and categories.

Do not test document or face features with real sensitive information.
