@AGENTS.md

## Claude Code notes

- `AGENTS.md` (imported above) is shared with Codex and other agents. Put project
  rules there. This file is only for Claude Code–specific notes.
- Use plan mode before changes to the schema, auth/RLS, or invoice numbering.
- To preview the UI, run `npm run dev` (port 5173). Chat needs `vercel dev`, because
  `/api` doesn't run under plain Vite.
