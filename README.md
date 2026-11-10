# Abhiram Group Accounting

Accounting and shop operations for Abhiram Group, built with Next.js, React, TypeScript and MariaDB via mysql2.

**[Open the current project documentation](docs/current/README.md)** for architecture, all 136 screens, database dictionary, E-R diagrams, migrations, code reference, operations and review findings.

## Development

Configure a development database using the [operations guide](docs/current/OPERATIONS.md), then run:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:3000`. SQL schema and setup records are required for authenticated pages. Read [AGENTS.md](AGENTS.md) and the installed Next.js guides before changing application code.

## Checks

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The [current review](docs/current/REVIEW.md) records test results and a full-lint tooling failure. A complete manual line-by-line audit, browser screenshots and live-database verification remain pending.

## Documentation updates

```powershell
node scripts/generate-project-docs.mjs
```

This refreshes source-derived references without reading secrets or connecting to a database. Historical planning and release records remain in `docs/`; current implementation documentation is in `docs/current/`.
