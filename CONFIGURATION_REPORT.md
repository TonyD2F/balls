# OpenCode Configuration Report

**Report date:** 2026-11-01  
**Repository:** `TonyD2F/balls`  
**Workspace:** `/home/runner/work/balls/balls`  
**Branch:** `opencode/41255970340`  
**GitHub run:** `41255970340` (issue #1)  
**Agent runtime:** OpenCode `v2.2.5`  
**Session:** `ses_e6b885fd6ffemtM3vgN6AIZLnj`  
**Model:** `opencode/deepseek-v4.1-flash-free`  
**Operating system:** Ubuntu 26.04.1 LTS, Linux 7.0.0-1017-azure, x86_64  
**Node.js:** v24.22.1

---

## 1. Executive summary

This session is running on a **minimal, global-only OpenCode configuration**. There is no project-level `opencode.json`, no MCP server, no plugin, and no authenticated integration. The agent is functional, but several configuration problems reduce reproducibility and safety.

The most important findings:

1. **The project instruction file is not being loaded.** The repository contains `Agents.md` (lowercase `g`), but OpenCode looks for `AGENTS.md` (uppercase). On this case-sensitive Linux filesystem the file is invisible to OpenCode. The file is also untracked, so it would not exist in a fresh clone.
2. **The global `"*": "allow"` rule is broader than the task needs.** It overrides the built-in `.env` `ask` protection and makes shell, edit, web, and subagent access unrestricted by default. It also nullifies the built-in read-only postures of `plan`, `explore`, `summary`, and `title`, because global config rules are appended after built-in agent rules and the last matching rule wins.
3. **`.env` protection is overridden.** The built-in `.env` `ask` rules are base defaults; the global `"*": "allow"` is appended after them, and last match wins. The run also uses `--auto`, which auto-approves anything not explicitly denied.
4. **The skill bundle is not versioned with the project.** `.agents/` is git-ignored and is a nested Git checkout of `denaidark/skills`. A fresh clone of this repository will not contain the skills.
5. **Several skills are not runnable as-is.** `mcp-duckgo` needs `uvx` (missing), `image-search` needs the Python `ddgs` package (missing), and `load-sketchfab-threejs` has no installed `node_modules`.
6. **The documented preview port is wrong.** `Agents.md` says `http://localhost:3002`; the runtime uses `APP_PORT=3000`.

Overall: **functional in this runner, but not reproducible from the repository and not safely constrained**.

---

## 2. Scope and method

The report covers configuration actually loaded by this session, not upstream OpenCode defaults. Evidence was collected with:

```sh
opencode --version
opencode debug config
opencode debug agents
opencode debug paths
opencode mcp list
opencode plugin list
opencode models
opencode auth list

git status --short
git ls-files
git check-ignore -v .agents
git -C .agents remote -v

sqlite3 ~/.local/share/opencode/opencode.db \
  "select * from instruction_entry;"
sqlite3 ~/.local/share/opencode/opencode.db \
  "select * from instruction_blob;"
```

Permission ordering was confirmed both from `opencode debug agents` on v2.2.5 and from the upstream v2 sources (`packages/core/src/config/plugin/agent.ts` appends global rules; `packages/core/src/permission.ts` evaluates with `findLast`).

Secret values were redacted. The report includes only secret **names**, never values.

---

## 3. Configuration sources

### 3.1 `opencode debug config`

Only one configuration document is loaded:

```json
[
  {
    "type": "document",
    "path": "/home/runner/.config/opencode/opencode.json",
    "info": {
      "$schema": "https://opencode.ai/config.json",
      "permissions": [
        { "action": "*", "resource": "*", "effect": "allow" },
        { "action": "subagent", "resource": "*", "effect": "allow" }
      ],
      "plugins": []
    }
  },
  { "type": "directory", "path": "/home/runner/.config/opencode" },
  { "type": "directory", "path": "/home/runner/.opencode" }
]
```

### 3.2 Source inventory

| Layer | Path | Present | Loaded / effect |
|---|---|---:|---|
| Global config | `/home/runner/.config/opencode/opencode.json` | yes | Only config document |
| Global config dir | `/home/runner/.config/opencode` | yes | Scanned |
| Global data dir | `/home/runner/.opencode` | yes | Scanned |
| Project config | `/home/runner/work/balls/balls/opencode.json` | no | No project overrides |
| Project config dir | `/home/runner/work/balls/balls/.opencode` | no | None |
| Project instructions | `/home/runner/work/balls/balls/AGENTS.md` | no | Not found |
| Actual instruction file | `/home/runner/work/balls/balls/Agents.md` | yes | **Not loaded (case mismatch)** |
| Project skills | `/home/runner/work/balls/balls/.agents/skills` | yes | 5 skills loaded |
| Global skills | `~/.config/opencode/skill(s)`, `~/.opencode/skill(s)` | no | None |
| Global instructions | `~/.config/opencode/AGENTS.md`, `~/AGENTS.md` | no | None |
| Runtime instructions | `/home/runner/work/_temp/omgithub-runtime/AGENTS.md` | yes | Outside workspace, not loaded |

### 3.3 Instruction-file defect

OpenCode's server log subscribes to these instruction paths:

```text
/home/runner/work/balls/balls/AGENTS.md
/home/runner/work/balls/AGENTS.md
/home/runner/AGENTS.md
/home/runner/.config/opencode/AGENTS.md
```

None of those exist. The only project instruction file is:

```text
/home/runner/work/balls/balls/Agents.md   (1,081 bytes)
```

Evidence that its contents were not loaded:

- `instruction_blob` contains only the core Code Mode, skill-guidance, date, and environment blobs.
- A search for `Process lifecycle` in `instruction_blob` returns `0` rows.
- The session's `instruction_entry` table is empty.
- `git status` shows `?? Agents.md`, so the file is untracked and would not survive a fresh checkout.

**Impact:** the agent does not receive the intended process-lifecycle rules or the Linux browser/WebGPU capture rules.

### 3.4 Global config file

`/home/runner/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [],
  "permission": {
    "*": "allow",
    "task": "allow"
  }
}
```

Notes:

- The file is mode `600` (owner-only), which is appropriate.
- `permission` and `task` are V1-era names. OpenCode v2 translates them to `permissions`, `shell`, and `subagent`; the debug output confirms this conversion.
- `plugin` is also a deprecated V1 key; v2 uses `plugins`.
- The config contains no `model`, `provider`, `agent`, `instructions`, `mcp`, or `command` entries.
- No secrets are stored in this file.

---

## 4. Effective permissions

### 4.1 Rule ordering

OpenCode v2 evaluates permission rules **in order, last match wins**. The effective order is base policy, built-in agent rules, global config rules, then agent-specific config rules. The debug output for `build` shows this order:

```text
1. *            *        allow    (base policy)
2. read         *.env    ask      (base policy)
3. read         *.env.*  ask      (base policy)
4. read         *.env.example allow
5. question     *        allow    (build agent)
6. *            *        allow    (global config)
7. subagent     *        allow    (global config: "task": "allow")
8. browser      *        deny     (agent default)
9. skill        browser  deny
```

Because rule 6 is a broad `allow` appended after the `.env` `ask` rules, **the `.env` protection is overridden**. The later `browser: deny` remains effective because it comes after rule 6.

The CLI invocation is:

```text
opencode run --auto --server http://127.0.0.1:41093 \
  --model opencode/deepseek-v4.1-flash-free --format json ...
```

`--auto` auto-approves any request that is not explicitly denied. Even if the `.env` rule were not shadowed, it would be auto-approved in this run.

### 4.2 Built-in agents after the global override

| Agent | Built-in intent | Effect after global `*: allow` |
|---|---|---|
| `build` | Default executor; browser denied | Everything allowed except browser |
| `plan` | Read-only; edits denied except `~/.opencode/plan/*` | **Edits allowed** — read-only restriction overridden |
| `explore` | Read/search only; subagents denied | **All tools allowed** — restriction overridden |
| `general` | Questions/subagents denied | **Subagents allowed** — restriction overridden |
| `compaction` | Base policy | Everything allowed except browser |
| `summary` | Denies all actions | **Everything allowed** except browser |
| `title` | Denies all actions | **Everything allowed** except browser |

This is the practical consequence of the global allow-all rule: the built-in safety postures of `plan`, `explore`, `summary`, and `title` do not survive the merge.

### 4.3 What the agent can do

- Run arbitrary shell commands as the `runner` user.
- Read and edit any file the user can write.
- Read environment variables, including CI secrets, via shell.
- Fetch and search the web.
- Spawn subagents without restriction.
- Use `playwright-cli` through the shell even though the `browser` tool is denied.

The only hard denial in the effective policy is the `browser` tool and the `browser` skill.

---

## 5. Agents

`opencode debug agents` lists seven built-in agents:

| ID | Name | Mode | Hidden | Description |
|---|---|---|---|---|
| `build` | Build | primary | no | Default agent; executes tools |
| `plan` | Plan | primary | no | Read-only exploration and planning |
| `explore` | Explore | subagent | no | Fast codebase search |
| `general` | General | subagent | no | Multi-step research and execution |
| `compaction` | Compaction | primary | yes | Context compaction |
| `summary` | Summary | primary | yes | Session summarization |
| `title` | Title | primary | yes | Session title generation |

No custom agents are defined. No agent has an explicit model, temperature, variant, or tool allowlist. The session uses the default `build` agent; the session database records `agent` as null and the model as `{"id":"deepseek-v4.1-flash-free","providerID":"opencode"}`.

---

## 6. Models, authentication, and fallback

### 6.1 Available models

`opencode models` returns eight free OpenCode Zen models:

```text
opencode/beam-free
opencode/big-pickle
opencode/deepseek-v4.1-flash-free
opencode/flint-40b-free
opencode/glm-5.3-flash-free
opencode/mimo-v2.6-flash-free
opencode/nemotron-3.5-lightning-free
opencode/nemotron-3.5-super-vl-free
```

### 6.2 Selected model

The selected model comes from the issue label:

```text
model/opencode/deepseek-v4.1-flash-free
```

and is passed on the CLI by the runtime wrapper. It is **not** set in `opencode.json`.

### 6.3 Runtime fallback chain

`run-with-model-fallback.mjs` defines this preferred order:

```text
opencode/deepseek-v4.1-flash-free
opencode/glm-5.3-flash-free
opencode/mimo-v2.6-flash-free
opencode/big-pickle
```

If `OPENROUTER_API_KEY` is set, it appends:

```text
openrouter/cohere/north-mini-code:free
```

It retries on HTTP `429`, `500`, `502`, `503`, `504` and on provider errors such as `provider.free-limit`, `provider.rate-limit`, `provider.overloaded`, and `provider.model-not-found`. This fallback behavior is outside OpenCode configuration; a local run without the wrapper will not have it.

### 6.4 Authentication

`opencode auth list` reports:

```text
No authenticated integrations
```

The model is authenticated through the `OPENCODE_API_KEY` environment variable (redacted). `OPENCODE_AUTH_CONTENT` is empty, so there is no injected auth JSON. `OPENROUTER_API_KEY` is also present in the environment (redacted) but is not an OpenCode integration.

Free-model usage limits are per egress IP, not per account. A `FreeUsageLimitError` 429 should be treated as local to the runner, not as an account-wide quota.

---

## 7. Skills

### 7.1 Project skills

The project provides five skills under `.agents/skills`:

| Skill | Size | Purpose | Runtime readiness |
|---|---:|---|---|
| `gauntlet-loop` | 12K | Builder/critic iteration prompt | Prompt-only; ready |
| `image-search` | 24K | DuckDuckGo image search | **Not ready: `ddgs` Python package missing** |
| `load-sketchfab-threejs` | 1.2M | Sketchfab download, GLB normalization, Three.js/PlayCanvas A/B viewer | **Not ready: `node_modules` not installed** |
| `mcp-duckgo` | 8K | DuckDuckGo MCP via `mcporter` | **Not ready: `uvx` missing** |
| `opencode-zen-completions` | 16K | OpenCode Zen completions API | Ready; no local dependency |

The session also exposes two built-in skills:

| Skill | Source | Purpose |
|---|---|---|
| `opencode` | Built-in | OpenCode self-help and configuration guidance |
| `report` | Built-in | Diagnostics collection and GitHub issue reporting |

`image-search` declares `user-invocable: false` and an `allowed-tools` list (`Read`, `Write`, `Edit`, `Bash`).

### 7.2 Discovery

The server watches:

```text
/home/runner/work/balls/balls/.agents/skills
```

The loaded skill metadata confirms the five project skills. Global skill locations are watched but do not exist.

### 7.3 Provenance

`.agents/README.md` documents the imports:

- `mcp-duckgo` — `aahl/skills`
- `image-search` — `z0gsh1u/oh-my-writing-skill`
- `gauntlet-loop` — `robonuggets/gauntlet-loop`
- `load-sketchfab-threejs` — local asset workflow
- `opencode-zen-completions` — local skill

Third-party licenses are preserved under `.agents/third-party-licenses/`.

### 7.4 Version-control problem

`.agents/` is ignored by `.gitignore` line 8 and is itself a Git repository:

```text
remote: https://github.com/denaidark/skills
HEAD:   646a42c Initial public snapshot of shared OpenCode skills
```

The parent repository tracks only:

```text
.github/workflows/opencode.yml
README.md
```

So the skills are **runtime-provisioned, not project-versioned**. A fresh clone or a different runner will not have them unless the same provisioning step is repeated.

### 7.5 Dependency checks

| Command | Status | Consequence |
|---|---|---|
| `npx` | available | `mcporter` can be fetched on demand |
| `uvx` | **missing** | `mcp-duckgo` command fails before MCP starts |
| `mcporter` | missing | Must be fetched via `npx -y` |
| Python `ddgs` | **missing** | `image-search` exits with an install message |
| Python `requests` | available | Fine |
| `node_modules` in `load-sketchfab-threejs` | **missing** | Its `.mjs` tools cannot import dependencies |
| `blender` | missing | Not required by the current scripts, but relevant for 3D workflows |

`image-search` was invoked with `--help`; it exits `1` with:

```text
错误: 请先安装 ddgs 库
运行: pip install ddgs
```

---

## 8. Plugins and MCP

| Item | Result |
|---|---|
| Plugins | `opencode plugin list` → “No plugins found” |
| MCP servers | `opencode mcp list` → “No MCP servers configured” |

`mcp-duckgo` is not an OpenCode MCP server. It shells out to an external MCP server through `mcporter`, so `opencode mcp list` remains empty even if that skill is used.

No MCP tools, resources, or templates are available to the agent through OpenCode itself.

---

## 9. Environment and experimental flags

The following OpenCode-related variables are set (secret values redacted):

| Variable | Value | Meaning |
|---|---|---|
| `OPENCODE` | `1` | Running under OpenCode |
| `AI_AGENT` | `opencode` | Agent identity |
| `OPENCODE_API_KEY` | `<redacted>` | Model/provider credential |
| `OPENCODE_AUTH_CONTENT` | *(empty)* | No injected auth JSON |
| `OPENCODE_ENABLE_EXA` | `true` | Exa search enabled |
| `OPENCODE_ENABLE_EXPERIMENTAL_MODELS` | `true` | Experimental model catalog |
| `OPENCODE_EXPERIMENTAL` | `true` | Experimental features |
| `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` | `true` | Background subagents |
| `OPENCODE_EXPERIMENTAL_WEBSOCKETS` | `true` | WebSocket transport |
| `OPENCODE_EXPERIMENTAL_WORKSPACES` | `true` | Workspace features |
| `OPENCODE_PASSWORD` | `<redacted>` | Local service authentication |
| `OPENCODE_SESSION_ID` | `ses_e6b885fd6ffemtM3vgN6AIZLnj` | Current session |
| `OPENCODE_TERMINAL` | `1` | Terminal mode |
| `OPENCODE_WEB_DIR` | `/home/runner/work/_temp/omgithub-web` | Web/runtime state |
| `OPENCODE_WEB_PORT` | `41093` | Web server port |
| `APP_PORT` | `3000` | Preview app port |
| `RUNTIME_DIR` | `/home/runner/work/_temp/omgithub-runtime` | Runtime scripts |

Additional CI variables include `GH_TOKEN`, `OMGITHUB_CALLBACK_TOKEN`, and `ACTIONS_ID_TOKEN_REQUEST_TOKEN` (all redacted), plus the standard `GITHUB_*` context variables.

Implications:

- All experimental features are enabled. Behavior may differ from a stable OpenCode build.
- Background subagents are enabled, which is relevant to fan-out workflows.
- The agent can read all of these values through the shell unless permissions are tightened.

---

## 10. GitHub Actions workflow

`/.github/workflows/opencode.yml` is the only tracked automation file besides `README.md`.

### 10.1 Triggers

- `issues: types: [opened]`
- `workflow_dispatch` with a required `issue_number` input

The `prepare` job runs when the event is `workflow_dispatch` or when an opened issue contains the `OpenCode` label.

### 10.2 Permissions

Workflow-level:

```yaml
permissions: {}
```

Job-level:

| Job | Permissions |
|---|---|
| `prepare` | `contents: write`, `id-token: write`, `issues: write`, `actions: write` |
| `opencode` | `contents: write`, `id-token: write`, `issues: write`, `actions: read`, `pull-requests: write` |

The top-level empty permission set is good practice: each job receives only what it needs.

### 10.3 Concurrency

```yaml
concurrency:
  group: opencode-issue-${{ github.repository }}-${{ github.event.issue.number || inputs.issue_number }}
  cancel-in-progress: false
```

Runs for the same issue are serialized rather than cancelled.

### 10.4 Reusable workflows and pinning

Both jobs call reusable workflows from `denaidark/OhMyGithub`, pinned to:

```text
78b3c5fe33e3db4dda59a2c15d07c9f4a2fd5779
```

`runtime_ref` is pinned to the same commit. This is a strong supply-chain practice.

### 10.5 Secrets

The reusable workflow receives:

- `OPENCODE_API_KEY`
- `OPENCODE_AUTH_JSON`
- `AGENTSWEB_SSH_PUBLIC_KEY`
- `OPENROUTER_API_KEY`

No secret values are present in the repository.

---

## 11. Project runtime scripts

### 11.1 Scripts

| File | Tracked | Behavior |
|---|---|---|
| `start.sh` | no | `node "$RUNTIME_DIR/scripts/default-start.mjs"` under `/usr/bin/time -p` |
| `capture.sh` | no | `node "$RUNTIME_DIR/scripts/default-capture.mjs"` under `/usr/bin/time -p` |
| `startup.sh` | no | No-op; only `set -euo pipefail` |

`RUNTIME_DIR` is set to `/home/runner/work/_temp/omgithub-runtime`, so the scripts are runnable in this runner. They are generated scaffolding, not committed project code.

### 11.2 `default-start.mjs`

- Accepts a Vite project (`package.json` with `vite`), rejects Next.js, or serves a static `index.html`.
- Runs `npm ci`/`npm install` and `vite build --base ./` when needed.
- Serves static files with an SSE live-reload endpoint at `/__omgithub/live`.
- Listens on `process.env.PORT || 3000`.
- Writes `deployment-output.json` when `OPENCODE_WEB_DIR` is set.
- Supports `.glb` and `.wasm` MIME types.

The workspace currently has no `index.html` and no `package.json`, so `start.sh` would fail with “No generated index.html or supported package project” until the application is scaffolded.

### 11.3 `default-capture.mjs`

- Loads Playwright from `~/.local/share/omgithub-playwright`.
- Reads `linux.json` on Linux.
- Uses the persistent Xvfb display.
- Requires `CAPTURE_URL` and `CAPTURE_DIR`.
- Captures:
  - desktop `1440x900` → `final-desktop.png`
  - mobile `390x844` → `final-mobile.png`
- Waits for fonts, optionally auto-clicks a start control, and waits 1 second.
- With `CAPTURE_STRICT=1`, fails on page errors or same-origin HTTP `>= 400`.
- Uses exit code `75` for transient failures.

### 11.4 Browser/WebGPU settings

`~/.local/share/omgithub-playwright/linux.json`:

```json
{
  "outputDir": "/home/runner/.local/share/omgithub-playwright/output",
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "channel": "chromium",
      "headless": false,
      "args": [
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-webgpu",
        "--use-angle=vulkan",
        "--enable-features=Vulkan",
        "--use-vulkan=swiftshader",
        "--use-webgpu-adapter=swiftshader",
        "--disable-vulkan-surface"
      ]
    }
  }
}
```

This is **SwiftShader CPU software rendering**, not hardware GPU acceleration. Any performance or visual claim must say so.

### 11.5 Port mismatch

- `Agents.md` says: `http://localhost:3002`
- Runtime: `APP_PORT=3000`, `PORT="${APP_PORT:-3000}"`
- `start.sh` inherits `PORT`, so the default is `3000`.

The instruction file is currently not loaded, so the mismatch is latent, but it will become an active bug once the filename is fixed.

---

## 12. Security and permission posture

### 12.1 Strengths

- Global config and service state are mode `600`.
- The workflow pins reusable actions to a commit SHA.
- Workflow-level permissions are empty; job permissions are scoped.
- No secrets are stored in `opencode.json` or the repository.
- `browser` and `skill: browser` are denied.

### 12.2 Weaknesses

- Global `*: allow` makes shell, edit, web, and subagent access unrestricted.
- Built-in read-only agents are overridden by the global rule.
- `.env` `ask` rules are shadowed by the later global allow.
- `--auto` auto-approves non-denied requests.
- `external_directory` defaults to allow; the agent can read outside the workspace.
- The `browser` denial is only a tool-level control; `playwright-cli` remains reachable through the shell.
- `.env` files are not in `.gitignore`.
- `.agents/` contains third-party executable content, including a vendored browser extension, and is not tracked or reviewed with the project.

### 12.3 Secret exposure

The agent process can read all CI secrets through the shell environment. The configuration does not add any deny rule for:

- `.env` files
- `~/.ssh/*`
- `~/.config/gh/*`
- cloud credential files
- the OpenCode database or service state

This is expected in a trusted ephemeral runner, but it should be explicit rather than accidental.

---

## 13. Findings

| ID | Severity | Finding | Evidence | Impact |
|---|---|---|---|---|
| F1 | **P1** | Project instructions are not loaded | `Agents.md` vs `AGENTS.md`; watcher log; empty `instruction_entry`; zero matches for `Process lifecycle` | Agent misses process/browser rules |
| F2 | **P1** | Global allow-all nullifies read-only agents | `opencode debug agents` shows `plan`'s `edit * deny` and `explore`'s `* deny` **before** the global `* allow`; `Permission.evaluate` uses `findLast` | `plan` can edit, `explore` can use denied tools |
| F3 | **P1** | `.env` protection is ineffective | `.env` asks precede the global allow; `--auto` also auto-approves | Secrets may be read without a hard boundary |
| F4 | **P1** | Skills are not versioned with the project | `.agents/` ignored; nested repo `denaidark/skills` | Fresh clones/other runners lack skills |
| F5 | **P2** | No project-level config | `opencode debug config` shows only global file | Behavior not reproducible from repo |
| F6 | **P2** | Skill dependencies missing | `uvx`, `ddgs`, `node_modules` missing | Skills fail at runtime |
| F7 | **P2** | Port mismatch | `Agents.md` says 3002; `APP_PORT=3000` | Wrong URL after filename fix |
| F8 | **P2** | Runtime scripts are untracked | `start.sh`, `capture.sh`, `startup.sh` are `??` | Non-reproducible setup; `startup.sh` is a no-op |
| F9 | **P3** | Experimental flags all enabled | Six `OPENCODE_EXPERIMENTAL*` variables | Reduced reproducibility |
| F10 | **P3** | Model selection is CLI/label-only | No `model` in config; label drives CLI | Local runs lose fallback/model intent |
| F11 | **P3** | No MCP/plugins/auth integrations | CLI reports none | Limited tool surface; external skills bridge the gap |
| F12 | **P3** | `.env` not git-ignored | `.gitignore` has no `.env` rule | Accidental secret commit risk |

---

## 14. Recommendations

### 14.1 Fix the instruction filename (highest priority)

```sh
mv Agents.md AGENTS.md
git add AGENTS.md
git commit -m "Add AGENTS.md for OpenCode"
```

Then verify with:

```sh
opencode debug config
```

The file should be watched as `.../AGENTS.md`, and its text should appear in the session's instructions.

### 14.2 Add a project-level `opencode.json`

Create `/home/runner/work/balls/balls/opencode.json` so model and permission intent are reviewable:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/deepseek-v4.1-flash-free",
  "permissions": [
    { "action": "*", "resource": "*", "effect": "allow" },
    { "action": "read", "resource": "*.env", "effect": "deny" },
    { "action": "read", "resource": "*.env.*", "effect": "deny" },
    { "action": "read", "resource": "*.env.example", "effect": "allow" },
    { "action": "read", "resource": "~/.ssh/*", "effect": "deny" },
    { "action": "read", "resource": "~/.config/gh/*", "effect": "deny" },
    { "action": "edit", "resource": ".git/*", "effect": "deny" },
    { "action": "shell", "resource": "rm -rf *", "effect": "deny" }
  ]
}
```

Because rules are last-match-wins, the specific denies must come after the broad allow. Validate the result with:

```sh
opencode debug config
opencode debug agents
```

If you want `plan` and `explore` to remain read-only, add explicit **agent-specific** permission rules. Global config rules are appended after the built-in agent rules, but agent-specific config rules are appended after the global rules, so they win.

### 14.3 Make the skills reproducible

Choose one:

1. **Vendor them:** remove the nested `.agents/.git`, remove `.agents/` from `.gitignore`, and commit the skills with their licenses.
2. **Submodule:** add `denaidark/skills` as a real submodule at `.agents/`.
3. **Provision explicitly:** keep them runtime-provided and document the provisioning step in `README.md` and `AGENTS.md`.

For a CI-driven project, option 1 or 2 is preferable.

### 14.4 Install or replace missing skill dependencies

- Install `uv`/`uvx` in the runner image, or change `mcp-duckgo` to a command that exists.
- Add `pip install ddgs` (or a project setup step) for `image-search`.
- Run `npm install` in `load-sketchfab-threejs` before using its `.mjs` tools.
- Add a small `scripts/check-skills.sh` that verifies each skill's declared dependencies before a run.

### 14.5 Align the preview port

Either:

```sh
export APP_PORT=3002
```

or change `Agents.md` to:

```text
http://localhost:3000
```

Pick one and keep the instruction, runtime, and docs consistent.

### 14.6 Track or generate the runtime scripts

If `start.sh`, `capture.sh`, and `startup.sh` are part of the project contract, commit them. If they are generated, add a deterministic generation step and document it. `startup.sh` currently does nothing; either implement it or remove it.

### 14.7 Tighten permissions deliberately

The current allow-all policy is fine only if the runner is fully trusted and ephemeral. For anything else:

- Deny reads of `.env`, `.ssh`, `.config/gh`, cloud credentials, and the OpenCode database.
- Deny edits to `.git/`.
- Ask before shell commands, with narrow allows for `git status`, `git diff`, and project build commands.
- Keep `browser` denied unless a task explicitly needs it.
- Remember that `playwright-cli` is still reachable through the shell; the browser tool denial is not a sandbox.

### 14.8 Reduce experimental surface

Enable only the experimental flags the workflow needs. In particular, `OPENCODE_EXPERIMENTAL`, `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`, `OPENCODE_EXPERIMENTAL_WEBSOCKETS`, and `OPENCODE_EXPERIMENTAL_WORKSPACES` all change runtime behavior.

### 14.9 Add a configuration check

Add a small CI check that runs:

```sh
opencode debug config
opencode debug agents
```

and fails if the expected project config or `AGENTS.md` is missing. This catches the case-sensitivity problem before an agent run starts.

---

## 15. Appendix: file inventory

### Tracked

```text
.github/workflows/opencode.yml
README.md
```

### Untracked

```text
.gitignore
Agents.md
capture.sh
start.sh
startup.sh
```

### Ignored / nested

```text
.agents/        (nested Git repo: denaidark/skills @ 646a42c)
```

### Not present

```text
AGENTS.md
opencode.json
index.html
package.json
node_modules/
```

---

## 16. Appendix: configuration at a glance

| Metric | Value |
|---|---|
| Config documents loaded | 1 |
| Project config files | 0 |
| Agents | 7 (4 visible primaries/subagents, 3 hidden) |
| Project skills | 5 |
| Built-in skills | 2 |
| MCP servers | 0 |
| Plugins | 0 |
| Authenticated integrations | 0 |
| Available models | 8 free OpenCode models |
| Project instruction files loaded | 0 |
| Effective permission default | allow-all |
| Browser tool | denied |
| Preview port | 3000 (docs say 3002) |
| Browser renderer | SwiftShader CPU software |

---

*End of report.*
