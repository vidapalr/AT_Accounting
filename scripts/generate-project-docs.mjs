// Source-derived documentation only. Does not connect to a database or read .env files.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const out = 'docs/current';
fs.mkdirSync(out, { recursive: true });
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const files = ['src', 'tests', 'scripts', 'migrations', 'db'].flatMap(walk).filter(f => /\.(tsx?|m?js|css|sql)$/.test(f) && !f.endsWith('generate-project-docs.mjs')).sort();
const texts = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
const uniq = a => [...new Set(a)].sort();
const clean = s => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
const link = f => `[${f}](../../${f.replaceAll(' ', '%20')})`;
const write = (name, text) => fs.writeFileSync(`${out}/${name}`, `${text}\n`);
const tables = s => uniq(s.match(/\bacct_[a-z0-9_]+\b/g) ?? []);
const route = f => '/' + f.replace(/^src\/app\//, '').replace(/\/(page|route)\.tsx?$/, '').replace(/^(page|route)\.tsx?$/, '').split('/').filter(p => !/^\(.*\)$/.test(p)).join('/');
const imports = s => [...s.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)['"]/g)].map(m => m[1]);
const resolve = (f, i) => {
  const base = i.startsWith('@/') ? `src/${i.slice(2)}` : i.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(f), i)) : '';
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(p => texts.has(p));
};
function dependencies(f, seen = new Set()) {
  if (seen.has(f)) return seen;
  seen.add(f);
  for (const i of imports(texts.get(f) ?? '')) { const p = resolve(f, i); if (p) dependencies(p, seen); }
  return seen;
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const pages = files.filter(f => /\/page\.tsx$/.test(f));
const apis = files.filter(f => /\/route\.ts$/.test(f));
const nav = texts.get('src/lib/navigation.ts');
const navItems = [...nav.matchAll(/label: "([^"]+)", href: "([^"]+)"(?:, hint: "([^"]+)")?/g)];
const access = texts.get('src/lib/access.ts');
const features = [...access.matchAll(/^\s+(\w+): \[([^\]]+)\],/gm)].map(m => [m[1], m[2].replaceAll('"', '')]);
const prefixes = [...access.matchAll(/\["([^"\n]+)", "([^"\n]+)"\]/g)];
function roleFor(url) { const feature = prefixes.find(m => url === m[1] || url.startsWith(`${m[1]}/`))?.[2]; return features.find(m => m[0] === feature)?.[1] ?? 'GROUP_OWNER (navigation default)'; }
let screens = '# Screen catalogue\n\nEvery page.tsx in the checkout is listed below. Extracted from source, not browser screenshots. Dynamic headings, conditional fields and imported forms require runtime verification. Role columns describe navigation policy; server guards and row scope must be verified separately. Table references include local transitive imports and can therefore be broader than a screen’s direct query.\n\n';
for (const f of pages) {
  const s = texts.get(f), url = route(f), n = navItems.find(m => m[2] === url);
  const headings = uniq([...s.matchAll(/<h[1-3][^>]*>([^<{]+)<\/h[1-3]>/g)].map(m => clean(m[1])));
  const related = [...dependencies(f)].filter(p => p !== f);
  const fields = uniq([f, ...related.filter(p => p.startsWith('src/components/') || p.endsWith('.tsx'))].flatMap(p => [...texts.get(p).matchAll(/\bname=["']([^"']+)["']/g)].map(m => m[1])));
  screens += `## ${n?.[1] ?? headings[0] ?? url}\n\n- Route: \`${url}\`\n- Source: ${link(f)}\n- Access: ${f.includes('(workspace)') ? roleFor(url) : 'Outside workspace; public or shop-account-specific checks apply'}\n- Purpose: ${n?.[3] ?? (headings.join('; ') || 'See page source and linked modules for redirect or dynamic content.')}\n- Static headings: ${headings.join('; ') || 'Dynamic or delegated'}\n- Named form controls (including imported UI): ${fields.map(x => `\`${x}\``).join(', ') || 'None detected statically'}\n- Direct guard calls: ${uniq(s.match(/(?:requireAccess\("[^"]+"\)|requireGroupOwner\(\)|requireUser\(\)|getSessionUser\(\))/g) ?? []).join(', ') || 'Inspect page dependencies / layout'}\n- Direct action imports: ${imports(s).filter(x => /action/i.test(x)).map(x => `\`${x}\``).join(', ') || 'None'}\n- Referenced tables (dependency closure): ${tables([s, ...related.map(p => texts.get(p))].join('\n')).map(x => `\`${x}\``).join(', ') || 'None detected'}\n\n`;
}
write('SCREENS.md', screens);
let api = '# HTTP endpoint catalogue\n\nStatic source inventory. A named guard is evidence of a call, not proof of complete authorization. Webhooks and scheduled endpoints can use token/signature authentication instead of sessions. Review the linked implementation before calling any endpoint.\n\n| Route | Methods | Source | Authentication-related calls | Direct tables |\n| --- | --- | --- | --- | --- |\n';
for (const f of apis) { const s = texts.get(f); api += `| \`${route(f)}\` | ${uniq([...s.matchAll(/export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map(m => m[1])).join(', ')} | ${link(f)} | ${clean(uniq(s.match(/\b(?:require\w+|authorised|getSessionUser|getCurrentUser|getShopCustomer|verify\w+)\(/g) ?? []).join(', ')) || 'Inspect source'} | ${tables(s).join(', ')} |\n`; }
write('API.md', api);
let modules = '# Code reference\n\nExported declarations, imports and table references are extracted mechanically. This is a map for review, not a statement that every function is correct.\n\n';
for (const f of files.filter(f => /^src\/(lib|components)\//.test(f) && /\.tsx?$/.test(f))) {
  const s = texts.get(f), ast = ts.createSourceFile(f, s, ts.ScriptTarget.Latest, true, f.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const exported = ast.statements.filter(n => n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).flatMap(n => n.name ? [n.name.getText(ast)] : ts.isVariableStatement(n) ? n.declarationList.declarations.map(d => d.name.getText(ast)) : []);
  modules += `## ${f}\n\n${link(f)} · ${s.split(/\r?\n/).length} lines\n\nExports: ${exported.map(x => `\`${x}\``).join(', ') || 'Default or no named declarations'}\n\nLocal dependencies: ${imports(s).map(i => resolve(f, i)).filter(Boolean).map(link).join(', ') || 'None'}\n\nDirect table references: ${tables(s).join(', ') || 'None'}\n\n`;
}
write('CODE_REFERENCE.md', modules);
const sqlFiles = ['db/base_schema_2026-10-28.sql', ...files.filter(f => /^migrations\//.test(f) && Number(path.basename(f).slice(0, 3)) > 40)];
const definitions = new Map(), alters = new Map(), relations = [];
for (const f of sqlFiles) {
  const s = texts.get(f);
  for (const m of s.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(acct_\w+)`?\s*\(([\s\S]*?)\)\s*(?:ENGINE[^;]*)?;/gi)) {
    definitions.set(m[1], { file: f, ddl: m[0], line: s.slice(0, m.index).split('\n').length });
  }
  for (const m of s.matchAll(/ALTER TABLE\s+`?(acct_\w+)`?\s+([\s\S]*?);/gi)) {
    if (!alters.has(m[1])) alters.set(m[1], []);
    alters.get(m[1]).push({ file: f, ddl: m[0] });
  }
}
for (const [table, d] of definitions) {
  for (const entry of [d, ...(alters.get(table) ?? [])]) {
    for (const m of entry.ddl.matchAll(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+`?(acct_\w+)`?\s*\(([^)]+)\)/gi)) relations.push({ child: table, parent: m[2], cols: m[1].replaceAll('`', ''), parentCols: m[3].replaceAll('`', ''), file: entry.file });
  }
}
let dictionary = '# Database dictionary and DDL history\n\nSource-derived: base schema (through migration 040), followed by migrations 041–078. These are exact CREATE/ALTER definitions, not a database introspection or a flattened final schema. Read later ALTER statements to determine a column’s latest type/default and indexes. DML backfills, triggers and seed records remain in the linked SQL sources. No migrations were executed. The base dump identifies MariaDB 11.8.9; MySQL compatibility must not be assumed.\n\n';
dictionary += `Tables with CREATE definitions: **${definitions.size}**. Explicit foreign-key declarations extracted: **${relations.length}**.\n\n`;
for (const [t, d] of [...definitions].sort(([a], [b]) => a.localeCompare(b))) {
  dictionary += `## ${t}\n\nDefinition: ${link(d.file)} (line ${d.line})\n\n\`\`\`sql\n${d.ddl}\n\`\`\`\n\n`;
  for (const a of alters.get(t) ?? []) dictionary += `Change: ${link(a.file)}\n\n\`\`\`sql\n${a.ddl}\n\`\`\`\n\n`;
}
write('DATABASE_DICTIONARY.md', dictionary);
let er = '# Entity relationships\n\nThese diagrams show explicit foreign-key declarations in the checked-in SQL. Each child is assigned to one domain diagram; external parents can appear in several diagrams. The line is intentionally non-identifying and permits zero or one parent: column nullability and uniqueness are authoritative in the [dictionary](DATABASE_DICTIONARY.md). No one-to-one or mandatory relationship is inferred from a name. Logical links without SQL foreign keys are documented separately below.\n\n';
const domains = [ ['Organisation and access', /business|division|branch|user|session|login|totp/], ['Funding and agreements', /funding|agreement|amendment|participation|investor/], ['Ledger and opening balances', /journal|accounting_period|chart|opening|audit|posting/], ['Sales and customers', /sales|customer|shop_|online|offer|reward|lead|deal/], ['Purchases and stock', /purchas|supplier|stock|inventory|product|serial|approval/], ['Cash, expenses and administration', /.*/] ];
for (let i = 0; i < domains.length; i++) {
  const rels = relations.filter(r => domains.findIndex(([, re]) => re.test(r.child)) === i);
  er += `## ${domains[i][0]}\n\n\`\`\`mermaid\nerDiagram\n`;
  for (const table of definitions.keys()) if (domains.findIndex(([, re]) => re.test(table)) === i) er += `  ${table}\n`;
  for (const r of rels) er += `  ${r.parent} |o..o{ ${r.child} : "${r.cols.replaceAll(' ', '')}"\n`;
  er += '\`\`\`\n\n';
}
er += '## Foreign-key evidence\n\n| Child | Child columns | Parent | Parent columns | Source |\n| --- | --- | --- | --- | --- |\n';
for (const r of relations) er += `| ${r.child} | ${r.cols} | ${r.parent} | ${r.parentCols} | ${link(r.file)} |\n`;
er += '\n## Logical relationships requiring application enforcement\n\nCustomer follow-ups use `acct_customer_notes.customer_id` to join `acct_customers.id` together with `legal_business_id`. Leads carry their own follow-up date; they are not note rows. Ledger source identifiers associate an operational record with a journal using source type and source ID, rather than a single foreign key to all source tables. Verify these links in the action/query code; do not mistake these conventions for database-enforced constraints.\n';
write('ER_DIAGRAMS.md', er);
let migrations = '# Migration register\n\nFor a new empty database, the documented baseline is the base dump through 040, then 041–078 in numeric order. For an existing database, inspect actual schema and migration history before choosing files. This register is not evidence of production application or safe replay.\n\n| Migration | Purpose from filename | Referenced tables |\n| --- | --- | --- |\n';
for (const f of files.filter(f => /^migrations\//.test(f))) migrations += `| ${link(f)} | ${path.basename(f, '.sql').slice(4).replaceAll('_', ' ')} | ${tables(texts.get(f)).join(', ')} |\n`;
write('MIGRATIONS.md', migrations);
let env = '# Environment-variable reference\n\nNames and usage locations only; no environment files or secret values were read. Required/default/optional behavior is determined by each linked module. Includes `process.env.NAME` and the `env.NAME` alias used by db.ts; computed names can be missed.\n\n| Variable | Referenced by |\n| --- | --- |\n';
const envs = new Map();
for (const [f, s] of texts) for (const m of s.matchAll(/\b(?:process\.)?env\.([A-Z][A-Z0-9_]+)/g)) { if (!envs.has(m[1])) envs.set(m[1], new Set()); envs.get(m[1]).add(f); }
for (const name of ['BANK_ENCRYPTION_KEY', 'BANK_FINGERPRINT_KEY']) envs.set(name, new Set(['src/lib/bank-crypto.ts']));
for (const [name, refs] of [...envs].sort(([a], [b]) => a.localeCompare(b))) env += `| \`${name}\` | ${[...refs].map(link).join(', ')} |\n`;
write('ENVIRONMENT.md', env);
let inventory = '# Review coverage register\n\nEvery source/test/script/SQL/CSS file below was read by the static inventory generator. **Indexed is not manually reviewed.** No row represents a completed line-by-line correctness, security or accounting audit. Focused manual findings and checks are in [REVIEW.md](REVIEW.md). Binaries, dependencies, generated build output, credentials and live data are outside this inventory.\n\n| File | Lines | Coverage |\n| --- | ---: | --- |\n';
for (const [f, s] of texts) inventory += `| ${link(f)} | ${s.split(/\r?\n/).length} | Indexed; comprehensive manual review pending |\n`;
write('REVIEW_COVERAGE.md', inventory);
const stats = { baseline: head, files: files.length, lines: [...texts.values()].reduce((n, s) => n + s.split(/\r?\n/).length, 0), screens: pages.length, endpoints: apis.length, tables: definitions.size, foreignKeys: relations.length, migrations: files.filter(f => /^migrations\//.test(f)).length };
write('inventory.json', JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
