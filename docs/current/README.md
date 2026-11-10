# Abhiram Group Accounting — current project documentation

Prepared 10 November 2026 from commit `9f8c44e95deba0b6da2d1657a5aaa8d0b0515269`, branch `feat/ledger-dry-run`.

The application manages the group's accounting and shop operations: sales, purchases, inventory, expenses, cash, investor funding, customer relationships and a public online shop. This documentation describes the implementation in the checkout. A feature present in code is not necessarily enabled, migrated or verified in production.

## Read this first

| Document | What it covers |
| --- | --- |
| [Project guide](PROJECT_GUIDE.md) | Architecture, modules, workflows, roles and accounting boundaries |
| [Screen catalogue](SCREENS.md) | All 136 page routes, navigation permissions, headings, form controls, action imports and table dependencies |
| [Database dictionary](DATABASE_DICTIONARY.md) | 136 CREATE TABLE definitions and subsequent ALTER statements, including columns, types, defaults, keys and constraints |
| [E-R diagrams](ER_DIAGRAMS.md) | Six domain diagrams with all table entities and 174 explicit foreign-key declarations, plus relationship evidence |
| [Migration register](MIGRATIONS.md) | All 78 numbered migrations and affected tables |
| [HTTP endpoints](API.md) | All 36 route handlers, methods and authentication-related calls |
| [Code reference](CODE_REFERENCE.md) | Library/component exports, dependencies and direct database references |
| [Operations guide](OPERATIONS.md) | Local setup, schema preparation, configuration, backups and release checks |
| [Environment reference](ENVIRONMENT.md) | Variable names and source locations; no secret values |
| [Code review](REVIEW.md) | Findings, severity, evidence, remediation and verification results |
| [Review coverage](REVIEW_COVERAGE.md) | File-by-file inventory and explicit manual-review limits |
| [Acceptance checklist](ACCEPTANCE.md) | Screen, role, transaction, restore and reconciliation scenarios |

## Coverage and status

The static inventory covers 656 source, test, SQL, script and stylesheet files, totalling 102,575 lines at the baseline. It excludes third-party dependencies, generated build output, private files and binary assets. The documentation generator itself is outside those baseline counts.

This delivery includes a repository-wide structural inventory and focused manual code review. **A complete line-by-line manual review is not finished.** The coverage register intentionally does not mark indexed files as manually approved. The screen catalogue is based on implementation, not screenshots or browser acceptance. The database dictionary is source DDL history, not a verified live database export. No database was queried or modified, and no migrations, postings, messages or deployment actions were performed.

Existing `docs/ROADMAP.md`, `docs/REVIEW_AND_REMEDIATION.md` and `docs/GO_LIVE.md` contain historical decisions and release notes. Use this folder for the current source map; verify historical release statements before operational use. In particular, the old schema-export note predates the committed base schema.

## Keeping this documentation current

From the project root:

```powershell
node scripts/generate-project-docs.mjs
```

This regenerates the screen/API/code/database/migration/environment/coverage references and `inventory.json`. It reads source files only and does not load `.env` or connect to the database. The project guide, operations guide, review and acceptance checklist are maintained manually. Review extraction output after syntax or framework changes; regular-expression extraction is not a SQL execution engine or a complete semantic analysis.

Mermaid diagrams render in compatible Markdown viewers. Open Markdown preview in an editor with Mermaid support. The SQL dictionary and relationship table remain readable without a diagram renderer.
