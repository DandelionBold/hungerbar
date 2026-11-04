# 🍗 Hungerbar — v1 spec (the contract)

> Produced 2026-10-24 by a design panel (fact-finder with real benchmarks, 3 architects: native / Node / Go, 3 judges). Winner: **Node — one TypeScript codebase bundled to a single .mjs** (8.3/10; Go 6.5, native 6.2).

# 0. Amendments (2026-10-24, they win over the sections below)

**0.1 The look is "Classic Plus".** It was picked in two rounds of a local picker (`test/reference/hungerbar-picker-2.html`, variant "Classic Plus", palette "minecraft"). It replaces the default output of §6 and the Minecraft variant of §8. The architecture (§1-§5, §9-§17) still stands. Normal day:
```
Model: Opus 5.5 │ Thinking: high │ Context: [█░░░░░░░░░░░░░░░] 81k/1.0M (8%) │ ⎇ main │ (+1208,-279)
Session: 🍗▰▰▰▰▰▰▰▰▰▰ 2% (↻ 4h 49m) │ Weekly: ♥♥♥♥♥♥♥♥♥♥ 82% (↻ 3d 23h) │ 💾 Cache Hit: 98% (⏲ 🔥 4m12s)
💳 Extra: $0.00/$50 │ cwd: D:/webapp │ v2.1.306
```
- Labels are grey (`#AAAAAA`, not bold); values are bold in the Minecraft colours (model `#FFAA00`, thinking `#FF55FF`, context `#80FF20`, branch `#55FF55`, changes `#FFFF55`, food `#E0A458`, hearts `#FF5555`, cache `#55FFFF`, warm `#FFAA00`, cold `#55FFFF`, extra `#17DD62`, cwd and times `#AAAAAA`, version and separators `#555555`, spent pips/hearts/bar cells `#3f3f3f`).
- Colour is 24-bit by default (`colorDepth: auto|truecolor|256|16`); 256 and 16 are nearest-colour fallbacks.
- Hunger pips = food left in the 5h window, hearts = week left; 🍗 becomes 🦴 at ≥90%. Limits, context and extra turn warn `#FFFF55` at ≥75% and crit `#FF5555` at ≥90%.
- Times: `4h 49m`, `3d 23h`, `38m`, `<1m`. Cache countdown `🔥 4m12s` while warm (`{m}m{ss}s` for a 5m TTL or under 2 min, `{s}s` under 1 min, else `{m}m`), `❄ COLD` once expired.
- Git uses ccstatusline's style: `⎇ main │ (+1208,-279)`; outside a repo `⎇ no git │ (no git)`; a clean tree hides the changes item.
- `💳 Extra` shows only when the account has extra usage (stdin `spend_limit`, or the opt-in usage API with `extra_usage.is_enabled`).
- Item ids: `model effort context git limit5h limitWeek scopedWeek cache extra cwd version resets` (`resets`, 1.2.0, is opt-in, §0.13); default `lines` = `[["model","effort","context","git"],["limit5h","limitWeek","cache"],["extra","cwd","version"]]`.
- The four picker situations (normal, close to limits, fresh/no git, using extra credits) are the pinned goldens; `test/picker.test.ts` re-runs the picker's own renderer as an oracle and requires byte-equality, in colour and ANSI-stripped.

**0.2 Data-source corrections.**
- Context tokens come from `current_usage` (input + cache_creation + cache_read), not `total_input_tokens`, which Claude Code documents as a cumulative session count. Without `current_usage` the transcript's last main-chain usage is used (dimmed), then `used_percentage × size`.
- A missing cache source shows `💾 Cache Hit: n/a` (as the picker's fresh situation does); only `caching_observed === false` hides the item.
- The transcript's `message.model` has no `[1m]` suffix, so the effort fallback compares model ids with the suffix removed.

**0.3 Fit to width (replaces §7.4's lists).** Steps, in order, applied to a line only when the item is on it, until it fits: drop resets (1.2.0, §0.13) → drop version → drop extra → drop scopedWeek → drop git changes → drop context tokens → short labels → context bar 16→8 → cwd to its basename → collapse pips/hearts to the icon → drop cwd → drop the cache timer → truncate the branch to 16 → drop cache → drop week time → drop 5h time → drop the context bar → drop git. Never dropped: model, thinking, context %, 5h %, week %.

**0.5 Install mode and performance (measured 2026-10-24 on a Windows 10 machine).**
- The kill-storm (500 CC-style spawns per mode, kills spread over 0-1000 ms because Git Bash alone took longer than 60 ms to start on that machine) left no hungerbar node.exe, launcher cmd.exe or git.exe in either mode. So `setup` writes the direct absolute-node command by default; `--launcher` keeps the `.cmd` option.
- Bench, 21 interleaved rounds: bash floor 107 ms, bare node 180 ms, Hungerbar direct 207 ms (+27 ms over bare node), launcher 251 ms, stale render 219 ms, ccstatusline 826 ms; in-process work 10 ms (budget 15). The absolute §17 budgets assumed an 80 ms floor and did not hold on that machine; the relative cost (+27 ms over node, 4× faster than ccstatusline) is the stable number. `NODE_COMPILE_CACHE` saved about 8 ms more in a trial; left for v1.1 because it needs an env prefix in the command.

**0.6 Round 3 (2026-10-25, the pick after seeing the real terminal).** Replaces the limit and timer parts of §0.1.
```
Session: ♥♥♥♥♥♥♥♥♥♥ 2% (↻ 4h 49m) │ Weekly:                 🍗🍗 82% (↻ 3d 23h) │ 💾 Cache Hit: 98% (◕ 🔥 4m12s)
```
- **Hearts for the 5-hour session, food for the week**: in Minecraft food refills health, and the weekly budget refills each session (config `minecraft.session` / `minecraft.weekly`, `hearts` | `food`).
- Hearts: ten ♥, rounded to the nearest tenth left; a lost heart turns dark #3f3f3f, from the right. The % next to them uses the heart red as its base colour.
- Food: ten 🍗 side by side (10% each, as many as the game's shanks); an eaten drumstick vanishes from the LEFT and leaves its two cells blank, so the full ones sit by the number. One stays while any of its tenth is left (ceil), like the game's last half-shank, so only 100% empties the bar. The drumstick span carries the food colour #E0A458 (it shows only when the terminal draws 🍗 as a plain glyph). The % uses the food orange as its base colour. 🦴 and the ▰ pips are gone.
- Timer: a pie from Cascadia Mono instead of ⏲ (a colour emoji in Windows Terminal, measured): ● ◕ ◑ ◔ ○ by the share of the TTL left (>7/8, >5/8, >3/8, >1/8, else), TTL 300 s for `5m` and unknown, 3600 s for `1h`; ○ when cold: `(○ ❄ COLD)`.
- Icons: the pick was plain icons, which is a Windows Terminal setting (`font.face` = `Cascadia Mono, Segoe UI Symbol`, Windows Terminal 1.21+), not Hungerbar output.
- The oracle is now `test/reference/hungerbar-picker-3.html` run with that pick (`test/picker.test.ts`).

**0.7 Two icon styles (2026-10-25).** Both are kept as a choice: **plain** (Windows Terminal font face `<font>, Segoe UI Symbol`: 🍗 🔥 💾 💳 ❄ become plain glyphs in Hungerbar's colours) and **colour** (no Segoe UI Symbol: colour emoji, the terminal's default). Hungerbar's output is the same in both. `hungerbar icons [plain|colour] [--print]` shows or switches the style by changing only `profiles.defaults.font.face` (or the legacy `fontFace`) in Windows Terminal's settings.json, after a timestamped backup; a JSONC scanner (`src/cli/jsonc.ts`) locates the value so comments, trailing commas, indentation and line endings stay as they were. It follows Windows Terminal's own reading rules: when a scope has a `font` object only `font.face` counts (the legacy `fontFace` only without one), and a repeated key keeps its last value. A missing face is inserted where Windows Terminal reads it, matching the file's indentation; a `profiles`, `defaults` or `font` that is not an object, a face that is not a string, and a file that is not UTF-8 are refused with the by-hand steps. Profiles with their own font face are reported, not changed. Every installed Windows Terminal (stable, Preview, Canary, unpackaged) is switched, each with its own backup; a hard-linked file is written in place; a read-only or locked file leaves nothing behind. `setup --icons` is checked before setup writes anything, `setup --print --icons` previews both changes, and `setup` and `doctor` report the active style (`HUNGERBAR_WT_SETTINGS` overrides the search, for tests).

**0.8 What the limits count (2026-10-25).** Round 3 counted the icons as what is left but printed the % as what is used, so two drumsticks sat next to "82%". **Left** was chosen for both: the % is `100 − floor(used)` (so 0% left shows only at exactly 100% used, and left + used is always 100), red hearts are what is left and the drumsticks are the ones left to eat. Config `"limits": "used"` flips both together: the % is `floor(used)`, a heart turns red for each tenth used, and a drumstick shows for each tenth eaten, still sitting by the number. The warn and crit colours keep firing on what is used (yellow at 75% used = 25% left, red at 90% used = 10% left). The opt-in scoped weekly item follows the same setting.

**0.9 The Minecraft HUD look (2026-10-27, v0.5.0; the hotbar's frame v0.5.1; centring v0.6.0; the git state, the PR status and the player's layers v0.7.0; released as v1.0.0 on 2026-10-28, when `hotbar` was merged into `main`).** A second look, opt-in until §0.10 made it the default: `"look": "hud"` draws a Minecraft HUD instead of the Classic Plus lines. It was built on the `hotbar` branch from the HUD build plan. Classic stayed the default until §0.10, and stays byte-identical: every classic golden and the picker oracle passed unchanged at every step. The normal day, as in README.md, which also shows Fable 5.1 in use with `hud.fable: "boss"` and the normal day centred in a 120-column window (`test/hud.e2e.test.ts` (d) pins the three README samples):
```
Opus 5.5 Efficiency III                   ◦ ○ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉ 4m12s · hit 98%
☼ 4h49m     98% ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥                       🍗🍗 18% ↻ 3d23h
81k/1.0M ▂▂▂▂▂▂ ▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂ 8%  ⌂ D:/webapp
v2.1.306  ◆ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3                 ▅▆▆ ▆▅▆▆ ▀▀▂▂  +1208 -279  ⎇ main
⠀⠀⠀⠀⠀⠀⠀⠀⠀🮂🮂🮂🮂🮂🮂⠀🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂
```

*Decisions.*
- **What it draws.** The mix picked in design rounds 4-7, exactly `MIX.render(state, {git: 'git-terrain', pick: 'pick-numeral', book: 'on', fable})` of the design engine, vendored as `test/reference/hud4.js`. That is the Day & Night lines 1-3 and a line 4 with the effort numeral on the pickaxe, the book (prompts sent) and git-terrain. `fable` is one of `fable-off|tail|tooltip|boss|beacon` (`hud.fable`). It draws 4 lines, or 5 with `boss` while the model in use has a scoped limit (the boss bar on top); the hotbar's frame (below, 0.5.1) adds one under the hotbar, so the HUD is 5 lines, or 6. Every line is at most 110 WT cells; the hotbar sits at columns 16-61; no line starts with a space. Centred (below, 0.6.0), every line moves right by one offset and stays inside the budget.
- **A port, not the engine.** `src/hud/{wt,py,text,spans,input,mix,fable}.ts` port only what that one call reaches, function by function with `// hud4.js L<n>` headers, the same branch order, and the regexes and WT width tables byte for byte. The tables decode on the first non-ASCII width, so classic renders never pay for them. Survival, Pocket, the other picks, git and book options and `fable-mount` are not ported. The port never improves the engine: an engine change is re-vendored and re-proved. `hud4.js` is a test oracle and is never bundled. The round-4 fixes live in the adapter.
- **One render** (`src/render.ts`, `src/hud/look.ts`). `hudGate` picks the look. `renderHudLook` runs `adapt` (State, payload and counts to the engine's state), the port's own `fromState` reading (branch, add, rem), the history step, `renderHud`, `gitHud` (the git state and, with `hud.pr` on, the PR's badge from `prBadge`, 0.7.0), `playerHud` (the name and the operator's mark, the idle bed and the phantoms, from `playerMarks`, 0.7.0), `frameHud` (the hotbar's frame), the centring (`hudOffset` and `shiftHud`, which move nothing unless `hud.align` is center) and `encode`. A throw on the HUD path writes its stack to stderr, drops the HUD's queued writes and draws classic from the same State. The history write waits in an `after` hook: it runs after the line's single `writeSync` and before any refresher spawns.
- **Still no git process and no network on the render**: everything the HUD adds to a render is a file read. The git state's counts (0.7.0) come from one more git command, `git status`, which the existing background refresher runs beside the diff. The PR status (0.7.0, opt-in) comes from a separate background refresher that runs `gh`; the render reads its cache entry and, when that is stale, the repo's git config. The player's layers (0.7.0) read the system's user and host names, open one folder to tell an elevated process (no process: *The player* below), and take their times from stdin, the transcript's summary and the history file the render already reads.

*Data* (`src/hud/adapter.ts`). Everything is `collect()`'s output, unchanged, except:
- `cost`: stdin `cost.total_cost_usd`, else 0.
- `turns` and `compactions`: transcript v2 (below), through `Sources.counts()`; classic's `transcript()` path is untouched.
- `branch`: `State.branchFull`, null outside a repo. It is the stdin worktree branch, else HEAD's branch (sha7 when detached), stripped like every string, and capped to its last 256 code points.
- `cwd`: `State.cwdFull` (slash form, stripped, its last 512 code points). Both caps are the engine's own `tidy` bounds, so it never cuts a second time and the output stays bounded (round-4 issue 6).
- `hist`: the history step.

The adapter also applies these rules:
- **Placeholder guard.** A model, effort, cwd or version that the engine would read as `None`, `null`, `undefined`, `NaN`, `±inf`, `Infinity` or `nil` becomes `''`. The engine then shows `Claude`, no level, no ⌂ and `v?`. The branch is never guarded: git allows `null` as a name.
- **Scoped reset.** A scoped limit past its `resets_at` is `{used: 0, left: null}`, a full week with no clock, until the next fetch, as `limits.ts view()` reads a passed reset.
- **Cache.** `null` when caching is off. Otherwise `warm` is true, false or null from warm, cold or unknown, `left` is floored at 0, and `ttl` is 3600 for `1h`, else 300.
- **No `~`.** Last-known limits and the transcript's cache values are drawn without classic's `~`: the HUD has no cell for it.
- **Limits.** The HUD always counts what is left; the `limits` key is classic only.

*History (git-terrain, `src/hud/history.ts`).*
- **The file.** `<cacheDir>/hud/<sid>.<gitKey(root)>.json`, about 300 bytes: `{"v":1,"root","branch","log":{"size","head"},"buckets":[[I,maxT,add,del,commit]],"at","sessionStart"}`. `sessionStart` (0.7.0) is the design's "the cache's first render": the now of the step that created the file, kept by every later step and handed to the engine as `hist.sessionStart` (the picked mix draws nothing from it; the phantoms read it). A file written before 0.7.0 has none and keeps none, so it is not rewritten for it; one that is no whole number from 0 to `at` is unknown, and the file stays usable. `sid` is `session_id` when it matches `/^[\w-]{1,80}$/`, else `fnv1a(transcript_path)`; with neither there is no history. Outside a repo nothing is read or written.
- **The step.** It runs once per HUD render, in-process, with no git process. It stats `<gitDir>/logs/HEAD`, the per-worktree reflog. When the saved file is valid (same `v` and root) and on the same branch, and the log grew by at most 64 KiB, it reads only the appended bytes `[size−1, S)` (the first must be `\n`), complete lines only. In every other case it re-anchors from at most the last 4 KiB and sees no commit. An emptied log on the same branch keeps the saved head, so the first commit after a `reflog expire` or gc is still seen.
- **A commit is seen** when all three hold:
  - the window continues from the saved head: its first `old` equals it, or the saved size is 0 and that `old` is all zeros (an unborn repo's first commit);
  - HEAD ended elsewhere;
  - some line after the last return to the saved head has a subject that starts with `commit` but not `commit (merge)`.
- **Buckets.** They follow the spec's CACHE UPDATE step 4 (the vendored `cacheStep`) exactly. T = add + del, with an unknown diff counted as 0. With I = floor(now/900), the current bucket is raised (or set gold), or `[I, T, add, del, commit]` is appended; only `I−8 < index ≤ I` is kept.
- **Writing.** The file is written atomically after stdout, and only when the root, branch, anchor or buckets changed, so an idle session writes at most once a quarter hour. Nothing is written with `persist=false` (preview, `--payload`, doctor).
- **Bounds per render.** 1 stat, 1 read of the small file, at most 64 KiB + 1 bytes of reflog (only when it grew on the same branch) or at most 4 KiB, at most one write after stdout, 0 processes.
- **No gold column.** A detached HEAD (the branch changes with every commit, as in the engine), reftable repos, `core.logAllRefUpdates=false`, the first commit of an orphan branch, cherry-pick and revert (spec parity: only `commit…` subjects count), and a conflicted merge concluded with `git commit` (`commit (merge)`). A commit made while the session was not rendering turns gold the quarter in which it next renders.

*Transcript v2 (`src/transcript.ts`).*
- **State.** The state file is `v: 2` and adds `turns`, `compactions` and `sawOrigin`. A v1 file is rescanned once. 0.7.0 adds `lastAt`, the newest main-chain message's time in whole seconds (any user row the pre-filter parses, a tool result included, an assistant reply that is not an API error, a prompt sent mid-turn; sidechains and rows without a time never move it, and it only ever grows), and `open` with `openMsg`: the tool calls (tool_use ids, at most 64) of the newest main-chain assistant message that have no result yet, and that message's id. A row of the same message adds its calls; any other message starts over with its own, since the API takes a new message only once every earlier call has its result. A result (its `tool_use_id`s) closes its calls; a typed prompt and the main-chain `system`/`turn_duration` row Claude Code writes when a turn ends close the rest. Calls to the tools that wait on the person (`WAITS_ON_USER`: AskUserQuestion, ExitPlanMode) are never kept. The summary says `running` while one is open. A v2 file written before has none of them: `lastAt` stays unknown until the next message and nothing is open, with no rescan.
- **Pre-filter.** It now also parses lines with `"type":"user"` and no `"tool_use_id"`, and lines with `"queued_command"` or `"turn_duration"`. Inside a JSON string these are escaped, so no typed prompt is skipped. A tool result (`"type":"user"` and `"tool_use_id"`, its first `"type"` user, no `"assistant"`) is not parsed, since a result can be megabytes: its first `"isSidechain"` and `"timestamp"` and every `"tool_use_id"` are read off the line by regular expression. Claude Code writes the row's own keys before the result's fields: so in all 58,363 tool results of 300 main and 300 subagent transcripts (2026-10-28). A result that names `"assistant"` somewhere is parsed and read the same way; any other row with those keys (a progress row quoting a subagent's message) is skipped, as before.
- **A turn** (the book's count) is a user row that:
  - is not a sidechain, meta or compact-summary row and has no tool result;
  - reads as typed: its first text, start trimmed, does not open with `[Request interrupted`, `<command-`, `<local-command-`, `<bash-`, `<task-notification`, `<cross-session-message` or `<scheduled-task` (image-only content counts);
  - is `origin.kind: "human"`, or has no origin in a transcript that has shown none yet (legacy), and whose `turnOrigin` is absent or `"human"`.
- **A prompt sent mid-turn** is a turn too. Claude Code writes it only as a main-chain `type: "attachment"` row whose attachment is a `queued_command` with `commandMode: "prompt"`, `origin.kind: "human"` and a prompt that reads as typed. It never writes a user row for it (0 of 310 such prompts across 5,252 transcripts, Claude Code 2.1.187-2.1.308). It does not set `sawOrigin`, and `queue-operation` rows never count.
- **Compactions.** A main-chain `system`/`compact_boundary` row adds one (any boundary still clears the last usage, as before).
- **Budget.** A render folds at most 4 MiB of new bytes. A bigger delta keeps the saved summary (zero counts on a fresh state) and queues `hungerbar refresh transcript <path> <id>` unless `transcript/<id>.lock` is live. The worker folds the rest in 4 MiB chunks under that lock and writes the state atomically. The render and the worker can race, but each writes a self-consistent state. Classic's transcript fallbacks share the budget, so a huge transcript fills them once the worker has run.
- **Measured.** On the design session's own 29.8 MB transcript: 27 prompts, 2 of them sent mid-turn, and 1 compaction. Three other sessions went from 19 to 34 prompts, 39 to 60 and 60 to 82, which equal the prompts sent. The scrubbed fixture keeps its pinned sums and pins 480 turns and 2 compactions; `queued-scrubbed.jsonl` pins 3 (1 typed, 2 mid-turn).

*Cache files* (amends §10): `hud/<sid>.<key>.json`, and `hud/<sid>.shown.json` (1.1.0, the totem's memory, §0.12; version 2 since 1.2.0, asked only while a limit reset is held, §0.13); `transcript/<id>.json` at v2 (1.1.0: with `ultra`, `agentAt` and the worker's look at the subagents folder, `agents`, §0.12) and `transcript/<id>.lock`; `git/<key>.json` gains `st` for the HUD (0.7.0, *The git state* below); `pr/<key>.json` and `pr/<key>.lock` (0.7.0, *The pull request and CI status* below). `pruneOld` runs from the git, transcript and PR workers at most once a day (the `.pruned` stamp). It deletes `hud/`, `transcript/` and `pr/` files untouched for 7 days, and `.tmp` files an hour old in the cache dir and its `git/`, `hud/`, `transcript/`, `pr/` and `acct-` folders, at most 200 files a run. This also implements §10's promise to prune transcripts, which no code kept before.

*Config* (amends §12; `schema.json` documents each key).
- `"look": "classic" | "hud"`, default hud since §0.10 (classic before). `HUNGERBAR_LOOK=classic|hud` wins over the file.
- `"hud": {"fable": "off" | "tail" | "tooltip" | "boss" | "beacon", "minWidth": 80, "align": "left" | "center", "pr": "off" | "on", "user": "off" | "user" | "user@host", "op": "off" | "tag" | "gold", "bed": "on" | "off", "phantoms": "on" | "off", "ultra": "on" | "off", "poison": "on" | "off", "totem": "on" | "off"}`. An absent `fable` is boss (§0.10; off before), the engine's ids (`fable-boss`) are accepted, and any other value is off. `minWidth` is an integer from 62 to 200. `align` is center unless it is exactly `left` (§0.10; 0.6.0 had it left unless exactly `center`); `HUNGERBAR_HUD_ALIGN=left|center` wins over the file, as `HUNGERBAR_LOOK` does, and other values are ignored. `pr` is off unless it is exactly `on` (0.7.0); `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or `HUNGERBAR_OFFLINE` keeps it off whatever the file says (`prEnabled`). `user` (default user since §0.10, off before), `op` (default gold since §0.10, tag before), `bed` and `phantoms` (default on) are the player's layers (0.7.0, *The player* below), `ultra` and `poison` (default on) the hearts line's looks and `totem` (default on) the offhand's (1.1.0, §0.12); any other value is the default. Test hooks, as `HUNGERBAR_NOW`: `HUNGERBAR_USER`, `HUNGERBAR_HOST` and `HUNGERBAR_ELEVATED=1|0`.
- Every Fable option but off needs `network.usageApi` and `network.scopedWeekly`. Without them `scoped` is `[]`, the HUD draws its plain 5 lines, and doctor warns. `scopedWeekly` shortens the usage refresh from 3600 s (while extra usage is off and no limit is hungry, §11) to `network.ttlSeconds` (180 s), about 20 calls an hour while a session renders.
- The HUD honours `bold` (false drops its bold), `nbsp`, `color`, `colorDepth` and `widthReserve`. It ignores `lines`, `bar`, `thresholds`, `limits` and `minecraft`.

*Gate* (`hudGate`). Classic is drawn, byte for byte, by the first of these that holds:
- an invalid `hungerbar.json` (classic shows `cfg!`, even with `HUNGERBAR_LOOK=hud`);
- a look other than hud;
- no colour, or 16 colours: the wells, notches and lost hearts are colour only;
- ASCII mode (`icons: "ascii"`, `HUNGERBAR_ASCII`, `TERM=dumb`);
- a known budget (`HUNGERBAR_WIDTH` or `COLUMNS`, minus 4, minus `widthReserve`) below `hud.minWidth`.

With an unknown width the HUD always draws. It never re-fits itself; 110 cells is the engine's grid, and the threshold is fixed, so the look does not flip between renders. The centring (0.6.0) reads the same budget but never changes the verdict.

*Output* (`encode`).
- Each span's params are `1` (when the span is bold and `cfg.bold`), then fg (`38;2;R;G;B`, or `38;5;n` at 256 colours), then bg (`48;2;R;G;B` or `48;5;n`).
- A styled span is `ESC[…m` + text + `ESC[0m`; a span with no params is its bare text. Every styled line therefore ends in `ESC[0m`, so trimming a line never drops its last background cell.
- With `nbsp` on, every space is U+00A0, background cells included: the same width the engine measured.
- Lines are joined with `\n`, with no trailing newline, in one `writeSync`, as classic.

*The hotbar's frame (2026-10-27, v0.5.1, `src/hud/frame.ts`).* It was chosen from mock-ups of the normal day (the frame lab's `frames4.png`): the hotbar closed at the bottom, the offhand boxed, the hotbar's top as it was.
- **A layer after the engine.** `frameHud` takes `renderHud`'s finished lines before `encode` and reads only what they drew. The port modules are unchanged, so they still equal the oracle span for span and the oracle test is untouched. The fable options are drawn as the engine draws them; since §0.11 the boss line's name is left out (its gutter blank). The HUD is 5 lines, or 6 with the boss bar.
- **Columns.** These are WT cells of the hotbar line, the engine's last.
  - The offhand sits at 9-14 when it is drawn; 9 and 14 are its sides.
  - 15 is a gap.
  - The hotbar sits at 16-61. 16 (`▐`) and 21 (`▌`) are slot 1's mint selection frame, `#D5E8D0`, and the dividers are `#5D5D5D`.
- **Is the offhand drawn?** The engine draws it only for an account with an extra-usage limit. The frame reads it from col 9: without an offhand no gutter cell (cols 0-15) has a background; with one, cols 9-14 do (its sides `#5D5D5D`, its well `#201E07`), and col 9 is its left side:
  - a grey side cell (`#5D5D5D`, no ink);
  - or `▐` in `#17DD62` on it, while the extra credits pay.

  The side colour is that cell's ink, else its background.
- **The bottom edge row** is a new last line of 62 cells, with no backgrounds and nothing after col 61:
  - U+1FB82 (upper one quarter block, which Windows Terminal draws itself in both icon styles) under every hotbar cell, `#D5E8D0` under 16-21 and `#5D5D5D` under 22-61;
  - U+1FB82 under 9-14 in the offhand's side colour, when it is drawn;
  - U+2800 in every other cell: 0-8, 15, and 9-14 without an offhand.
- **Why U+2800.** Claude Code trims every status line. A row that started with spaces, or with U+00A0 (JavaScript's `trim` removes it too), would lose them, and the edge would slide left under the gutter. U+2800 (braille pattern blank) is a symbol, not whitespace: it survives the trim, it is 1 cell in WT's tables and in Hungerbar's own measure, and it draws nothing.
- **The offhand's top edge.** When the offhand is drawn, cols 9-14 of the XP-bar line (the line above the hotbar) become U+2582 (lower one quarter block, the XP bar's own glyph) in the offhand's side colour. This happens only when all six cells are unstyled spaces. A context label of 10 cells or more reaches into them and leaves that line as it is: `1000k/1.0M` (a full 1M context), up to the engine's widest, 15 cells. Nothing else on the line changes: the hotbar's top is the XP bar, in its own colours.
- **Widths.** The frame changes no line's width. The new row is 62 cells, and every line stays at most 110.
- **Proof** (`test/unit/hud-frame.test.ts`).
  - By hand: the offhand drawn, absent and paying; labels of 9, 10 and 15 cells and the tokens alone; six spaces split over spans; styled, bold and background spaces; a wide cluster across col 9 or col 15; the boss line (without its name since §0.11).
  - Bytes at 24-bit and 256 colours, with bold and nbsp on and off; the row survives `trim`.
  - Both icon styles give the same frame. The frame census: the frame adds only U+2582, U+1FB82 and U+2800, each 1 cell and listed by `glyphs --hud`.
  - Against `test/hud/frame-oracle.ts`, written independently, cell by cell. It takes the offhand from the state, through the engine's own `fromState` and `paying`, rather than from the drawn line (and, since §0.11, finds the boss line by the engine's count of lines). The inputs are every reference state, every third frame of the time-lapse on Opus and on Fable 5.1, every field one at a time on the normal and paying days, and 400 seeded fuzz states, each × the 5 ids: 12,050 renders, compared as spans and as SGR at both depths. The engine's lines are never changed.
  - The gutter, on the same 12,050 renders: no background in cols 0-15 without an offhand; with one, exactly cols 9-14 (`#5D5D5D`, the well `#201E07` ×4, `#5D5D5D`), so col 9 alone tells.
  - `hud.e2e.test.ts` (b)-(d) hold dist and the README samples to the oracle framed by `frame-oracle.ts`, and (e) holds this section to what ships. Two golden cases were added: `hud-no-offhand` (no extra usage) and `hud-wide-label` (a full 1M context).
  - Regenerating the goldens changed only `hud-*` files: 76 of them, each by exactly the six top-edge cells and the new row. No classic golden changed.
- **The setup prompt.** Its boss option says, from the engine's note, that "a fifth line appears on top". The prompt shows "a sixth line" instead (`promptSentence`). Its off option was named "No Fable (as today)", with the line "Nothing about Fable on the status line, as today.": "as today" compared it with the status line of the design chat, so the prompt shows "No Fable" and "Nothing about Fable on the status line." (`promptName`, `promptSentence`). Since §0.11 the boss bar has no name, so the boss line's "the word Fable and a long pink bar" reads "a long pink bar". `FABLE_OPTIONS` stays verbatim.

*Centring (2026-10-28, v0.6.0, `src/hud/align.ts`).* The HUD can sit centred like Minecraft's hotbar, following the window's size. `"hud": {"align": "center"}` does it (the default since §0.10); `left` draws every byte as 0.5.1 did.
- **A layer after the frame.** `renderHudLook` hands `frameHud`'s lines to `hudOffset` and `shiftHud`, then to `encode`. The engine's lines and the frame are not changed, so the oracle and frame tests stand as they were. With `left` nothing is measured and the framed lines are encoded as they are.
- **The rule.** With B the budget the gate reads (`HUNGERBAR_WIDTH` or `COLUMNS`, minus 4 and `widthReserve`; Claude Code's `statusLine.padding` is not read, §7.4) and W the widest line of this render in WT cells (the boss line, the four engine lines and the frame row), every line moves right by `clamp(floor(B / 2) - 39, 0, max(0, B - W))`. 39 is the hotbar's centre column (it sits at 16-61): with B even and room, the hotbar has as many cells on its left as on its right; with B odd, one more on its right. An unknown width, or no room, gives 0: the layout of 0.5.1.
- **Nothing past the edge.** The offset is never more than B - W, so with room every line ends inside the budget. A long branch makes line 4 110 cells wide (the engine shortens the branch from the front to fit), which leaves 6 to move at COLUMNS 120 (B 116) instead of 19. The budget holds only while it is the status line's real width: `COLUMNS` is the full width, not reduced by `statusLine.padding`, and Claude Code applies the padding on both sides, so the area it draws is COLUMNS - 4 - 2p (*What Claude Code passes*). The budget does not read `settings.json`, so with a padding p > 0 and no reserve the middle sits p columns right of the area's and, when the offset is held at B - W, the widest line can end up to 2p columns past the edge, where Claude Code cuts it with `…` (as it cuts a classic line fitted to B). The reserve that fixes both is 2p: a non-zero padding belongs in `widthReserve` twice, and doctor warns while `widthReserve` is below 2 × padding (setup writes padding 0, and keeps one already set). A reserve of p alone would still lose p cells off the end.
- **One offset for every line.** The same lead goes before each line's first cell (a line with no cells stays empty), so the grid stays aligned: the boss bar over the hotbar, the XP notches over its dividers, the frame row under it.
- **Why U+2800.** Claude Code trims every status line, so a lead of spaces or U+00A0 would be lost and the HUD would snap back to the left edge. The lead is U+2800 (braille pattern blank), as in the frame row: it survives the trim, it is 1 cell in WT's tables and in Hungerbar's own measure, it draws nothing, and it is written unstyled, so it adds no SGR. The frame row's own U+2800 lead simply grows.
- **Following the window.** Claude Code passes `COLUMNS` on every run (*What Claude Code passes*, below) and re-runs the status line on its events and every `refreshInterval` (setup writes 10 s). Nothing is kept between renders, so after a resize the next render is centred in the new width.
- **Proof.** `test/unit/hud-align.test.ts`: the offset by hand (B even and odd, unknown, smaller than W, a long branch, the boss line), the lead as spans and as bytes at 24-bit and 256 colours with bold and nbsp on and off, `renderPayload` for both aligns, and the offset against `test/hud/align-oracle.ts` (written independently: the largest shift, found by search) on the reference states, the time-lapse and fuzz states × the 5 ids × every budget from 0 to 220. Three golden cases (`hud-center`, `hud-center-boss`, `hud-center-branch`) run through dist at COLUMNS 84, 100, 120, 121 and 200, and `hud-normal` at 120 and 200 (left reads no width); `hud.e2e.test.ts` (f) holds each to the oracle's bytes moved by the tests' offset, and `HUNGERBAR_HUD_ALIGN` both ways. Regenerating the goldens changed no existing file. `npm run test:hud-coverage` covers `align.ts` at 100%.

*The git state (2026-10-28, v0.7.0, `src/hud/gitstate.ts`, `src/git/status.ts`).* It was chosen in design round 8: the option `colour-marks` ("Colour + short marks") of `gitstate.json`, whose rows are vendored as `test/reference/round8/gitstate.json`. Always on in the HUD; classic is unchanged.
- **What it draws.** From the readout's ⎇ on (line 4, after the hotbar and the `+added -removed`):
  - ⎇ in the working tree's colour: green `#55FF55` clean, yellow `#FFFF55` changes, aqua `#55FFFF` untracked files only, red `#FF5555` a conflict; the engine's grey while the status is unknown.
  - The branch in the commits' colour: white, purple `#FF55FF` while a merge, rebase or cherry-pick is in progress, gold `#FFAA00` when ahead of or behind the upstream. A detached HEAD is `@` and its short sha in grey. During a rebase it is the branch being rebased (rebase's `head-name`), as git-prompt.sh shows it, although HEAD is detached; the engine is still handed the sha, as classic shows it.
  - Marks, each after a space: purple `merge`, `rebase S/T` or `pick` (a cherry-pick; the design's own word for it), red bold `!N` conflicts, aqua bold `?N` untracked, gold bold `↑A↓B` ahead and behind (each only when not zero). Counts are the engine's `kilo` (at most 5 characters: `99999`, then `100k`).
  - Nothing known (no status yet, nothing in progress, not detached): the engine's lines exactly, so 0.6.0's bytes stand. A stdin `worktree.branch` is drawn as the engine draws it, never as detached.
- **A layer after the engine.** `gitHud` takes `renderHud`'s lines before the frame. It finds the readout as the hotbar line's last two spans (`⎇ ` in grey, the branch in white, both plain) and redraws from there; every other cell and line stays as the engine drew it, so the port and the oracle test are untouched.
- **Fit.** Line 4 stays within 110 cells. The branch is cut from the front with the engine's `tailPath` (`…/minecraft-hud-round-4`; a last name longer than the room keeps its own start), and keeps at least 10 cells, or all of a shorter branch. Until it can, the marks give way, least important first: `?N`, then `↑↓`, then the rebase's step, then `!N`, then the word in progress. ⎇ sits at col 63 to 78, so with all of them gone the branch has at least 30 cells.
- **The status.** For the HUD (`look` hud) the git refresher is queued as `refresh git <root> <edits> status` and runs `git --no-optional-locks -C <root> status --porcelain=v2 --branch` beside the diff, with the same env and `git.timeoutMs`. Its output is counted as it streams: `1` and `2` entries are changed (renames included), `u` conflicts, `?` untracked as `git status` lists them (a new folder counts once; `status.showUntrackedFiles=no` shows none), and `# branch.ab +A -B` gives ahead and behind (none without an upstream). It lands in the same entry as `"st":{"changed","untracked","conflicts","ahead","behind"}`; a failed or timed-out status writes `"st":null` (the HUD then knows nothing new until the entry goes stale), and a failed diff writes nothing, as before. An entry without `st` (classic's or 0.6.0's) is stale for the HUD, so the first HUD render after an upgrade asks once. Classic queues the refresher as before and never runs the status. `sync` runs it inline too, `off` never.
- **In progress** (`readOp`, in the render, no process). In the worktree's own git dir, in git-prompt.sh's order: `rebase-merge/` (step `msgnum`/`end`), else `rebase-apply/` (`next`/`last`; not when `applying` says it is `git am`), with the branch from `head-name` (`refs/heads/X`, else none); else `MERGE_HEAD`; else `CHERRY_PICK_HEAD`. A step shows only when both numbers read as whole numbers. 4 stats when nothing is in progress, at most 3 reads of 4 KiB during a rebase. It is read in every git mode, so an aborted merge is gone on the next render while the counts follow the refresher. Revert, bisect and `git am` show nothing.
- **Proof.** `test/unit/hud-gitstate.test.ts`: the 8 vendored rows span for span through the layer on the engine's render, through the tests' own layer (`test/hud/gitstate-oracle.ts`, written independently: it finds ⎇'s column from the state through the engine's `fromState` and `kilo`, not from the drawn spans) and through `renderPayload` with each situation's git view (a rebase as on disk: HEAD detached, `head-name` the branch); the colours, marks, fit and give-way order by hand; and the port against the tests' layer on the reference states, the time-lapse and 300 fuzz states x seeded git states x the 5 fable ids. `test/unit/git-status.test.ts`: the counter on git's output in every split, `st` read back, `readOp` on made-up git dirs. `test/git-state.test.ts`: real repos made by git (untracked files, a merge, a cherry-pick and a rebase with both backends stopped on a conflict, ahead and behind a local bare remote, a detached HEAD, a status killed at the timeout, `sync` and `off`). Three golden cases (`hud-git-merge`, `hud-git-ahead`, `hud-git-rebase`) run the whole path through dist; `hud-detached` now draws `@ddddddd`, the only existing golden that changed. The glyphs it adds, ↑ and ↓ (probed in round 8: Cascadia Mono, 1 cell, in the HUD's colour), are on `glyphs --hud`.

*The pull request and CI status (2026-10-28, v0.7.0, `src/hud/prci.ts`, `src/pr/`).* It was chosen in design round 8: the option `prci-compact` ("Compact marks") of `prci.json`, whose rows are vendored as `test/reference/round8/prci.json`. Opt-in (`hud.pr: "on"`), because it uses the network; off, every byte is the git state's.
- **What it draws.** After the git state's marks on line 4, two spaces and the branch's pull request:
  - open: `#` grey and the number white, a space, the CI mark (gold `●` running, green bold `✓` passed, red bold `×` failed; none when the PR has no checks, and then no space after a lone number), then at most one more mark, in this order of precedence: grey `◌` a draft (its `#` dark grey `#555555`, its number grey), red bold `‼` a conflict with the base branch, yellow bold `±` changes requested, green bold `✓` approved (`✓✓`: ready to merge);
  - merged: `#123` bold and ` merged` in purple; closed: `#123 closed` in dark grey;
  - no PR, no answer yet, `hud.pr` off, the network off, a detached HEAD (a rebase too), HEAD on a ref that is not a local branch, or outside a repo: nothing.
- **A layer after the engine.** `prBadge` makes the spans; `gitHud` draws them after its marks, so the git state and the badge share one fit. With nothing known of git and no badge the engine's lines come back as they are; with a badge alone, ⎇ stays the engine's grey and the branch white, as in the design.
- **Fit.** The badge is drawn whole: it is at most 19 cells (`  #999999999 merged`; numbers above 999,999,999 are not drawn). Its cells come out of the room the branch and the marks share, so the git marks give way first, in their own order, then the branch is cut from the front with `tailPath`, keeping its 10 cells: ⎇ sits at col 78 at most, so 30 cells follow it, 11 next to the widest badge. The design's long branch (`⎇ …/parser-8.6.3  #10482 ✓±`) is this rule with no marks.
- **The data.** `hungerbar refresh pr <root> <branch>` (`src/pr/refresh.ts`) runs `gh pr view --json number,state,isDraft,mergeable,reviewDecision,statusCheckRollup` in the repo's root, with no branch argument so gh finds the PR as its own `gh pr view` does (a fork's branch included), a 10 s timeout that kills the tree, stdout read up to 4 MiB, and `GH_PROMPT_DISABLED`, `GH_NO_UPDATE_NOTIFIER`, `GH_NO_EXTENSION_UPDATE_NOTIFIER`, `GH_SPINNER_DISABLED`, `NO_COLOR` and `GIT_TERMINAL_PROMPT=0`. gh is the user's own, with the user's own login: Hungerbar never reads, stores or passes a token. The binary is `HUNGERBAR_GH` (one ending in `.mjs` runs under this node, for the tests' stub), else the first `gh` in an absolute `PATH` entry, as git's is found. It runs only when HEAD is on the local branch `<branch>` both before and after gh (a checkout meanwhile drops the answer) and the repo has a GitHub remote, under `pr/<key>.lock`, never with non-essential traffic off.
- **Reading gh.** `state` MERGED, CLOSED, or OPEN (a draft when `isDraft`); `mergeable` CONFLICTING is a conflict; `reviewDecision` APPROVED or CHANGES_REQUESTED. The checks are summed as `gh pr status` sums them: a status by its `state`, a check run by its `conclusion` once COMPLETED, else its `status`; ERROR, FAILURE, CANCELLED, TIMED_OUT, ACTION_REQUIRED and STARTUP_FAILURE fail (gh puts the last with pending), SUCCESS, NEUTRAL and SKIPPED pass, anything else is still running; a failure wins, then one running, else passed. Exit 0 with such JSON is `ok`; gh's own words make `none` (no pull requests found), `auth` (exit 4, `gh auth login`, HTTP 401) and `no-github`; gh missing is `no-gh`; a timeout, unreadable JSON and any other failure are passing troubles (`timeout`, `parse`, `error`).
- **The cache.** `pr/<fnv1a(normRoot(root) + "\n" + branch)>.json`: `{"v":1,"root","branch","at","prAt","pr","why"}`, about 200 bytes, where `pr` is `{"n","state","ci","review","conflict"}` or null. `at` is when gh last answered or failed, `prAt` when `pr` was last confirmed. A passing trouble keeps the last `pr` and its `prAt` (the badge does not blink out while the network does); every other answer replaces them. An entry for another root or branch (a hash collision) or with a field out of shape reads as none.
- **Stale-while-revalidate** (`Sources.pr`, in the render, no process). With `hud.pr` on, the network on, and HEAD on a local branch (`ref: refs/heads/…`, `onBranch`): the entry is fresh for 60 s after `at`, or 10 minutes for `no-gh`, `auth` and `no-github`. A fresh entry is drawn as it is. A stale or missing one is asked again (`refresh pr <root> <branch>`, unless its lock is live) only when `<commonDir>/config` (read up to 64 KiB) has a remote `url` or `pushurl` whose host names GitHub (`github.com`, an ssh alias such as `github-work`, a GitHub Enterprise host), is a `*.ghe.com` host, or is `GH_HOST`; meanwhile its PR is drawn while `prAt` is under an hour old. Per render: 1 read of the entry, plus 1 stat, 1 read of the git config and 1 lock stat when it is stale.
- **Consent** (`hungerbar look hud --pr on`, below under *CLI*). Turning it on prints that it uses the network through the user's own gh and login, about once a minute for the branch HEAD is on, that Hungerbar never sees or stores a token, what its cache keeps (only what the badge needs: the PR's number, state, checks' result, review decision and conflict flag, under the repo's path and the branch, with when and how gh last answered; `PrEntry`), where gh is found here (or that it is not on PATH, so nothing shows), and when the network switch keeps it off.
- **Proof.** `test/unit/hud-prci.test.ts`: the 11 vendored rows span for span through the layer on the engine's render, through the tests' own badge (`test/hud/prci-oracle.ts`, `build.cjs`'s `compact` restated) on the tests' git layer, and through `renderPayload` with sources that hand each situation's PR; every form of the badge, its place after the marks, the fit next to the widest readout and badge, the glyphs and bytes by hand; and the port against the tests' layer on the reference states, the time-lapse and 200 fuzz states x seeded git states x seeded PRs x the 5 fable ids. `test/unit/pr-gh.test.ts`: the checks' sum, gh's JSON, what each run means, the entry read back and its TTLs, the remote check and `hud.pr` in the config. `test/pr.test.ts`: a stub gh (every world's `PATH` is an empty folder, so the real gh never runs) through dist and in process: the command, its root and env; the render drawing the cache, fresh, stale and an hour old; none, auth, no-github and no gh; passing troubles keeping the last PR; a hung gh killed at the timeout; and nothing asked or written offline, on another branch, after a checkout during the run, without a GitHub remote, or on a detached HEAD. `test/nonet.test.ts` traps the network around it. Two golden cases (`hud-pr`, the design's approved row on the normal day; `hud-pr-branch`, a long branch in a merge where `?1` and `↑2↓1` give way to `#10482 ✓±`) run the whole path through dist; no existing golden changed. The glyphs it adds, `●` `✓` `×` `±` `‼` `◌` (probed in round 8: Cascadia Mono, 1 cell; `✗` was left out because Windows Terminal takes it from Segoe UI Emoji), are on `glyphs --hud`.

*The player: who, away and too long (2026-10-28, v0.7.0, `src/hud/{who,bed,phantoms,player}.ts`, `src/whoami.ts`).* These were chosen in design round 8 from `identity.json` ("Who, where and when you are away") and `toolong.json` ("Session getting too long"): `user-grey` for the name, both `op-tag` and `op-name` for the operator (as `hud.op` `tag` and `gold`, the default since §0.10), `bed-blocks` for the idle bed, and `phantoms`. Their rows are vendored as `test/reference/round8/identity.json` and `toolong.json`. With `hud.user`, `hud.op`, `hud.bed` and `hud.phantoms` all off, every byte is the git state's and the PR status's; with 0.7.0's defaults (no name, the tag) a render changed only while Claude Code ran elevated, after 5 minutes without a message while no tool runs, or in a long session. Since §0.10 the default name is on line 3 in every render.
- **The name (`hud.user`).** Line 3's folder, the engine's one grey span `⌂ ` + the path, becomes `⌂ steve: D:/webapp` (`user`) or `⌂ steve@DESKTOP: D:/webapp` (`user@host`), all in the folder's grey `#AAAAAA`, like a Minecraft chat line.
- **The operator (`hud.op`).** Only while Claude Code runs elevated. `tag`: a bold red `#FF5555` `[OP]` and a space before the name, or after ⌂ with the name off (`⌂ [OP] D:/webapp`). `gold`: the name in bold gold `#FFAA00`, or the ⌂ in gold (not bold) with the name off. `off`: nothing.
- **Who and elevated** (`src/whoami.ts`, each read only when an option draws it: the elevation check with `hud.op` on, the user with `hud.user` on, the host with `user@host` and a user). The user is `os.userInfo().username`, else `USERNAME`, `USER` or `LOGNAME`; the host is `os.hostname()` up to its first `.`, as a shell prompt's `\h` shows it. Both are cleaned by the engine's `tidy` (no escapes or controls, trimmed) and capped, the user at 32 code points and the host at 63, with `…`; an empty name draws nothing. Elevated, on Windows: this process may open `%SystemRoot%\System32\config\systemprofile` (`opendirSync` and close, about 0.2 ms), the LocalSystem profile whose ACL lets in only SYSTEM and Administrators, so a filtered administrator's token under UAC (Administrators deny-only) gets EPERM and an elevated one opens it; the status line is Claude Code's child, so it has its token. Elsewhere, `euid` 0. Measured on Windows 10 (2026-10-28, an administrator account under UAC, Medium integrity): `false` with EPERM, as the folder's `icacls` is denied too. The elevated answer was not run there, since an elevated token takes a UAC prompt. The unit test points `SystemRoot` at a temp folder for both answers.
- **The idle bed (`hud.bed`).** When the last message is 300 s old or more, hotbar slot 4 (cols 32-35 of the hotbar line, an empty well in the picked mix) holds a bed seen from the side: U+1FB84 (upper five eighths, the mattress, which Windows Terminal draws itself) in white `#E9ECEC` on oak `#9C7F4E` (the pillow on its leg), twice in red `#B02E26` on the well `#201E07`, then red on oak (the foot). It is drawn only over four plain well cells (spaces on `#201E07`, no ink or bold), never while Claude works (`away`, below), and goes with the next message.
- **The last message** (`lastMessage`). The newest of the transcript summary's `lastAt` (not while the summary is a stale one waiting on the worker) and the prompt cache's last write, stdin's `expires_at` less its TTL (3600 s for `1h`, else 300 s). The TTL never decides: a 1-hour cache that is still warm says only when the last request was, so it does not hold the bed back. With neither known there is no bed.
- **Not while Claude works** (`working`, 2026-10-28). A turn in progress is activity: while the transcript's summary (not a stale one) says `running`, a main-chain tool call without its result, there is no bed, however old the last message. A long build or test run, a subagent through the Agent tool or a blocking TaskOutput writes no main-chain message for minutes (in 184 real main transcripts, 133 tool calls of 5 minutes or more with no other message meanwhile: Bash 67, Agent 48, PowerShell 14, TaskOutput 4), and the status line re-renders every `refreshInterval` during them. A tool's result is a message, so the 5 minutes start again when it lands. A call that waits on the person (AskUserQuestion, ExitPlanMode) is the session waiting, as at the end of a turn, so the bed comes. Two waits it cannot see: a permission prompt (Claude Code writes nothing while one waits, so the call reads as running and there is no bed), and a reply that takes 5 minutes to start after a prompt or a result with no row written meanwhile (the bed shows until that reply).
- **The phantoms (`hud.phantoms`).** Four signs: 100 or more prompts (the book's count), a session of 4 hours or more, 2 or more compactions, context at 70% or more. One sign: one small, dim phantom far away, U+1FB08 U+1FB05 in `#3B4673` at cols 33-34 of line 1. Two or more: that many big ones, three cells each, wings `#5468B0` and eyes `#7DFF5A`, flying high (U+1FB08 U+1FB0B U+1FB05) or swooping low (U+1FB22 U+1FB2D U+1FB16): 2 at cols 30 (high) and 35 (low), 3 at 26, 31, 36 (high, low, high), 4 at 24, 28, 32, 36. Line 1 is the fourth line from the bottom (under the boss bar when it is drawn). A phantom flies only where its cells and the cell before it are empty sky, an unstyled space or past the line's end (which it pads with spaces), so a long item name keeps its room. A fresh session, and `/clear`, has a clear sky.
- **The session's age** (`sessionSecs`). Stdin's `cost.total_duration_ms`, whole seconds, else now less the history file's `sessionStart` (never below 0), else unknown, which is no sign. Outside a repo, or with no session key, there is no history, so only stdin can say.
- **Layers after the engine.** `playerHud` runs `whoHud` (line 3, the second last engine line), `bedHud` (the hotbar line) and `phantomHud` (line 1); each reads only what the engine drew and draws only in its own cells, so their order does not matter. The HUD path runs them on the git state's lines, before the frame and the centring; the port and the oracle test are untouched.
- **Fit.** Line 3 stays within 110 cells. The path is cut from the front with the engine's `tailPath`, as the engine cuts it, but keeps at least 10 cells (all of a shorter path); until it can, `@host` gives way, then the name, then the `[OP]` tag. With all three gone the span is the engine's own (gold still colours the ⌂: it takes no room). On the normal day ⌂ sits at col 67, so 41 cells follow `⌂ ` and `⌂ [OP] steve@DESKTOP-ABC1234: …/folder` fits a long folder. The bed and the phantoms change no width but the padding past line 1's end, which stays inside the sky (col 41 at most).
- **Proof.** `test/unit/hud-player.test.ts`: the 12 vendored rows (user-grey's 3, op-tag's 2, op-name's 2, bed-blocks' 2 and phantoms' 3) span for span through the layers on the engine's render, through the tests' own layers (`test/hud/player-oracle.ts`, written independently: it finds line 3's folder from the state through the engine's own `f2Line3`, and works cluster by cluster) and through `renderPayload` with sources that hand each situation its names, elevation, counts, prompt cache and session age; every look, the fit and the give-way order, the slot and the sky by hand; `lastMessage`, `working`, `away` and `sessionSecs`; the bed from disk through `renderPayload` (no bed during a Bash call 390 s on or a subagent 360 s on with only its sidechain and progress rows since, the bed once the turn is over and after an AskUserQuestion, gone with the next prompt); which WhoSource parts each option asks for; the bytes against `test/hud/sgr-oracle.ts`; and the layers against the tests' layers on the reference states, the time-lapse and 300 fuzz states x seeded marks x the 5 fable ids. `test/unit/whoami.test.ts` holds the names, the caps, the dot cut and both elevation answers; `test/transcript.test.ts` `lastAt` and the open calls (parallel calls, duplicated rows, results read off the line and parsed, sidechain and progress rows, the waiting tools, a new message, a typed prompt, `turn_duration`, the cap, a state written before, the scrubbed real slice's four calls, and the render and the worker through the disk); `test/hud.history.test.ts` `sessionStart` (the 661-frame replay now equals each frame's own `sessionStart` too). Four golden cases run the whole path through dist: `hud-who` (user@host and the tag, elevated through the hooks, a long folder), `hud-who-gold`, `hud-idle` (a warm 1-hour cache written 10 minutes ago) and `hud-phantoms` (all four signs). Three existing goldens changed, each by its own situation: `hud-tight` and `hud-boss-low` (context 71% and 2 compactions: two phantoms; a 5m cache that went cold 6 minutes after its last write: the bed) and `hud-wide-label` (a full context: one far phantom). Six cases whose history file the render creates now pin `hist.sessionStart` as `{{NOW}}`. The tight demo (`preview`) draws its two phantoms and the bed as well. The glyphs they add, U+1FB84 and the six sextants (probed in round 8: Windows Terminal draws them itself, 1 cell, in both icon styles), are on `glyphs --hud`.

*CLI* (amends §13).
- **`hungerbar look [classic|hud] [--fable …] [--align left|center] [--pr on|off] [--user off|user|user@host] [--op off|tag|gold] [--bed on|off] [--phantoms on|off] [--print]`.** With no argument it prints the look, `hud.fable`, `minWidth`, `hud.align`, this terminal's gate verdict with its reason, for a HUD or a centred config where it sits here (`alignNote`: how far it moves at most, or why it stays at the left edge), the usage API and `scopedWeekly` state, the PR status here (`prSummary`: off, on with the gh it found, or on but off here for want of gh or for the network switch), and (0.7.0) the player's options here: what line 3 reads with this machine's names (`userSummary`: `hud.user user: line 3 reads "⌂ steve: <folder>" here`, or that no name is found), the operator's mark and whether this terminal runs elevated (`opSummary`, also while `hud.op` is off: `hud.op off: no operator's mark; this terminal does not run as Administrator`), and the bed and the phantoms (`idleSummary`); then the switch lines, the player's flags on a line of their own. Otherwise it edits only `hungerbar.json`; any HUD option (`--fable`, `--align`, `--pr`, `--user`, `--op`, `--bed`, `--phantoms`) with classic is an error, each flag takes only its own values (a bare one is an error too), and `centre` is read as `center`. After a change it names the way back: `hungerbar look hud` after classic (which keeps every `hud` key), `hungerbar look classic` after the HUD when the look was classic, and on a HUD that stays the HUD `hungerbar look hud` with the values it had for each of `--fable`, `--align`, `--pr`, `--user`, `--op`, `--bed` and `--phantoms` that changed (in that order; since §0.10 a file with no `look` key is the HUD, so `look hud --fable boss` there no longer names classic). When the change turned `network.usageApi` on, a line says that setting it to false in `hungerbar.json` turns it off again and that `--fable off` leaves it on (the same for `network.scopedWeekly` alone); a change that only turned those keys on names no look command; `--align` also says where the HUD sits in this terminal, and when `HUNGERBAR_HUD_ALIGN` wins over the file; `--user` says what line 3 reads here and (unless `hud.op` is off) the operator's line, `--op` the operator's line, and `--bed` or `--phantoms` the idle line (`playerNotes`). `alignNote` follows the gate's verdict printed above it: where classic draws (a budget below `hud.minWidth`, no colour, 16 colours, ASCII mode or an invalid file) it says nothing moves and why; with look classic it says nothing moves and where the HUD would sit here, or that it would not draw here either; one column is `1 column`.
- **The writer** is shared with setup. It reads strict JSON (a BOM is accepted) and refuses invalid JSON, or a file that is not UTF-8, with the by-hand steps, before writing anything. It backs up to `hungerbar.json.bak.<stamp>` and merges only `look`, `hud.fable`, `hud.align`, the 0.7.0 keys `hud.pr`, `hud.user`, `hud.op`, `hud.bed` and `hud.phantoms`, and, for a Fable option, `network.usageApi` and `network.scopedWeekly` (or, for a no to setup's usage API question, the key it asked about as `false`), keeping every other key and its order; a `hud` key the file does not have goes last, in the order fable, align, pr, user, op, bed, phantoms. It writes 2-space UTF-8 without a BOM, keeping CRLF. It creates a missing file with its `$schema`, follows a symlink, and changes nothing when the merge gives the same object. `look hud` leaves a file with no `look` key alone, `--fable boss` one with no `hud.fable` (but writes the network keys boss needs), `--align center` one with no `hud.align`, `--pr off` one with no `hud.pr`, `--user user` one with no `hud.user`, `--op gold` one with no `hud.op`, and `--bed on` and `--phantoms on` one with neither: a default (§0.10's; classic, off, left, off, off and tag before it) is written only over a different value, an unknown one included, or for a key setup's consent question answered into a file that does not have it (§0.10). `settings.json` is never touched. Since 1.2.0 `hungerbar totem` writes the top-level `totems` key with the same discipline (§0.13).
- **Consent.** Every Fable option but off prints, before anything is written, that it turns on the opt-in usage API: the token file it reads (`CLAUDE_CONFIG_DIR` aware, plus the Keychain on macOS), the endpoint, about every 3 minutes, and that the token is never stored or sent anywhere else. It also says when `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or `HUNGERBAR_OFFLINE` keeps the API off. `--pr on` over a file where it is not on prints the PR status's consent (*The pull request and CI status*, above) the same way. setup prints each of the two before its own yes-or-no question (§0.10).
- **`hungerbar setup`.** `--look classic|hud`, `--fable …`, `--align left|center` and (0.7.0) `--pr`, `--user`, `--op`, `--bed` and `--phantoms` are checked before any write, as `look` checks them; a HUD option without `--look hud`, and an invalid `hungerbar.json`, are refused. A `settings.json` that cannot be read as a JSON object is refused next, in one line and before any question, with nothing written.
  - On a TTY (or with the test hook `HUNGERBAR_SETUP_TTY=1` and piped answers) with no `--look`, it asks numbered questions, each option shown with an in-memory preview: the look, then, for the HUD, the Fable option (each with its name, the first sentence of its note that no other option's note has, a preview on the `fable` demo, and its weekly line on Opus), then where it sits (0.6.0): left, or centre with the normal day centred in this window (`HUNGERBAR_WIDTH`, else the terminal's columns, else `COLUMNS`, else 120). tail, tooltip and boss share their opening sentence, so each shows what it does while Fable is in use.
  - Then (0.7.0) the player: `Name [n]:` (1 no name, 2 your user name, 3 user@host), each with the normal day's line 3 as this machine's names draw it; `Operator [n]:` (1 a red [OP] before your name, 2 your name turns gold, 3 nothing; with no name the labels say the ⌂ carries the mark), each with line 3 drawn as if Claude Code ran elevated, after a sentence that says whether this terminal does (`as Administrator` on Windows, `as root` elsewhere); and only when gh is found (`HUNGERBAR_GH` or PATH), `Show the pull request status? [Y/n]` (§0.10; `Pull request [n]:` with 1 off, 2 on before), with the tight day's line 4 and its badge `#128 ✓✓`, a legend of the marks and the consent text, all before the answer. Every preview in the prompt draws with this machine's WhoSource (`whoAmI`), so a name or mark in `hungerbar.json` shows in the look's and the Fable options' previews too. Answers: the number or the value (`user@host`, `gold`); `y`, `yes` or `on` and `n`, `no` or `off` for the two yes-or-no questions.
  - Enter keeps what `hungerbar.json` already has, marked `(current)` and shown in the `Look [n]:`, `Fable [n]:`, `Align [n]:`, `Name [n]:` and `Operator [n]:` prompts; with no file it takes the defaults (§0.10): the HUD, boss, centre, the user name and gold, marked `(default)`. The two yes-or-no questions pre-select by their own key (§0.10). Re-running setup over a config and pressing Enter therefore changes nothing (unless its Fable option lacks the usage API, or gh is found and it has no `hud.pr`: see §0.10): a default is not written into a file that has none; `look: …, unchanged` lists every option the answers gave. The PR status is not asked without gh, and then stays as the file has it. The usage API's consent and question come right after the Fable answer (§0.10). A bad answer is asked again. EOF or Ctrl+C cancels with nothing written, also when the input ends without a final newline. With an unreadable `hungerbar.json` the questions are skipped with a one-line note (why, that the file is left alone, and `hungerbar look hud` for once it is fixed), and the statusLine is still set up.
  - When it asks no questions (no TTY, or flags) it prints one hint line: with the HUD, what of it uses the network and still waits for a yes, with the command that turns it on (§0.10); with classic and no `--look`, `Minecraft HUD: hungerbar look hud [--fable boss] [--pr on]`. `--print` shows both diffs and never asks. `--restore` takes only `--print`, and also says that the look stays hud, with `hungerbar look classic`, when the look is hud.
- **Unknown options.** `look`, `setup`, `preview` and `icons` refuse an unknown option (a typo such as `--pritn` or `--fabel`), a value on an option that takes none (`--print=1`) and, for `setup` and `preview`, a stray argument, with exit 1 before anything is read for writing. Until 0.4.0 they were ignored.
- **Other commands.**
  - `preview` takes `--look`, `--fable`, `--align` and (0.7.0) `--pr`, `--user`, `--op`, `--bed` and `--phantoms` (any HUD option alone means the HUD), `--width N` (the window's columns, as `HUNGERBAR_WIDTH`; `--cols` is its older name, and a value that is not a whole number of columns, or both together, is refused) and the `fable` situation (Fable 5.1 in use), and since 1.1.0 the `agents` situation (the normal day with three agents at work, §0.12). The demos (0.7.0) carry a git state: every repo day has changed files (its diff), so ⎇ is yellow; the tight day also has a new file and two commits to push (`⎇ feature/cache ?1 ↑2`) and, with `hud.pr` on, PR #128 with its checks passed and approved (`#128 ✓✓`, no gh: the demo's own); the extra day has one commit to pull (`⎇ main ↓1`); the normal day has no marks, so its text is the README's. Their line 3 draws this machine's names as `hud.user` asks, and the operator's mark only when this terminal runs elevated, except that `--op tag|gold` draws it as if it did. `--payload` renders from disk, as the status line would. Only `--fable` (not off) turns on the usage API in memory, so the option shows as it does once on; without it the usage API stays as `hungerbar.json` has it, so `preview --align center` draws what the status line draws with the default boss and the API off (§0.10). The terminal demo (`hungerbar` on a TTY) draws the names the same way.
  - `doctor` has a Look section: the look with `hud.align`, the verdict here with its depth, ASCII and budget, where the HUD sits here (nothing moves where classic draws), the usage API and `scopedWeekly`, `usage.json`'s scoped entries, the number of history files, and (0.7.0) where the git state comes from (`git.mode`; with `off` it says ⎇ stays grey with no counts or arrows, while a merge, rebase or cherry-pick in progress and a detached HEAD still show, since `readOp` and the HEAD are read from .git in every mode), the PR status here (a warning while it is on but gh is missing or the network is off) with the number of PR answers cached, what line 3 reads here, the operator's mark with whether this terminal runs elevated, and the bed and the phantoms. Next to `COLUMNS` it warns when `widthReserve` is below twice `statusLine.padding` (§7.4).
  - `glyphs --hud` is a width ruler for every glyph the HUD draws. Its census for 0.7.0 (`test/look.test.ts`): over every git state, every PR, the player's looks and 0-4 phantoms on the demos, the layers add exactly ↑ ↓ ● ✓ × ± ‼ ◌, U+1FB84 and the six sextants (and … where a branch is cut), each listed and 1 cell.
- **Upgrading a config** (pinned by `test/setup.test.ts`). Since §0.10 `look` and setup write only what is not a default. Over a 0.4.0 file `{"$schema": …, "network": {"usageApi": true}}`, `hungerbar look hud --fable boss` adds only `"scopedWeekly": true`, with a backup and the usage API's consent; `hungerbar look classic` (or `HUNGERBAR_LOOK=classic`) goes back. Over a 0.6.0 file with `"look": "hud"` and `"hud": {"fable": "boss", "align": "center"}`, setup's questions (Enter for each, then y for the PR status where gh is found) and `hungerbar look hud --user user --op gold --pr on` both add only `"pr": "on"`, the same bytes, with a backup and the PR status's consent. Back with `hungerbar look hud --pr off`.

*Proof.*
- **`test/hud.reference.test.ts`** pins the oracle. Each vendored file matches its sha256 in `SOURCES.json`. `hud4.js` reproduces the frozen hashes of 120 spec renders: the 25 round-6 git-terrain inputs (line 4) and the 19 round-7 situations × the 5 fable ids. The shipped ids exist, the plain icon style equals the colour one, and the vendored `cacheStep` turns frames 86, 259, 519 and 576 of the 661-frame time-lapse gold.
- **`test/hud.oracle.test.ts`.**
  - Function level: `cellWidth` on every code point 0..0x10FFFF and a cluster set, and every text, Python, number, span, input, mix and fable helper on the design sweep's domains, hostile atoms and seeded fuzz, compared as values (key order and presence, `-0`, `NaN`, thrown errors).
  - Render level: for each of the 5 ids, `renderHud` equals `MIX.render` as spans, tuples and SGR bytes at 24-bit and 256 colours (the port's through the shipped `encode`, the oracle's through the independent `test/hud/sgr-oracle.ts`). The inputs are the reference states × the round-6 histories, the spec inputs, states that are no object, all 661 frames as they are and with Fable 5.1 in use, every domain and history field one at a time, every scoped value under Opus, Fable 5.1 and another model, and 600 seeded fuzz states (`HUD_ORACLE_N` raises it). A difference is shrunk to the fields that cause it.
  - The glyph census: every non-ASCII code point the port draws that is not user text is one of the 45 glyphs probed in rounds 4-7, which protects the plain icon style. The frame's own census is in its test: it adds only U+2582 and U+1FB82 (both probed) and U+2800.
- **Coverage.** `npm run test:hud-coverage`: 100% lines, branches and functions on the 7 port modules, with one `node:coverage ignore` (an unreachable `histBranch` branch), listed in the oracle test. Since 0.5.1 it also covers `frame.ts`, under its unit test, since 0.6.0 `align.ts`, since 0.7.0 `gitstate.ts`, `prci.ts` and the player's `who.ts`, `bed.ts`, `phantoms.ts` and `player.ts`, and since 1.1.0 the vitals' `vitals.ts`, the offhand's `offhand.ts`, the agents' `agents.ts` and the tiers' `tiers.ts` (§0.12), each under its own. `src/shown.ts` (§0.12), outside the gate, is at 100% under `test/shown.test.ts` alone.
- **The long run**, once per release: `HUD_ORACLE_N=200000 node --test test/hud.oracle.test.ts` passed 20 of 20 tests for 1.2.0 (2026-11-03, at 72abb84, the last build commit) in 1,493 s, for 1.1.0 (2026-11-02, at 1b63ec4) in 1,337 s, and for 1.0 (2026-10-27, after the fable port) in 5,187 s (timings are noise). That is at least 200,000 generated inputs per function (100,000 span lists), 50,000 fuzz states each for the mix and the fable functions, and 200,000 fuzz states × 5 ids = 1,000,000 port/oracle render pairs. The port modules have not changed since; the shipped writer joined the render-level check afterwards and is checked on every normal run.
- **`test/hud.history.test.ts`.**
  - The 661 frames replayed through `stepHistory` with a simulated `logs/HEAD` equal each frame's own history and `cacheStep`.
  - Every deviation is a case that asserts both answers.
  - Real git: the gold cases, the no-gold cases, a linked worktree, `pack-refs`, and a repo switch to a 400-commit repo with its reads counted (at most 64 KiB + 4 KiB). After each, the reader's lines equal `git reflog`.
  - No process starts, and the write policy and prune hold.
- **`test/hud.e2e.test.ts`.**
  - (a) Each demo hands the engine its reference state, field by field.
  - (b) dist's bytes equal the independent encoder on the oracle's render with the tests' git state (each demo's, restated in the test), player's layers, vitals (1.1.0: the extra day's poison), offhand (1.1.0), totem (1.2.0: the demos' one limit reset waits in slot 5, is in the tight day's offhand and calls on the extra day; the fresh day holds none), agents (1.1.0: the agents day's three bees), tiers (1.1.0: Opus's diamond numeral, Fable's netherite) and frame (`test/hud/frame-oracle.ts`, with the offhand's side colour), for 6 situations × 5 ids at `FORCE_COLOR=3` and `2`, and with `--pr on` the tight day's badge too.
  - (c) 69 golden cases (`test/fixtures/cases/hud-*.json`, 465 files in `test/golden/`) each pin the engine state the render hands over, the git state's input when anything is known (`hudGit`), the PR when there is one (`hudPr`), the player's layers' input when they draw (`hudPlayer`, 0.7.0), the vitals' when they draw (`hudVitals`, 1.1.0), the offhand's when there is one (`hudOffhand`, 1.1.0), the totem's when it draws (`hudTotem`, 1.2.0; `state.shown` seeds a version-2 shown-file), the agents' when any is at work (`hudAgents`, 1.1.0; `state.agents` seeds agent files and takes the worker's look) and the tiers' where the case names them (`hudTiers`, 1.1.0; else the tests' own reading of the model). dist draws each as the oracle with the tests' git state, PR badge, player's layers, vitals, offhand, totem, agents, tiers and frame (5 lines, 6 with the boss bar, the last one 62 cells), and their fallback modes are classic byte for byte. In process, each case with `hud.user`, `hud.op`, `hud.bed`, `hud.phantoms`, `hud.ultra`, `hud.poison`, `hud.totem` and `hud.agents` all off and `hud.pickaxe` plain draws the oracle with the git state, the badge, the stale marks and the offhand's keyless fixes (§0.12: they have no key) and the frame alone.
  - (d) The README samples equal the oracle with the demo's limit reset as the totem in slot 5 (1.2.0), framed, and the centred one is that moved 19 cells (a 120-column window).
  - (e) This SPEC says what ships: the *Output* list is whole and the frame's section holds only its own bullets; the sentence on the gutter's backgrounds matches the goldens; and the *Bundle* size below is this version's `dist/hungerbar.mjs`, byte for byte.
  - The history write comes after stdout, a HUD render in a repo starts no process, and an invalid config gives classic with `cfg!`.
  - (f) Every hud-* case in a colour mode with a known width: left draws its bytes of an unknown width, center those bytes moved by the tests' offset, and `HUNGERBAR_HUD_ALIGN` wins over the file both ways.
  - Golden modes: `ansi`, `nocolor`, `ascii` and `w60` (each pins the fallback), `w60c` (the width fallback in colour), `w100c` (a 100-column terminal keeps the HUD), and `w84c`, `w120c`, `w121c` and `w200c` (the centring's budgets 80, 116, 117 and 196).

*Deviations from the design engine's spec text,* each pinned by its own test:
1. A `commit (merge):` reflog line is no commit, so a merge concluded after a conflict draws like a clean merge (round-6 issue 3).
2. **The window rule.** Only the bytes appended to `logs/HEAD` since the last render on the same branch are read, at most 64 KiB. A shrunk log, a bigger append, a window that does not continue from the saved line, a branch change and a repo switch see no commit (round-6 issues 1 and 2, and the unbounded read). Inside the window, the rule is the spec's step 2: the newest entry that set HEAD to the cached head, the entries after it, and H ≠ the cached head. A commit made in the repo from another terminal while this session rendered elsewhere turns the current quarter gold when it comes back.
3. An unborn repo's first commit is seen, through the empty-log anchor (round-6 issue 5).
4. **The turn rule.** Interrupt markers and Claude Code's own command, notification and scheduled rows are not prompts. A row with no origin counts only in a transcript that has shown no origin (legacy) and when its `turnOrigin` is absent or human. Prompts sent mid-turn count through their `queued_command` attachment.

*What Claude Code passes* (a hidden spike, 2026-10-27, Claude Code 2.1.311).
- **Env.** `COLUMNS` and `LINES` come from Claude Code's own stdout, the full width, not reduced by `padding`, so the minWidth gate is live. `TERM=xterm-256color` is added, `FORCE_COLOR` and `COLORTERM` are not set, and `WT_SESSION` passes through, which gives 24-bit colour in Windows Terminal (256 without it).
- **Stdin.** `cost.total_cost_usd` is a number (0 before any prompt). `rate_limits` has no scoped entries, so Fable comes from `usage.json`. The transcript file does not exist before the first prompt, so the counts are 0/0.
- **Padding** (hidden ConPTY runs of Claude Code 2.1.312, 2026-10-28, the screen parsed from the VT capture). Claude Code draws the status line after its own 2-cell margin and applies `padding` p on both sides: every row starts at cell 2 + p, and a line longer than COLUMNS - 4 - 2p cells is cut to that width, ending in `…`. At COLUMNS 120 with padding 3 and `widthReserve` 3 (B 113, a centred HUD's offset 3) the 113-cell line 3 was drawn over cells 5-114, 110 cells, so 3 were lost; with padding 4 and no reserve (B 116) a 116-cell line was drawn over cells 6-113 and lost 8 (2p); with padding 0 at COLUMNS 131 a 127-cell line (B) was drawn whole over cells 2-128. The area is therefore centred in the window, and B is its width exactly when `widthReserve` is 2p (§7.4).
- **Not seen on screen yet:** background cells (NBSP ones too), the trailing background cell of line 4 outside a repo, the 6-line case, Ⅲ, 🮂, the frame as 0.5.1 draws it, and a centred HUD by eye (the margin is settled under **Padding**). They wait for a look on a real screen; the rollback is one command.

*Measured* (2026-10-27; timings are noise, so none is asserted).
- **Bundle.** `dist/hungerbar.mjs` is 284,695 bytes at 1.2.0, with the unreleased 1.2.1 fix (§5's *No 5-hour window*), its totems data and command, its totem on the HUD and the classic resets item, and with the git state, the PR status, the player's layers, their CLI, §0.10's defaults, §0.11's boss bar without its name, 1.1.0's fixes for macOS and Linux, its freshness and data rules and §0.12's vitals, offhand, agents and pickaxe tiers. The 0.6.0 that shipped (4f4e2d8, the last 0.6.0 commit) was 182,607, so the git state (7,699 bytes, at 7de75ba), the PR status (12,491 bytes, at f09d0fb), the player's layers (8,228 bytes, at e0bbc2c) and their CLI (the new options of look, setup, preview and doctor, the demos' git state and doctor's wider leftover check: 7,544 bytes) and the fixes after review (the open tool calls that keep the bed away while Claude works, and doctor's note for git.mode off: 2,146 bytes) and the new defaults, with setup's two questions for what uses the network (§0.10: 1,273 bytes), and the fixes after the publish review (look's way back after a Fable change, the two questions pre-selected by their own keys, the PR status's fuller consent text and mirror's wider copy: 1,659 bytes) and the fixes after the second publish review (the setup prompt's wording for no Fable, and the network hint after flags and without a pending yes: 866 bytes) and setup's no to the usage API saved as false (519 bytes) and the boss bar without its name (§0.11: 496 bytes) and the fix after the final publish review (setup's note for an unreadable `hungerbar.json` without a terminal: 197 bytes) and the fixes after the last publish review (a UTF-8 BOM on piped stdin, and the consent text naming the login token's variable: 164 bytes) and 1.1.0's fix after the first CI run (doctor's process list through `[wmisearcher]`, which loads no module, and a warn instead of an ok when the list cannot be read: 580 bytes) and 1.1.0's fixes for macOS and Linux (a folder name over 255 bytes, a timed-out child's whole process group, drive-less and non-executable PATH entries, read-only files refused and modes kept, doctor's process list from /proc or ps, a ' in the POSIX command, and the platform as a parameter of the consent text and the token's Keychain read: 2,853 bytes) and 1.1.0's freshness and data rules (a live window refilled at its reset, an account with no 5-hour window and its saved flag, the newer limits kept, the hungry usage TTL and its consent wording, `refresh usage` for people with its one line, the usage capture and the extra credits' fetch time: 3,986 bytes) and §0.12's vitals (the hearts line's Ultra, stale and poison looks, their two keys and their flags: 5,282 bytes) and §0.12's offhand (the totem with its shown-file, the count from $100, the stale count, the credits-out sides, `hud.totem` and its flag: 7,174 bytes) and §0.12's agents and pickaxe tiers (the transcript's Ultracode signal, agent calls and the worker's look at the subagents folder, the bees and the allays, the tiers, `hud.agents` and `hud.pickaxe`, their flags, setup's question and the agents demo: 10,532 bytes) and 1.2.0's totems data and command (the `totems` key and its strict reading, `hungerbar totem` with its writer and `limits.json`'s forget, and the totem's lines in look, doctor and setup, the setup line cut to fit 120 columns at the release: 21,551 bytes) and 1.2.0's totem on the HUD (`src/hud/totem.ts` with round 10's golden idol, the shown-file's version 2, the emerald's move to slot 5 and the demos' resets, less 1.1.0's credits totem: 3,072 bytes) and 1.2.0's classic `resets` item (its words, its colours by the windows, `State.totems` and its place first in the drop order: 1,274 bytes) and the unreleased 1.2.1 fix (a 5-hour window Claude Code dropped at its reset drawn refilled, the Ultra plan only on the usage API's null, the flag with its fiveHourNoneAt or a reply asked for after the reset, the transcript's askedAt, usage.json's fiveHourNone, doctor's check of the flag and the capture's scratchpad_dir: 2,502 bytes) added 102,088 bytes; 0.6.0 was 181,306 when it was cut (6b77019), before the reviews of the centring, and 0.4.0 was 89,168 (bd5a52a), before the HUD. 0.5.0 was 173,203 as shipped (7aaebbb) and 170,603 as cut (52c65ec). The timings below were taken at 52c65ec.
- **Bench.** `npm run bench -- --no-ccs`, 15 interleaved rounds, medians:
  - Git Bash floor 79.3 ms, bare node 137.3 ms;
  - Hungerbar direct with a cache hit 160.7 ms (+23.3 over node), launcher 186.0 ms, stale render 170.8 ms;
  - the HUD row 177.1 ms (look hud, fable boss, a seeded history, the scrubbed 313 KB transcript, this repo as cwd), and classic on the same input and caches 178.2 ms;
  - in-process work: classic 8.5 ms, classic on the HUD's input 10.7 ms, the HUD 19.4 ms (+8.7 ms).
- **Killstorm.** `npm run killstorm -- --hud`: 500 spawns each with the launcher, direct and the HUD (325 of them killed mid-run, Opus and Fable by turns, a 6.6 MiB transcript under a new session every 10 spawns). It left no hungerbar node.exe (`refresh transcript` workers included), cmd.exe or git.exe, after 3 s. All 50 history files and 50 transcript states parsed, all 50 transcripts were caught up by their workers, and no `.tmp` or `.lock` file was left.

**0.10 The defaults (2026-10-28, still 1.0.0, before its first publication).** With no `hungerbar.json`, a fresh install draws the setup picked through the design rounds: `look` hud, `hud.fable` boss, `hud.align` center, `hud.user` user, `hud.op` gold, `hud.bed` and `hud.phantoms` on (`defaults()` in `src/config.ts`, and `schema.json`). The colour icon style is already Windows Terminal's default (§0.7), so nothing changes there. One safety rule comes with it: what uses the network never switches on by itself.
- **The network stays off until the user says yes.** `network.usageApi` and `network.scopedWeekly` (the usage API, which reads the user's Claude login and which every Fable option needs) and `hud.pr` (the PR status, through the user's own gh) still default to off. So the default boss bar draws nothing until both network keys are on; `hungerbar look` notes it and `doctor` warns (`fableWarning`). Only an explicit answer or flag turns them on: setup's questions, `hungerbar look hud --fable <option>`, `--pr on`, or the file. No `hungerbar.json`, an invalid one (`cfg!`) and a setup without a terminal or flags leave all three off. A commit before publication turned the three on by default; it was reverted the same day, since a fresh install would then have read the user's Claude login and run gh without asking. The defaults stay the author's setup, but what uses the network is pre-selected in setup's questions, never on by itself.
- **setup's questions** pre-select these defaults, so Enter accepts each: `Look [2]`, `Fable [3]`, `Align [2]`, `Name [2]` and `Operator [2]`, marked `(default)` when there is no `hungerbar.json`; with one, Enter keeps what it has, marked `(current)`, as before. Right after a Fable answer that is not off, unless the file already has both network keys on, setup prints the usage API's consent text (the token file it reads, the endpoint, about every 3 minutes, that the token is never stored or sent anywhere else, and the network switch when it is set), then asks `Turn on the usage API? [Y/n]`; when the file has the usage API on already and only `scopedWeekly` off, the consent says so and the question is `Turn on Fable's weekly (network.scopedWeekly)? [Y/n]`. No makes the option off (`hud.fable off`), writes the key it asked about as `false` (`LookChoice.network`; never `true`, which only a Fable option writes) and says so, with how to turn it on later (for `scopedWeekly`, also that the usage API stays on). Then, only where gh is found, the PR status's consent text and `Show the pull request status? [Y/n]`. Each of the two questions pre-selects by its own key, not by whether a file exists (fix after the publish review): yes while `hungerbar.json` does not have the key it asks about (`network.usageApi`, or `network.scopedWeekly` for the second wording, and `hud.pr`), else what the file has (`[y/N]` while it is off). So a file that setup wrote without a terminal (`{"$schema": …}` alone, as when Claude Code runs the README's install line) still gets the full setup from Enter. The PR answer is written even at its default (`LookChoice.answered`): a no over a file with no `hud.pr` writes `"pr": "off"`, so the next setup pre-selects no; a no to the usage API does the same through its `false`, so a later Fable option's question pre-selects no too. With gh found, Enter for every question on a first install writes `{"$schema": …, "network": {"usageApi": true, "scopedWeekly": true}, "hud": {"pr": "on"}}`, whose `merge` equals the full setup's: every other answer is a default, which the writer does not write.
- **The writer** keeps its rule against the new defaults: a default is written only over a different value. So `look classic` now writes `"look": "classic"`, and `look hud` leaves a file with no `look` key alone; likewise boss, center, user and gold. A Fable option but off still turns both network keys on, the default boss included, because a choice that names it is the user's yes. A no to setup's usage API question writes its key as `false`, next to the file's other `network` keys.
- **No terminal, no flags:** setup asks nothing and writes no look (a missing file gets only its `$schema`). With the HUD on it prints what of it uses the network and still waits for a yes, and the command that turns it on (`networkHint`), for example `Fable's weekly limit and the pull request status use the network, so they stay off until you turn them on: hungerbar look hud --fable boss --pr on`; with classic it prints `Minecraft HUD: hungerbar look hud [--fable boss] [--pr on]`. Setup with flags asks nothing either, so it prints the same network hint for the HUD it leaves (fix after the second publish review), without a key a flag named. A no already given is not waiting (fix after the second publish review): Fable is left out when `hungerbar.json` sets `network.usageApi` or `network.scopedWeekly` to false, and the PR status when it sets `hud.pr`. The PR status is named only where gh is found, as setup asks about it only there. With no look named and a `hungerbar.json` that cannot be read (also under `--print`), setup prints the questions' one-line note in place of either hint, without the skipped question: why, that the file is left alone, and `hungerbar look hud` for once it is fixed. `hungerbar look` would refuse the hint's command over that file (fix after the final publish review). `hungerbar look` changes only what its flags name, as before.
- **`hud.fable`:** an absent value is boss; a value that is not an option is still off (`hud-fable-unknown`). For the other keys any value that is not listed is the default: center, user and gold now.
- **`preview`** turns the usage API on in memory only for an explicit `--fable` (not off). Before, any HUD flag did it for the file's Fable option, which with the default boss would have drawn a Fable that the status line does not draw.
- **Classic** stays byte for byte when chosen. Every classic golden case now sets `"look": "classic"` (but `cfg-invalid`, whose file is invalid, so classic whatever the defaults), and the hud-* cases set the options they used to take by default (`fable` off, `align` left, `user` off, `op` tag); every golden file stayed as it was. The tests that are about something else start from `plainDefaults()` (`test/plain-config.ts`): the defaults with classic and those four options. New pins: the golden case `hud-defaults` (no `hungerbar.json`: centred at a known width, the user name, gold while elevated, no Fable, no PR), `test/unit/config-color.test.ts` (the defaults are that setup but for the network, and an invalid file turns none of it on), `test/nonet.test.ts` (the defaults in colour queue no usage or PR refresh), and `test/setup.test.ts` (the questions, the two consents, a first setup's file, and the hints).

**0.11 The boss bar without its name (2026-10-28, still 1.0.0, before its first publication).** The boss line (`hud.fable` boss while Fable is in use) no longer starts with the scoped limit's name. The line just below it names the model in use (`Fable 5.1 Efficiency III`), so `Fable` on top said the same thing twice.
- **Why it can always go.** The engine draws the boss bar only for the scoped limit of the model in use (`scInUse`: the first entry of the same family as the model named on line 1), so its name is always the family of that model. Other scoped limits never get a boss line: they are named at the end of line 2 (`scFit`; `hud-two-scoped` shows `· Sonnet 10% ↻ 1d06h` there under the Fable bar). No case is left where the name says something line 1 does not, so it is left out every time, with no rule for keeping it.
- **A layer after the engine.** `frameHud` (`bossGutter` in `src/hud/frame.ts`) takes the first of the engine's 5 lines and, when the bar starts at col 16 as the engine draws it (exactly 16 cells before it, the last an unstyled space of the name's padding, and U+1FB82 at col 16), makes those 16 cells U+2800, unstyled. The port is unchanged, so `bossLine` and `fableBoss` still equal the oracle span for span and the oracle test is untouched; `FABLE_OPTIONS` stays verbatim.
- **What it draws.** The bar, the % and ↻ the reset are the engine's spans in their columns: the bar at 16-61, right over the hotbar, and the line keeps its width. The gutter is U+2800, not spaces, for the frame row's reason: Claude Code trims every line, so a line that started with spaces would slide left, and U+2800 is not whitespace. Centred, the boss line takes the same lead as every other line, which its own U+2800 run takes in.
- **The setup prompt** shows "a long pink bar" where the engine's note says "the word Fable and a long pink bar" (`promptSentence`).
- **Proof.** `test/unit/hud-frame.test.ts`: the boss line by hand (the engine's `Fable` and 11 spaces; the frame's 16 U+2800 before the same spans, the bar still at col 16, the bytes at both depths kept by `trim`) and `bossGutter` by hand (a name of 15 cells, of wide clusters, none, one unstyled span across col 16; left as they are: a bar at col 15 or 17, a name of 16 cells, a styled, background or bold space at col 15, a wide cluster across cols 15-16, lines of 16, 5 and 0 cells, and a first line on 4 or 6 lines). `test/hud/frame-oracle.ts` blanks the first 16 cells of the first of 5 lines WT cluster by WT cluster and equals the port on the same 12,050 renders. Regenerating the goldens changed 23 files of the 8 cases that draw the boss bar (`hud-256`, `hud-boss-fable`, `hud-boss-low`, `hud-boss-used-up`, `hud-center-boss`, `hud-not-a-repo`, `hud-scoped-reset`, `hud-two-scoped`), each only in the 16 cells before its bar. The README's Fable sample (`hud.e2e.test.ts` (d)), the setup preview, and `docs/media`'s hero.gif, fable.gif, anatomy.png and setup.gif were made again.

**0.12 The hearts line's vitals, the offhand, the agents at work and the pickaxe's tiers (2026-11-01, 1.1.0, `src/hud/vitals.ts`; the offhand 2026-11-02, `src/hud/offhand.ts` and `src/shown.ts`; the agents and the tiers 2026-11-02, `src/hud/agents.ts` and `src/hud/tiers.ts`, the agents' data in `src/transcript.ts`).** Three looks for the HUD's hearts line, Kamal's picks from design round 9: `ultra-apple` from `ultra.json` ("No 5-hour limit (the Ultra plan)"), `stale-tilde` from `stale.json` ("Limits that are not live") and `pay-poison` from `paying.json` ("While the extra credits pay"). Their rows are vendored as `test/reference/round9/ultra.json`, `stale.json` and `paying.json`, each trimmed to the picked option as round 8's are (the design's "today" options left out). With `hud.ultra` and `hud.poison` off and every limit live, every byte of the hearts line is 1.0's. Then four looks for the offhand: Kamal's `totem-mix` from design round 9b ("Where the totem lives", his mix of round 9's `totem-offhand` and `totem-slot5`) and `em-digits` from round 9 ("Extra credits from $100 up"), vendored as `totem-mix.json` and `emerald.json`, and two fixes with no key, the stale count and the credits-out sides. With `hud.totem` off, fresh credits under $100 and no window used up with $0 left, every byte of the hotbar line is 1.0's. Then the agents at work: Kamal's `agents-bees` from design round 9b ("Your agents at work: allays or better?"), with round 9's pick `agents-allays` shipping as the calm option, both vendored (`agents-bees.json`, `agents-allays.json`); and the pickaxe's material, `pick-tiers-full` from round 9c ("The pickaxe's material follows the model"), vendored as `pickaxe.json` with its builder `build-9c.cjs`. With `hud.agents` off and `hud.pickaxe` plain, every byte of line 1 and of slot 1 is the earlier layers'.
- **Ultra (`hud.ultra`, default on).** For an account with no 5-hour window (`State.h5None`, §5's *No 5-hour window*), cols 0-15 of the hearts line become a yellow `#FFFF55` ☼, 13 spaces, a bold gold `#FFD43B` ∞ at col 14 (where the 5-hour % ends) and a space, and the ten hearts turn gold `#FFD43B`: Minecraft's absorption hearts from a golden apple. Gold is drawn nowhere else on the line. The line still starts with the day's sun, so Claude Code trims nothing, and there is no clock: nothing resets. `off`: the engine's grey `?` and ten dark hearts, as 1.0 draws them.
- **Stale (no key).** A limit Claude Code did not send this render, drawn from limits.json (`LimitView.dim`), is marked as classic marks it. The 5-hour window: the space before its % becomes a grey `#AAAAAA` `~`, and the % and the lit hearts are drawn at 60% (`#993333`, the engine's `shade(c, 0.6)`). The weekly: the space at col 62 becomes the `~`, and the drumsticks and the % are drawn at 60% (`#866235`, or `#993333` for a red % at 10% left or less). Dark hearts, the clocks and the day's icon stay as they are, and nothing known stays the engine's `?` and dark hearts. In the colour icon style 🍗 is a colour emoji that ignores the ink, so there only the % and the `~` show it.
- **Poison (`hud.poison`, default on).** Only while the 5-hour window is used up (the engine's `s5_left` 0) and the extra credits pay (more than $0 left): the hearts show the credits' share left, `max(1, round(10 × left ÷ limit))` with the engine's rounding (ties to even, as `hud4.js` f1Line1's absorb share), in poison green `#8DB33A`, the rest dark; the gutter shows the day's icon without the skull (`hud4.js` `day()`'s unshipped `absorb` rule: ☼ yellow, ☼ orange or ☾ grey by the share of the window gone) and the clock, and the % stays the engine's bold red. So $45.80 of $50 is 9 hearts and $4 is 1. Credits out: the skull and dark hearts, as 1.0 draws them. A used-up week changes nothing on the hearts line. With the 5-hour last-known too, the stale shading goes over the poison: the `~`, the % at `#993333` and the poison hearts at `#556B23`. `off`: the skull and dark hearts while the credits pay. Ultra never meets poison: it has no 5-hour window.
- **A layer after the engine.** `heartsHud` draws on the hearts line, the third from the bottom of the engine's lines (line 2 of 4, line 3 of 5 with the boss bar), after the git state and the player's layers and before the frame (`renderHudLook`: `gitHud`, `playerHud`, `heartsHud`, `frameHud`). It draws only on the engine's shape: 16 cells of gutter, then ten `♥ ` (red, then dark; the last space may be trimmed off a line that ends there, or left plain by a fable option's padding, and stays so); and each look only on its own cells: Ultra on the unknown gutter (`?` and 15 spaces), the 5-hour's mark on the known one (the day and the clock, spaces, the bold red %, a space), poison on the known one with the skull, the weekly's mark on a plain space at col 62 before the bold weekly % and its grey ` ↻ `. Anything else is left as drawn. It rebuilds cols 0-35 and keeps every cell from col 36 on but the weekly mark's: col 62, and the ink of the drumsticks before it and of the % after it. `vitalMarks` builds its input from the State's `h5None` and dim flags, the two keys and the port's own `fromState` reading (poison's lit hearts and day icon); `RenderResult.hud.vitals` carries it for the tests.
- **The totem (`hud.totem`, default on; `src/hud/offhand.ts`).** Superseded by §0.13 (1.2.0): the totem no longer follows the credits. As 1.1.0 drew it: Kamal's `totem-mix` from design round 9b (`test/reference/round9/totem-mix.json`, "Where the totem lives"): the Totem of Undying, held while more than $0 of extra credits is left (`extra_left > 0`, the engine's own reading). While no window is used up (the engine's `paying()` false) and none is at 1-10% left, it waits in hotbar slot 5 (cols 37-40, between the frame grey's sides at 36 and 41): a gold `#FFC83D` `☥` and a gold space on the well `#201E07`, then the well's two empty cells (no count). While a window (the 5-hour or the week) is at 1-10% left and none is used up, it is swapped into the offhand: slot 5 keeps the engine's empty well, and the offhand's icon cells (10-11) become the gold `☥ ` with the dollars after it, between the offhand's grey sides. When a window falls to 0 (the shown-file below) it pops for 30 s: cols 9 and 14 become gold half blocks `▐` `▌` (`#FFC83D` on `#5D5D5D`), cols 10-11 a gold `☥` and a white `✦`, cols 12-13 the dollars; the frame reads its side colour from col 9 (`offhandSide`), so its edges over and under the offhand turn gold too. After the 30 s, and whenever a window is used up without a pop, the totem is used: slot 5 stays empty and the offhand is the engine's paying emerald between green sides, until the window resets and slot 5 has it back. No extra-usage limit (no offhand), $0 left, or past the limit: no totem anywhere. `off`: slot 5 and the offhand as 1.0 draws them (the keyless fixes below still apply).
- **The count (no key).** Kamal's `em-digits` from design round 9 (`emerald.json`, "Extra credits from $100 up"). The well has 4 cells. Below $100 they are the engine's own: the icon and a space, then 2 cells, nothing for $0 or $1 (under a dollar the emerald's well stays empty), else the whole dollars right-aligned in bold white. From $100 the icon gives up its spare cell and the count has 3 cells: `100`-`999`, then `trunc(dollars / 1000)` and `k` right-aligned (` 1k`-`99k`), then a yellow `#FFFF55` `99k` from $100,000 (the engine's yellow cap for a count it cannot hold). The totem's count in the offhand is the same; the pop's `✦` takes a cell, so from $100 the pop shows `☥` and the 3-cell count without it.
- **The stale count (no key).** Credits read from `usage.json` (`ExtraView.at`, its last fetch) more than 900 s before now draw their count in grey `#AAAAAA` instead of white, the emerald's and the totem's alike; the icon keeps its colour and the yellow cap stays yellow. stdin's `spend_limit` is this render's own and never stale.
- **Credits out (no key).** A window used up and $0 left (or used past the limit): the engine's `paying()` still lights the offhand's sides green, which said "the credits pay" when nothing was left to pay with. They are drawn as the frame grey's plain sides (a space on `#5D5D5D`), so the frame's offhand edges are grey too. This changes the credits-out row of design round 9's `paying.json` (p-out) and round 9b's `totem-mix.json` (t-out): both are vendored with the fix, as their notes say.
- **The shown-file (`src/shown.ts`).** Version 2 since 1.2.0 (§0.13): `credits` dropped, `fable` added, asked only while a limit reset is held. As 1.1.0 kept it: the pop is the one thing a single render cannot see, so the HUD keeps what it drew in `<cacheDir>/hud/<sid>.shown.json` (about 150 bytes, the session key of the history file, §0.9): `{"v": 1, "at": <now>, "h5": 0-10 | null, "week": 0-10 | null, "credits": <whole dollars> | null, "until": {"pop": <second>}}`. `h5` and `week` are the engine's lit icons (`icons10` of the % left) for a live limit only (a last-known one is null); `credits` the whole dollars of fresh credits only (stdin's, or a `usage.json` at most 900 s old). The step: when the saved file had a window at 1 or more icons and this render draws it at 0, while more than $0 is left, `until.pop` becomes now + 30, else the saved `until.pop` stays; the pop shows while now < `until.pop`. A saved file that is not exactly that shape, whose `at` is ahead of now (the clock went back), or whose pop ends more than 30 s after its `at`, is no file. It is stepped only with `hud.totem` on and a session key, and written only when `h5`, `week`, `credits` or `until.pop` changed (`at` aside), atomically, by a hook on the render's `after` list, after stdout, as the history file; preview, the demos and any render with `persist` false neither read nor write it, and a HUD render that throws writes none. The 7-day sweep of `hud/` (`pruneOld`) removes old ones. `hungerbar doctor` counts them apart from the history files (`histFiles` skips `*.shown.json`).
- **A layer after the vitals.** `offhandHud` draws on the hotbar line (the engine's last), after the vitals and before the frame (`renderHudLook`: `gitHud`, `playerHud`, `heartsHud`, `offhandHud`, `frameHud`), so the frame's edges follow the sides it draws. It draws only where the engine drew an offhand (col 9 has a background, the frame's `offhandSide`) and its 6 cells are exactly the engine's for these credits (`engineOffhand`: the sides lit while paying, the emerald and its count, or the empty well), and the slot-5 totem only on the plain empty well between the frame grey's sides; anything else is left as drawn. `offhandMarks` builds its input (the whole dollars, paying, the credits out, where the totem is, the stale count) from the port's own `fromState` reading, `hud.totem`, `State.extra.at` and the shown-file's `until.pop` (`Sources.shown`, asked only with `hud.totem` on); `RenderResult.hud.offhand` carries it for the tests.
- **CLI.** `look`, `setup` and `preview` take `--ultra on|off` and `--poison on|off` (`V11_FLAG_KEYS`, after the 0.7.0 keys in the checks, the writer, the help and look's usage line; `HUD_FLAG_KEYS` keeps its five); setup asks no question for them. `look` with no argument (with `the hearts: hungerbar look hud [--ultra on|off] [--poison on|off]` after the player's line), the notes after a change and doctor's Look section say what they show (`vitalsSummary`), and the stale mark with them. `glyphs --hud` lists ∞; its census for 1.1.0 (`test/look.test.ts`), over the demos and every mark, finds that the vitals add only ∞ and the engine's own ☼ and ☾, each listed and 1 cell. `--totem on|off` is the third of `V11_FLAG_KEYS` (setup asks no question for it either); look names it on its own line, `the offhand: hungerbar look hud [--totem on|off]`, after the hearts' line, and `offhandSummary` says what it and the keyless fixes show; doctor counts the shown-files apart from the history files (`histFiles` skips `*.shown.json`, `shownFiles` counts them). `glyphs --hud` lists ☥ and ✦ after ∞ (Segoe UI Symbol in both icon styles, probed in round 9), and the offhand's census finds that it adds only those two.
- **Proof.** `test/unit/hud-vitals.test.ts`: the 13 vendored rows (4 of each pick and paying.json's p-share, drawn with the boss option) span for span through the layer on the engine's render, through the tests' own layer (`test/hud/vitals-oracle.ts`, written independently: it finds every column from the state through the engine's own `fromState`, `icons10`, `t5` and `pyRound`, and works cluster by cluster) and through `renderPayload` with sources that hand each situation its limits, their last-known flags, the credits and the Fable week; every look, poison with the stale shading, Ultra and poison under the boss bar, the keys off (1.0's bytes) and every line the layer must leave alone by hand; the bytes at both depths against the independent encoder; and seeded fuzz (`test/hud/fuzz.ts`' vitals domains: used-up and missing 5-hour windows, weeks, credits on both sides of each heart) × seeded flags × the 5 fable ids against the oracle. The golden cases `hud-ultra`, `hud-ultra-boss`, `hud-ultra-stale` and `hud-poison` pin what the vitals are handed (`hudVitals`), and `hud-extra` draws poison since 1.1.0. The credits-out row of `paying.json` (p-out) is vendored with the offhand's credits-out fix, and a fifth row, p-share ($2.50 of $50: a share of 0.5, rounded to 0, so the floor of 1 heart), was drawn by the design's own `build.cjs` with that situation added; its note says both. The design's builders `build.cjs` and `build-9b.cjs` are vendored too (kind renamed: the private folder they read the engine from and the notes that quoted the design chat as "Your" reworded, LF line ends), so every row has its builder in the repository.
- **Proof of the offhand.** Since 1.2.0 the `totem-mix` rows stay vendored for the record and their tests retired (§0.13 superseded them); `em-digits`, `paying.json`'s credits-out row and the keyless fixes stay under test. As 1.1.0 proved it: `test/unit/hud-offhand.test.ts`: the 15 vendored rows (7 of `totem-mix` with `hud.totem` on and `hud.poison` off, as they were drawn on 1.0's hearts line; 8 of `em-digits` with `hud.totem` off, as they predate the totem, and with it on the same rows and the totem in slot 5) span for span through the layer on the engine's render, through the tests' own layer (`test/hud/offhand-oracle.ts`, written independently: it finds every cell from the state through the engine's own `fromState` and `paying`) and through `renderPayload` with sources that hand each situation its limits, its credits and their age, and a shown-file stepped from a seeded one; `paying.json`'s credits-out row; by hand the marks' rules (the 1-10% band at 11, 10, 1, the week, the pop until its end, a cent, $0, past the limit, no limit), the pop's 30 s through the HUD path (until.pop - 1 draws it, until.pop does not), the totem's moves and the frame's edges with them, the count's edges ($0.999, $1, $99, $100, $999, $1,000, $99,999, $100,000), the stale grey, `hud.totem` off (1.0's bytes), no offhand, the boss bar's line and every shape the layer must leave as it is; the bytes at both depths; the glyphs; and seeded fuzz (`test/hud/fuzz.ts`' offhand domains: credits around each edge, windows around 10% and 0, the flags) × the 5 fable ids against the oracle. `test/shown.test.ts`: the step's rules, the saved file's checks, the disk step's write discipline, the HUD path (only with `hud.totem` on and a session key), dist (the write after stdout, a second render writes nothing, preview never reads or writes it) and the sweep. The golden cases `hud-totem` (the 5-hour at 7%, $50), `hud-totem-pop` (a seeded shown-file at 1 heart, the window at 0 now, $45.80), `hud-credits-out`, `hud-emerald-100` ($250) and `hud-usage-stale` (a usage.json 2 hours old) pin what the offhand is handed (`hudOffhand`); since 1.1.0 every case with credits and no window at 10% or less shows the totem in slot 5, `hud-tight` and `hud-boss-low` show it in the offhand, and `hud-extra` and `hud-poison` (a window used up, no pop) keep the green paying emerald.
- **The agents at work (`hud.agents`, default bees; `src/hud/agents.ts`).** Claude Code's subagents and a workflow's agents (Ultracode's) each write their own transcript, `agent-<id>.jsonl`, in the session's subagents folder; one whose file was written at most 60 s from now (either way: a clock ahead counts) is at work. Line 1's sky after the cache readout shows one for each, from col 82, 4 cells apart, up to four, then at col 98 a bold `+` and the rest's count (16 agents at most are known, so `+12` at most: line 1 is then 101 cells). `bees` (Kamal's `agents-bees`): a hive `▤` (`#F0B43C` on `#6E4B1F`) at col 80, and each bee two cells of `▐` in brown `#3A2E16` on the yellow `#F8C94A` (yellow, stripe, yellow, stripe), then its wing in `#E6F2FF`, U+1FB02 raised on the first, third … bee and U+1FB0B level on the others, so the swarm flutters home to the hive; the count is the bees' yellow. `allays` (round 9's `agents-allays`): each allay three sextant cells, its head U+1FB0E in `#D9F4FF`, its body U+1FB39 and its wing U+1FB06 (raised) or U+1FB0B (level) in `#7FD3FF`, no hive, the count the allays' blue. `off`: nothing, and nothing is read (`Sources.agents` is not asked, so no look is ever queued). With none at work nothing is drawn, whatever the mode: Ultracode on with no agent at work is a clear sky (the design's a-idle). The phantoms keep cols 23-41 (§0.9), so the two never meet. Line 1 is the fourth line from the bottom of the engine's lines (the second of 5 with the boss bar). The flock is drawn all or nothing: only when every cell from the one before its first (col 79 for the bees' hive, col 81 for the allays) to its last is empty sky (an unstyled space, or past the line's end, which it pads with spaces); anything else there and line 1 is left as it is. The design's builder drew each sprite where it fit; on every one of its rows the two rules agree. A centred HUD measures the wider line 1 like any other: in a 120-column window six agents' 100 cells move the HUD 16 columns, not 19 (`hud-bees-swarm`).
- **The agents' data: Ultracode and the agent files (`src/transcript.ts`).** The render never reads the folder; the transcript's summary, the one read each render already makes (§5, plan §7), carries what the agents need, and the transcript worker (`refresh transcript <path> <id> agents`) does the reading. The fold keeps three things more in `transcript/<id>.json` (all absent in a state written before 1.1.0): `ultra`, the last Ultracode signal of the main chain (Claude Code writes a main-chain attachment row of type `ultra_effort_enter` while Ultracode is on, its full and its sparse "still on" reminders, and `ultra_effort_exit` when it goes off; a sidechain's, or the marker as text, says nothing); `agentAt`, the time of the newest main-chain call to a tool that starts agents (`Agent`, `Task` in older Claude Codes, `Workflow`; a row with no time takes the newest message's); and `agents`, the worker's last look: `{"at": <second>, "mtimes": [<the newest 16 agent-file mtimes, seconds, newest first>]}`. The worker reads the folder beside the transcript named after the file without `.jsonl` (`<dir>/<session>/subagents`, as Claude Code names it) and its `workflows/wf_<id>` folders, the newest first: at most 256 `agent-<id>.jsonl` files a folder and 256 `wf_<id>` folders listed, each counted after the name filter (an agent's `.meta.json` and `.prefix.json`, and any other name, are skipped and take none of the cap, so 256 names are 256 agents), the newest 64 of those workflow folders read, and 512 stats in all, the hard bound, each through `statSafe`; only names and mtimes are read, never a file's contents, and a missing folder is no agents, silently. It writes the state after a look even when no transcript byte was new. A HUD render with `hud.agents` on asks for a look (`agentsDue`) while the session is at work with agents (its last agent call at most 600 s ago, or the last look found an agent file written at most 600 s before it) once that look is 10 s old (or there is none, or it is from a clock ahead), and queues the worker after stdout unless its lock is live, or adds `agents` to the worker this render queued already; a session that never called an agent tool is never looked at. The look is honest about its age: the count is the look's mtimes read against this render's now, so an agent shows up to 10 s late plus the time to the next render (Claude Code renders at least every `refreshInterval`, 10 s as setup writes it), an agent that has not written for a minute drops out though it still runs (a long tool call), and a look that grows old can only count fewer, never more. A render racing the worker may write the previous look back; the next render then asks again, so the worst case is work done twice. `Ultracode` is carried in the marks (`RenderResult.hud.agents.ultra`) and drawn by neither look.
- **A layer after the offhand.** `agentsHud` draws on line 1 after the offhand and before the pickaxe's tiers and the frame (`renderHudLook`: `gitHud`, `playerHud`, `heartsHud`, `offhandHud`, `agentsHud`, `tiersHud`, `frameHud`). `agentMarks` builds its input (the look, the agents at work, Ultracode) from `hud.agents` and `Sources.agents` (`diskSources`: the summary's `ultra` and `agents.mtimes`; the demos: none but the agents day's three, written 3, 10 and 17 s before the render's now); `RenderResult.hud.agents` carries it for the tests.
- **The pickaxe's tiers (`hud.pickaxe`, default tiers; `src/hud/tiers.ts`).** Kamal's `pick-tiers-full` from design round 9c: the pickaxe in hotbar slot 1 (cols 17-18, `⛏ `) and the effort numeral after it (cols 19-20, `Ⅰ `-`Ⅴ `) take the tier of the model's family (the engine's own `family()` of `fromState`'s model, as 1.0's pickaxe ink), in Minecraft's words: Fable netherite `#857579`, Opus diamond `#55FFFF`, Sonnet iron `#C6C6C6`, Haiku gold `#FFAA00`, any other model stone `#AAAAAA`. The numeral gives up the enchant pink `#FF55FF` (it stays bold, and the engine's glint behind it still says the effort), so the tier shows with colour icons too, where `⛏` is a colour emoji that ignores the ink; with no effort (or one the engine does not know) there is no numeral and only the pickaxe changes. 1.0's pickaxe already took an ink by family (`mix.ts` `TIER`: Opus `#55FFFF`, Fable `#9D8F8F`, Sonnet `#D8D8D8`, Haiku `#8F8F8F`, any other `#AAAAAA`), so for Opus and an unknown model only the numeral's bytes change. `plain`: 1.0's bytes. `tiersHud` draws on the hotbar line after the agents and before the frame, and only on the engine's own slot 1 for this model: the mint `▐` at col 16 and `▌` at col 21, `⛏ ` in 1.0's ink for the model on the effort's glint, then the bold pink numeral and a space on the same glint, or two blank cells on it; anything else is left as drawn. `tierMarks` builds its input (the tier and its ink, or none for plain); `RenderResult.hud.tiers` carries it.
- **CLI and the setup question.** `--agents off|allays|bees` and `--pickaxe tiers|plain` are the last of `V11_FLAG_KEYS`, so look, setup and preview take them, the writer writes all but bees and tiers (the defaults only over another value), and they go last; the help's three 1.1.0 blocks name them on a line of their own and look's usage line ends with them. look with no argument, the notes after a change and doctor's Look section say what they show (`agentsSummary`, which says the worker reads only the folder's names and times, or with off that it is never read; `pickaxeSummary`), and look names their flags after the offhand's: `the sky: hungerbar look hud [--agents off|allays|bees]` and `the pickaxe: hungerbar look hud [--pickaxe tiers|plain]`. setup asks for the agents last in the HUD's flow, after the operator's mark (and the PR status where gh is found): "Your agents at work", bees, allays or nothing, each previewed on line 1 of the demos' sixth situation, `agents` (the normal day with three agents at work), with the answers so far; Enter keeps what `hungerbar.json` has, marked (current), or takes the bees on a fresh file, marked (default), and the answer is saved as the other questions' are. setup asks nothing for `--pickaxe`. `preview --situation agents` shows that day, and `glyphs --hud` lists the hive and the four new sextants after the totem's glyphs (▐ and U+1FB0B are the hotbar's and the phantoms' already); the census for 1.1.0 finds that the agents add only those and the tiers none.
- **Proof of the agents and the tiers.** `test/unit/hud-agents.test.ts`: the 12 vendored rows (6 of each look, with the shipped phantoms of a-sky, `hud.totem` off and `hud.pickaxe` plain as they predate both) span for span through the layer on the engine's render, through the tests' own layer (`test/hud/agents-oracle.ts`, written independently from `build-9b.cjs` and `build.cjs`, cluster by cluster, with its own copy of the all-or-nothing rule) and through `renderPayload` with sources that hand each situation its counts and agent files; with the totem on, the same rows with ☥ in slot 5, and with the tiers on, the same rows with the numeral in Opus's diamond; by hand the 60 s window both ways, 0, 1, 4, 6 and 16 agents, Ultracode on with none at work (nothing), each `hud.agents` value (off never asks the source), the flock's places, the sky shared with four phantoms, the boss bar's line and every sky the layer leaves alone; the disk sources' due look, queued once and riding on an over-budget worker; the bytes at both depths; the glyphs; and seeded fuzz (`test/hud/fuzz.ts`' agents flags with the phantoms) × the 5 fable ids against the oracle. `test/transcript.test.ts`: the Ultracode fold and the agent calls on synthetic rows (only the two marker strings are real), `agentMtimes` on synthetic subagents folders (the names it counts, its order, the cap of 16, every bound counted through an injected stat), the worker's look written and kept by later reads, dist's `refresh transcript … agents` at `HUNGERBAR_NOW`, and `agentsDue` at its edges. `test/unit/hud-tiers.test.ts`: the five engine rows of `pickaxe.json` through the layer, the tests' own layer (`test/hud/tiers-oracle.ts`, which finds the ink and the numeral from the state through the engine's `family` and `level`) and `renderPayload` (Fable 5.1 at effort max with the boss bar: the netherite Ⅴ on the deepest glint); the lineup row is no engine state (the design's builder cut slot 1 from each model's own render at effort high and set the five side by side), so the test rebuilds it the same way from Hungerbar's renders and compares; every family and name form, no effort, Opus's unchanged pickaxe, plain's 1.0 bytes, the shapes left alone, the bytes, and seeded fuzz × tiers or plain × the 5 fable ids, where nothing but cols 17-20 of the hotbar line may change. The vendored rows of rounds 8, 9 and 9b predate the tiers: their path tests set `hud.pickaxe` plain. Six golden cases run the whole path through dist: `hud-bees` (three of four agent files at work, one plain and two of a workflow, seeded by the harness's `state.agents`, which writes them at NOW minus their ages and takes the worker's look in process at NOW), `hud-bees-swarm` (six: four and `+2`, centred), `hud-allays`, `hud-phantom-bees` (two phantoms and three bees), `hud-tiers-fable-v` and `hud-tiers-haiku`; they pin `hudAgents` and `hudTiers`. Since 1.1.0 the tiers change 113 files of 50 existing cases, each checked to differ only in the styles of hotbar cols 17-20: the numeral of every Opus case (36) leaves the pink for diamond, every Fable case (13, `hud-256` at 256 colours) has the netherite pickaxe and numeral, and `hud-huge`'s unknown model a stone numeral; `hud-foreign` (Codex, no effort: no numeral, and stone was 1.0's ink) and every text file are unchanged.
- **The release step: docs/media.** The release remade nine of the ten pictures in `docs/media` from 1.1.0's defaults with `scripts/media/make.mjs`: `anatomy.png`, `hero.gif`, `idle.gif`, `center.gif`, `frame.gif`, `fable.gif`, `git.gif`, `pr.gif` and `setup.gif` (the totem in slot 5, the tier numerals, Fable's netherite pickaxe, and setup's seventh question); `classic.png` is untouched. The scenes changed with them: the sandbox seeds agent files and takes the worker's look in process (`Rig.agents`, as `state.agents` does), so the anatomy draws three bees, and a second marker with its row's number points at the bees (4) and at the totem (15), so its 25 numbers stay the table's 25 rows; `hero.gif` captions the totem's swap into the offhand where the render first draws it; `frame.gif` renders the used-up 5-hour limit twice, at the pop and 40 s later; setup's scene splits at the `Agents [1]` question too; and the pictures' font fallback draws ☥ and ✦ in Segoe UI Symbol, which Cascadia Mono lacks.

**0.13 The totem is your limit reset (2026-11-03, 1.2.0; `src/totems.ts`, `src/cli/totem.ts`, `src/hud/totem.ts`).** 1.1.0 drew the totem from the extra credits; that was a misreading. The Totem of Undying stands for a limit reset Anthropic gave you. The first bullets are the data and the command; the HUD's layer follows them.
- **What a limit reset is.** Anthropic gives resets now and then ("What is a limit reset?", support.claude.com, 2026-09-22). Using one sets the usage limits back to full whenever you choose: depending on the offer the 5-hour window, the week, Fable's weekly, or all of them; the weekly reset day stays. An unused one expires at the time on its offer (Settings → Usage → Resets shows it). It is used in Settings → Usage → "Reset for free" (claude.ai or Claude Desktop), or with Claude Code's `/limit-reset` where the account has it; Claude Code names four kinds, the 5-hour, weekly, Fable and full resets. It cannot be undone and has nothing to do with the extra credits.
- **The source: you declare them.** Claude Code passes no resets to status lines (feature request #99699), and the usage endpoint's resets block answered Hungerbar's honest request (its own User-Agent, 2026-11-03) with `eligible: false, ineligible_reason: "surface"`: reading it would need posing as Claude Code, which §11 forbids. So the user declares them, and nothing guesses: an early refill seen in the limits is not counted, because Anthropic has reset everyone's counters with no action from users and a Fable reset refills only part of the week.
- **The key.** `totems` at the top of `hungerbar.json` (the declaration is the user's own data, per account as the file is; the cache is disposable): a list of `{"n": 1-99, "kind": "full" | "5h" | "week" | "fable", "until": <ISO 8601>, "at": <ISO 8601>, "label": <text up to 80>}`, kind `full` when absent, until absent for no expiry known. `merge()` reads it through `parseTotems`: anything but an array is none; at most the first 16 entries are read; an entry is kept only when it is an object with a whole n from 1 to 99, a known kind and an until `Date.parse` reads (or none); anything else is that entry ignored, and doctor counts it. `at` and `label` never reject an entry (an unreadable `at` is none; the label is sanitized, §7.5, and capped). `Config.totems` holds `{n, kind, until, at, label}` with epoch seconds.
- **Held** (`held(grants, now)`, pure). A grant whose until is at or before now counts as none; nothing is written for it. Held is the sum of n over the grants left (no cap: 120 is 120), refills the windows any of them refills (`full` all three, `5h` the 5-hour window, `week` the week, `fable` Fable's weekly), and the last day is the soonest until less than 24 h away. The render reads `totems` only through `merge()`, the same parse of the file it already makes, and never writes it.
- **No totem held, no change.** With no totem held (none declared, all expired, or none readable) every byte of every render is 1.1.0's: `test/totems.test.ts` draws every golden case again through dist with a `totems` key that holds nothing (an empty list, expired grants, entries that are not grants, a non-list) against its golden file, and every demo in both looks and every Fable option in process.
- **The command** (`hungerbar totem`, `src/cli/totem.ts`). With no form it says what is held (each grant, the last day, where the HUD puts the totem, how to use one), or how to declare one, and how many expired grants it ignores. `<n>` (0 to 99) replaces every grant with one of n (0 clears; the same single grant already held is kept as it is, its `at` too); `add [<n>]` (1 to 99, default 1) appends one with its own expiry; `use [--kind k]` takes one off the held grant (of that kind) that expires first, one with no expiry last and the file's order breaking a tie; `clear` is `0`. `--until` takes `YYYY-MM-DD` (23:59:59 local time that day), `YYYY-MM-DDTHH:MM[:SS]` (local), the same with `Z` or `±HH:MM` (that instant), or `+<n>d` / `+<n>h`; it is stored in UTC. Refused before anything is read for writing, each in one line with the usage: an unknown form or option, a count out of range, an unknown `--kind`, a flag that does not go with the form, a date or time that does not exist (a local time a clock change skips included), a time at or before now, more than 400 days ahead, a label over 80 characters, and `use` with nothing (of that kind) held. Dates print as local `YYYY-MM-DD HH:MM`, never a locale's month names.
- **The writer.** Look's discipline (§0.9 *The writer*), shared through `readConfigStrict` and `applyConfig`: strict JSON with a BOM accepted, refused when invalid, not an object or not UTF-8 with the by-hand steps, a backup `hungerbar.json.bak.<stamp>`, only `totems` changed and every other key kept in its place, 2-space UTF-8 without a BOM, CRLF kept, `$schema` on a new file, a symlink followed, a read-only file refused in one line, nothing written when the result is the same. Every write drops the grants that expired or reached 0; an empty list removes the key. `--print` shows the diff and writes nothing. It writes no network key, so it asks no consent. Each write ends with what is held and the way back: `hungerbar totem clear` when nothing was held before, the one grant held before as a command, else the backup; after `use`, the grant used, added back.
- **`use` and `limits.json`.** `newer()` keeps, for the same `resets_at`, the higher use (§5), and a weekly reset leaves the week's reset day as it was, so `limits.json` would keep the pre-reset use and a render without live limits would draw it with `~` for up to a week. `totem use` therefore sets the windows its kind refills (`five_hour`, `seven_day` or both) to null in `acct-…/limits.json` (`forgetWindows`: an atomic rewrite, only when the file is there and they are not null already; `fiveHourNone` and `at` kept; a cache it cannot write only costs that). The next live render writes the fresh value; until then a render without live limits draws `?`. `newer()` itself does not change. Fable's weekly is in `usage.json`, which only the refresher rewrites, so a `fable` or `full` use says "Fable's weekly refreshes from the usage API within 3 minutes."
- **look, doctor and setup.** `hungerbar look` prints the emerald's line (`the offhand: …`, the fixes of §0.12) and then the totem's: `hud.totem on: 1 limit reset held (a full reset, use by 2026-12-01 23:59): the totem in hotbar slot 5, in the offhand while a limit it refills is at 10% or less; hungerbar totem to change it`, or that none is declared and the command that declares one; its flag lines say `the totem: hungerbar look hud [--totem on|off]; your resets: hungerbar totem`. `doctor`'s Look section prints the same line and warns about grants that expired, entries it could not read, a `5h` reset on an account with no 5-hour window (`limits.json`'s `fiveHourNone` with its `fiveHourNoneAt`, 1.2.1: it can never move the totem) and a `fable` reset while the usage API with `network.scopedWeekly` is off (Hungerbar cannot see Fable's weekly). `setup` asks no new question; when the look it leaves is the HUD with `hud.totem` on and no totem held, it ends with `Got a limit reset (Settings → Usage)? hungerbar totem 1 --until <date> puts it in the HUD as the Totem of Undying.`
- **Proof.** `test/totems.test.ts`: the parse (every rejection), `held` (expiry to the second, the kinds, the last day), `--until` (its forms in several time zones, every refusal), the operations, the words, `forgetWindows`, the command in process and through dist (the writer's discipline, every form and refusal, `use` and `limits.json`), and the no-totem proof above; `src/totems.ts` and `src/cli/totem.ts` at 100% lines, branches and functions under it (`--experimental-test-coverage`, outside the HUD's gate). `test/look.test.ts` and `test/setup.test.ts`: the lines, doctor's warnings, the help; `test/unit/config-color.test.ts`: `schema.json`'s `totems` as `src/totems.ts` reads it.
- **The windows and the three places** (`src/hud/totem.ts`). The windows a held reset can refill are the 5-hour window, the week, and Fable's weekly while Fable is the model in use (the engine's `scInUse(sit, sit.scoped)`, the entry the boss bar draws; known only with `network.scopedWeekly`): on Opus, Fable's weekly never moves the totem. A window is dying at 1-10% left and dead at 0, by the values the HUD draws (live, or last-known with `~`). First that holds: **the call**, a window a held reset refills is dead: the totem in the offhand between gold sides (`▐` `▌` `#FFC83D` on the frame grey, cols 9 and 14), so the frame's offhand edges are gold too; **the suggestion**, one is dying: the totem in the offhand between the grey sides; else **waiting** in hotbar slot 5 (cols 37-40). The last day moves nothing. In the call and the suggestion the emerald moves to slot 5: exactly the four well cells the offhand layer drew for the credits (`◆ 50`, `◆250`, the grey old count, the empty well under a dollar), between green half blocks (`▐` col 36, `▌` col 41, `#17DD62` on the frame grey) while the credits pay (the engine's `paying()` and more than $0 left), else the frame grey's sides. With no extra-usage limit the offhand appears for the totem: cols 0-15 become the engine's own gutter for an empty offhand (`f2Gutter` with `extra_left` 0: the version cut to 8 cells, the sides, the well), and slot 5 stays empty. A window the held resets cannot refill changes nothing about them: if it is dead, the engine's paying emerald shows in the offhand as in 1.1.0 while the totem waits.
- **The look: round 10's picks with the owner's two amendments** (`test/reference/round10/`, 2026-11-03): the shape `totem-idol` (the golden idol), the last day `last-mark`, the call `call-pop-gold`. **Centred:** alone the totem sits centred in its well (form A): U+1FB0C (sextant-134) gold `#FFC83D` on the well `#201E07`, the face's two halves gold with a bold `#3BD16F` `•` eye in each, U+1FB0D gold on the well. The picked idol is 3 cells wide in a 4-cell well, so whole cells can only put it flush left or right; a true half-cell shift would need cells of three colours (the well, the gold, the eye) and a glyph across a cell boundary, which a terminal cannot draw, so form A is the closest symmetric form: the picked wings around a two-cell face. **Beside its mark** it shifts left (form B, the picked cells): U+1FB0C, `¨` bold green on gold, U+1FB0D, then the mark in the well's last cell: the pop's white `✦` for 30 s from a fall seen live (it wins), else on the last day (the soonest end less than 24 h away) a bold yellow `!` (`#FFFF55`). **Not stackable:** a Totem of Undying does not stack, so no count is ever drawn on the totem: one idol for any number held, and nothing in its cells depends on n beyond one or more; the count is `hungerbar totem`'s, look's and doctor's. The wings are sextants Windows Terminal draws itself; `•` and `¨` are in Cascadia Mono; `✦` takes the ink from Segoe UI Symbol (round 9's probe): the same in both icon styles.
- **The shown-file, version 2** (`src/shown.ts`). `{"v": 2, "at": <now>, "h5": 0-10 | null, "week": 0-10 | null, "fable": 0-10 | null, "until": {"pop": <second>}}`: `credits` is dropped (nothing read it, and it cost a write on every change of whole dollars), `fable` is `icons10` of Fable's weekly while Fable is in use and `usage.json` is at most 900 s old (`State.scopedAt`), else null. Every field is required: a file without `fable`, and 1.1.0's version 1, are no file, and the 7-day sweep removes them. `ShownNow` carries `refills`: the pop fires only when a window a held reset refills falls from 1 or more lit icons (live) to 0, and shows only in the call. The 30 s, the clock checks, the write after stdout and the sweep are 1.1.0's. It is asked (`Sources.shown`) only with `hud.totem` on, a reset held and a session key; doctor counts the files only then, or when some are left over.
- **A layer after the offhand.** `totemHud` draws on the hotbar line after `offhandHud` and before the agents, the tiers and the frame (`renderHudLook`: `gitHud`, `playerHud`, `heartsHud`, `offhandHud`, `totemHud`, `agentsHud`, `tiersHud`, `frameHud`), so the frame's edges follow the sides it draws. It draws only on the shapes it expects: slot 5 the plain empty well between the frame grey's sides; the offhand exactly as the offhand layer drew it (`drawnOffhand`), or, with no extra-usage limit, cols 0-15 exactly the engine's gutter; anything else is left as drawn. `totemMarks` builds its input (`{at, mark}`: where, and form A or B) from `hud.totem`, the resets held at now (`Sources.totems`, the seam a later source plugs into; the render's reads `cfg.totems`, the demo hands its own), the port's `fromState` reading and the shown-file's `until.pop`; `RenderResult.hud.totem` carries it. The totem left `src/hud/offhand.ts` (`OffhandMarks.totem`, `☥` and the slot-5 drawing went); `offhandMarks` takes only the state and the reading.
- **No totem held, or `hud.totem off`: 1.1.0's totem-off bytes.** Slot 5 is the engine's empty well and the offhand the emerald with its keyless fixes, and the shown-file is not asked. So every golden case with credits that drew 1.1.0's `☥` changed (168 files in 52 cases: slot 5 empties, or, in `hud-tight` and `hud-boss-low`, the offhand has its emerald back), each only in the hotbar's cols 9-14 and 36-41 (moved by the centring's offset in the centred modes).
- **The demos** (`src/demo.ts` `DEMO_TOTEMS`): the normal, tight, extra, Fable and agents days hold one full reset ending 20 days after `DEMO_NOW`, the fresh day none; `preview` and the previews in look and setup draw the demo's, never the user's file's. The totem waits in slot 5 on the normal day, is in the offhand on the tight day and calls on the extra day (no pop: previews never read the shown-file).
- **`glyphs --hud`** lists the idol's code points at 1 cell (U+1FB0C, `•`, `¨`, U+1FB0D), the last day's `!` and the pop's `✦`; 1.1.0's `☥` is no longer drawn by the HUD.
- **Proof of the HUD.** `test/unit/hud-totem.test.ts`: the 17 vendored round-10 rows (the picks, redrawn with the amendments by the vendored `build-10.mjs`) span for span through the real HUD path in the design's own sandbox (`scripts/media/rig.mjs`'s normal day: `renderPayload` with its files, the situation's totems declared and a seeded shown-file), with `hud.totem` off the same rows' 1.1.0 bytes and every difference inside the feature's cells; the 49 rows of the design's behaviour matrix (2.8; 42 by hand, 45 is the classic `resets` item, a later step) through `renderPayload`, each also drawn with every grant's n at 1 and at 99 to the same bytes; by hand the marks' rules (the 10% band, the kinds, Fable in use or not, the pop in the call only, the last day), `shownNow`, both forms cell for cell and every shape the layer must leave as it is; the bytes at both depths; the glyphs; and the tests' own layer (`test/hud/totem-oracle.ts`, written from the rules, cluster by cluster) on the reference states, the time-lapse and seeded fuzz (`test/hud/fuzz.ts`' totem domains: grants of each kind ending around now and now + 24 h, the windows around 11, 10, 1 and 0, Fable in use or not, credits around $0, $1 and $100) × seeded grants × `hud.totem` × the 5 fable ids, with the invariants that with nothing held the layer draws nothing and that n never changes a cell. `src/hud/totem.ts` is in the HUD's 100% coverage gate. `test/shown.test.ts` proves version 2; the golden cases `hud-totem` (rewritten: the suggestion), `hud-totem-pop` (rewritten: the call's pop, a seeded v2 shown-file), `hud-totem-safe`, `hud-totem-two` (the bytes of `hud-totem-safe`), `hud-totem-none`, `hud-totem-call`, `hud-totem-out`, `hud-totem-kind`, `hud-totem-fable`, `hud-totem-ultra`, `hud-totem-expired` and `hud-totem-lastday` pin what the totem is handed (`hudTotem`). The seven port modules and `test/hud.oracle.test.ts` are unchanged.
- **The classic `resets` item** (`src/items.ts`, 1.2.0). Opt-in: add `resets` to a line of `lines`; it is in no default line, so with the default `lines` every classic byte is as before (every classic golden and `test/picker.test.ts` unchanged). It reads `State.totems` (`Sources.totems`, else the config's `totems`, so a demo draws its own) through `held` at now: `☥ Limit resets: 1 (use by 2026-12-01)`, the label grey, the count the sum of n over the grants held (no cap), then the soonest expiry's local date in the clock grey, or no date when none has one; short (`☥ 1`, `Limit resets 1` in ASCII) with no date; ASCII drops the glyph (`Glyphs.totem`, `☥ ` or empty). "Limit resets" is Anthropic's word: "Resets" alone would read as the `↻` reset clock. Nothing while none is held, and a line with nothing else is not drawn. The count is gold (`totem`, Minecraft's `#FFAA00`, 16-colour 33), in the warn colour while a window a held reset refills is at 1-10% left, and in the crit colour once one is at 0 (a dead window wins); the windows are the HUD totem's: the 5-hour window and the week as the lines draw them (live or `~`), and the scoped weekly whose family is the model in use (the engine's `scInUse` rule, `family()`), only for a `full` or `fable` reset. `hud.totem` is the HUD's and does not touch it. Fit to width drops it first, before the version (§0.3). `glyphs` lists ☥ at 1 cell. Proof: the golden case `classic-resets` (a full reset, the 5-hour window at 7% left: the warn colour; at 80, 60 and 40 columns it is the first to go) and `test/unit/classic-resets.test.ts` (the words, expiry at the second, every kind and window for the colour, Fable in use or not, the source, the short form, the drop order, `lines`' enum in `schema.json` equal to `ITEM_IDS`).
- **The release step: docs/media.** The README's Anatomy has the totem's own row (20; the parts after it moved up one, 26 in all) and `scripts/media/scenes/anatomy.mjs` declares one reset with its own marker 20. Every picture but `classic.png` drew 1.1.0's `☥` (checked by running 1.1.0's scenes and 1.2.0's on their own builds and reading every frame's text, not by eye), so the release remade all nine with `scripts/media/make.mjs` from PowerShell, and a tenth, `totem.gif`, is new: the rig's `ONE_RESET` (one full reset, 30 days after `T0`, as the demos hold one) is declared by the normal day (`scenes/looks.mjs`), so `anatomy.png`, `idle.gif`, `center.gif`, `fable.gif`, `git.gif` and `pr.gif` draw the idol in slot 5 where the `☥` was; `hero.gif` declares it too and captions the first frame that draws the idol before the pickaxe (the move to the offhand, the emerald to slot 5); `frame.gif` shows the pop and then the call (the totem gold in the offhand, slot 5's emerald between green sides while the credits pay); `setup.gif` ends with setup's line on declaring a reset, cut at the release to fit 120 columns ("Got a limit reset (Settings → Usage)? …", 114 characters); `totem.gif` (`scenes/totem.mjs`) is five renders of one session in the rig, the shown-file stepped by each: waiting in slot 5, the 5-hour window at 7% (the totem in the offhand, the emerald in slot 5), the window at 0 (the pop), 40 s later (the call, the credits paying in slot 5), and after `hungerbar totem use` with the window full again (no totem). `classic.png` is untouched (the classic look draws no `resets` item by default).

**0.4 Tests.** Goldens live in `test/golden/<case>.<mode>.txt` (`.ansi` files show ESC as `␛`); cases are self-contained files in `test/fixtures/cases/`. `HUNGERBAR_FS_MAP` (test-only, JSON `{"D:/webapp":"<tmp>/webapp"}`) maps the displayed paths onto temp folders so goldens can show real-looking paths; mapped targets also act as git ceilings.

---


License: MIT (`LICENSE`). Author: Kamal Nady.

# 1. What gets built
Hungerbar is one TypeScript codebase with no runtime dependencies. esbuild bundles it into a single ESM file, `dist/hungerbar.mjs`, which Node 20 or later runs through an absolute `node.exe` path, never through an npm shim.

- **Stdin first.** Every displayed value comes from Claude Code's stdin JSON first. On the render path the only process is node itself.
- **Background work.** Git +/- and the opt-in usage API run in a detached background refresher. The render always shows the last finished value and starts a refresh when it is stale (stale-while-revalidate).

Taken from the runner-up designs:
- **From the Go design:**
  - version at the end of line 2, so the lines are a balanced 66 and 62 columns;
  - a single `git diff HEAD --shortstat --no-ext-diff --no-textconv`;
  - types that tell "absent" apart from 0;
  - the Minecraft theme of hunger pips plus heart containers;
  - `doctor`'s workspace-trust and hook checks;
  - the Windows kill-storm test.
- **From the bash design:**
  - the 🦴 "starving" icon at 90% or more;
  - an integer-maths contract with byte-exact golden tests;
  - `HUNGERBAR_NO_SPAWN`;
  - per-account caches;
  - a mirror step (`hungerbar mirror`) that keeps an offline copy of the source, build and tarball.

# 2. Stack
- **Language:** TypeScript 5.x with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Every stdin field is typed `?: T | null`, so absent is never confused with 0.
- **Bundle:** esbuild produces `dist/hungerbar.mjs`.
  - ESM, with the `#!/usr/bin/env node` shebang, `platform: node`, `target: node20`.
  - Not minified, so it stays readable when vendored. About 40-60 KB.
  - The one file holds the render (the default), plus `refresh`, `setup`, `doctor`, `preview`, `glyphs` and `mirror`.
- **Runtime dependencies:** none.
  - Built-ins only: `node:fs`, `node:path`, `node:os` and `node:url`.
  - `node:child_process` is used only to spawn the refresher and inside it.
  - Global `fetch` is used only inside the usage refresher.
  - Cache keys use FNV-1a; there is no `node:crypto` on the hot path.
- **devDependencies:** `typescript`, `esbuild` and `@types/node`. Tests use `node:test` and `node:assert`. There is no postinstall script.
- **package.json:**
  - `"type":"module"`, `"bin":{"hungerbar":"dist/hungerbar.mjs"}`, `"files":["dist","schema.json","LICENSE","README.md"]`, `"engines":{"node":">=20"}`, `"license":"MIT"`.
  - `"private": true`, which blocks an accidental `npm publish`.
- **Colour:** ANSI 16-colour SGR, so it follows the terminal theme. `NO_COLOR` and `FORCE_COLOR` are honoured.
- **Bun:** it can run the same file but is not used, because it was slower in a parse bench (104 vs 79 ms).

# 3. Repository layout
```
hungerbar/
  package.json  tsconfig.json  build.mjs (esbuild)  schema.json
  LICENSE (MIT)  README.md  SPEC.md (this document = the contract)
  src/
    main.ts            argv dispatch, 2 s deadline, error fallback, single write
    stdin.ts           read + cap + TTY detection
    config.ts          env > hungerbar.json > defaults
    env.ts             now(), flags (HUNGERBAR_NOW, NO_SPAWN, DEBUG timings)
    payload.ts         typed stdin schema + normalize() -> State
    transcript.ts      lazy tail/incremental reader (fallbacks only)
    limits.ts          stdin limits, glitch rule, last-known cache
    git/head.ts        .git discovery + HEAD/ref read (no process)
    git/cache.ts       cache entry read + freshness check
    git/refresh.ts     background worker: git diff --shortstat
    git/bin.ts         absolute git resolution from PATH
    usage/refresh.ts   opt-in OAuth usage worker
    usage/creds.ts     token sources (file / env / macOS Keychain)
    store.ts           cache dirs, atomic write, wx locks, fnv1a
    proc.ts            spawnDetached(), treeKill()
    format.ts          percent, tokens, money, time-left, countdown
    width.ts           display width (wcwidth-lite)
    sanitize.ts        control/ANSI/bidi stripping + length caps
    color.ts  glyphs.ts
    items/model.ts context.ts git.ts limit.ts cache.ts extra.ts scoped.ts version.ts
    layout.ts          join, NBSP, fit-to-width drop order
    cli/setup.ts doctor.ts preview.ts glyphs.ts mirror.ts
  test/
    unit/*.test.ts  golden.test.ts  git.test.ts  transcript.test.ts
    usage.test.ts   setup.test.ts   nonet.test.ts
    fixtures/payloads/*.json   fixtures/state/<case>.json (seeded caches, repo shape)
    fixtures/transcripts/*.jsonl
    golden/<case>.<mode>[.<cols>].txt
    bench/bench.mjs (from cc-like-spawn.mjs)  bench/killstorm.mjs  bench/fake-git.mjs
  .github/workflows/ci.yml   (release.yml only at publish time)
```
`dist/` is not committed. It ships inside the npm tarball, and `hungerbar mirror` copies it.

# 4. Render pipeline (one run)
1. **Deadline.** A 2 s timer prints the best line available and exits. The process always exits 0, because Claude Code shows output only on exit 0. A thrown error prints `<model> · hungerbar error (run hungerbar doctor)`, with the details on stderr (visible under `claude --debug`).
2. **stdin.**
   - On a TTY, the built-in demo payload is rendered (the same as `preview`).
   - Otherwise it calls `fs.readFileSync(0)`, capped at 256 KiB. Over the cap counts as invalid.
   - On EAGAIN, a stream reader takes over. It resolves on the first complete `JSON.parse`, with a 250 ms idle timeout.
   - Empty or invalid input prints `Hungerbar · no data`.
3. **Config:** one read (section 12).
4. **normalize().** Fills `State` using the chains in section 5. The transcript is opened only when a stdin field that is needed is missing.
5. **Git:** branch from disk, diff from cache, and a flag if a refresh is needed (section 9).
6. **Limits:** stdin values, or the last-known values; last-known is persisted only when it changes (section 10).
7. **Layout:** items, then the fit to the width budget (7.4), then sanitising (7.5). Lines are joined with `\n`, and interior spaces become U+00A0 (no leading or trailing spaces; Claude Code trims every line). A line with no items is omitted.
8. **Output:** a single `fs.writeSync(1, buf)`, retried on EAGAIN, with EPIPE ignored.
9. **Refreshers:** after the write, any needed refresher is spawned detached (unless `HUNGERBAR_NO_SPAWN=1`), and the process exits naturally.

When renders happen: on Claude Code events (debounced 300 ms; a new trigger cancels the run in flight), every `refreshInterval` (10 s), and at the one-shot re-run Claude Code schedules for min(rate_limits.*.resets_at, warm prompt_cache.expires_at) + 1 s. So the flip to cold and the limit resets repaint by themselves.

# 5. Items and their exact data sources
| Item (line) | Primary source (stdin) | Fallback chain | Hidden when |
|---|---|---|---|
| Model (1) | `model.display_name` with `/\s*\([\d.]+[kKmM] context\)$/` removed, so `Opus 5.5 (1M context)` becomes `Opus 5.5` | `model.id` with `claude-` and `[1m]` removed, then the transcript's last main-chain `message.model` | never (shows `Claude` if nothing is found) |
| Effort (1, merged: `Opus 5.5 · xhigh`) | `effort.level` (low, medium, high, xhigh, max) | the transcript's last main-chain assistant row `effort` or `perTurnEffort`, used only when its `message.model` equals `model.id`; then env `CLAUDE_CODE_EFFORT_LEVEL`. `settings.json` effortLevel is NEVER read | no source |
| Context bar + % (1) | `context_window.used_percentage` (an integer) | first, round((cu.input_tokens + cu.cache_creation_input_tokens + cu.cache_read_input_tokens) × 100 / context_window_size), where cu = `context_window.current_usage`; then the transcript's last main-chain `message.usage`, ignoring rows from before the latest compact-boundary row (dimmed); otherwise `░░░░░░░░░░ --%` | never |
| Tokens (1, joined to the bar) | `context_window.total_input_tokens` / `context_window.context_window_size` -> `280k/1M` | the sum used for the %; window size from `context_window_size`, else 1000000 if model.id ends in `[1m]` or the display_name says 1M, else 200000 | total is 0 or unknown |
| Folder (1) | basename of `workspace.current_dir` (parsed with path.win32 when it has a drive letter or backslash, else path.posix) | `cwd`, then `process.cwd()` | never |
| Branch (1, `folder@branch`) | `worktree.branch` (only in --worktree sessions) | `.git/HEAD` read from disk (section 9) | not a repo |
| Diff (1, `+1210 -279`) | not on stdin; `cost.total_lines_added/removed` only invalidates the cache | the git cache file written by the background `git diff HEAD --shortstat` | both 0, no cache yet, or git.mode is off |
| 5h limit + time left (2, merged) | `rate_limits.five_hour.used_percentage` + `.resets_at` (epoch seconds); once resets_at has passed, a live window is refilled too: 0% used, no time, not dimmed (1.1.0); a window Claude Code dropped at its reset (the week sent, no five_hour) is refilled the same way, from limits.json (1.2.1, below) | limits.json last-known, dimmed with `~`, used while its resets_at > now; once that has passed it shows `5h ~0%` with no time | no stdin value and no cache, or the account has no 5-hour window (1.1.0, below) |
| Week limit + time left (2, merged) | `rate_limits.seven_day.used_percentage` + `.resets_at` | as for 5h | no stdin value and no cache |
| Scoped weekly, e.g. Fable (2, opt-in) | not on stdin | usage.json `scoped[]` from OAuth `limits[]` entries with kind `weekly_scoped` | `network.scopedWeekly` is false, or there is no data |
| Cache hit + countdown (2, merged) | `prompt_cache.{hit_ratio, warm, expires_at, ttl, caching_observed}` | transcript (old CC, or before the first response of a resumed session): session sums plus the last cached row's timestamp + TTL; the whole item is dimmed with `~` | `caching_observed === false`, or there is no data |
| Extra-usage credits (2) | `rate_limits.spend_limit.{used_usd, limit_usd, used_percentage}` (Claude apps gateway only) | opt-in usage.json `extra` (`extra_usage.is_enabled`, `used_credits`, `monthly_limit` in cents, `currency`); `ExtraView.at` carries usage.json's `at` (null for stdin), for the layers that grey a stale count (1.1.0, data only) | `is_enabled` is false or there is no source |
| Claude Code version (2) | `version` | none (the transcript's `version` is from session start, so it is wrong) | absent |

Rules:
- **Glitch rule (from v1.4.4).** If every window that is present has used_percentage 0 and no resets_at, treat rate_limits as absent.
- **No 5-hour window (1.1.0, amended in 1.2.1; `noFiveHour` and `resolveLimits` in `src/limits.ts`).** The *no-5-hour shape* is `rate_limits` as an object whose `five_hour` is missing, null or an object with neither `used_percentage` nor `resets_at`, with a real `seven_day` (it passes the glitch rule). In 1.1.0 and 1.2.0 the shape alone meant an account with no 5-hour window (an Ultra plan). It does not: Claude Code drops a window once its `resets_at` passes, until Claude's next reply (the status line docs, *Fields that may be absent*, since at least their 21 Oct 2026 copy, and most likely since Claude Code 2.1.243; no capture of a Pro or Max window dropped at its reset exists, and Claude Code 2.1.317 sent the same week-only shape for an Ultra account in a live capture on 4 Nov 2026), so a Pro or Max payload right after a 5-hour reset has the shape too. Since 1.2.1 the shape is the Ultra plan only on one of these, in this order:
  1. the usage API's answer had `"five_hour": null` (usage.json's `fiveHourNone` true, read only while the usage API is on); a `five_hour` object there (`fiveHourNone` false) says the account has a window, whatever else says;
  2. limits.json's flag with its `fiveHourNoneAt` (set by 1.2.1 or later; a flag without it, from 1.1.0 or 1.2.0, is not trusted);
  3. a reply from Claude asked for after the saved 5-hour window's `resets_at`, or, with no window saved, after limits.json's `noFiveHourSince`, while the payload still has the shape: that request went out in the new window, its answer brought the limits, and it had no 5-hour window. When a reply was asked for is the transcript's `askedAt`: the time of the newest main-chain user row (a prompt or a tool result) before the first row of the newest main-chain assistant message with `usage` and an id, not an API error, not `<synthetic>`; a later row of the same message keeps it. It is not the reply row's own time: Claude Code stamps a row when its block has streamed, after the response's headers (in 8,640 local replies the first row came a median 7 s after its request, p99 121 s, and a turn's last reply ended up to 245 s after its request), so a reply still streaming at the reset would read as one in the new window though its headers were the old window's.
  Otherwise the 5-hour is drawn from limits.json: a saved window past its reset is refilled (0% used, no time, not dimmed, as for a live window past its reset), one before it (another session's window, or a plan change mid-window) is last known with `~` and never Ultra, and with none saved it is unknown (`?`, no Session item) and `noFiveHourSince` is set to now, so a fresh install finds Ultra at its first reply asked for after its first render. Ultra makes the 5-hour window null and never last known, and `State.h5None` true: classic draws no Session item, and the HUD still draws its unknown 5-hour (`?`) until its vitals layer reads h5None. limits.json then saves `"five_hour":null,"fiveHourNone":true,"fiveHourNoneAt":<when>`, so a payload with no live five_hour (no rate_limits at all, the glitch rule's, or the shape again in the next session) keeps h5None; a live five_hour clears it, and so does the usage API's `five_hour` object. The evidence is asked lazily: the transcript and usage.json only for the shape, and only when nothing before it settles it. Only the 5-hour window has the rule: a five_hour without a seven_day still falls back to the weekly last known (golden `week-expired`). The goldens: `live-reset-dropped` and `hud-reset-dropped` (the payload after a reset: refilled, and byte for byte what `live-reset-passed` and `hud-reset-passed`, the older payload with the expired window still sent, draw), `ultra-classic` (a window saved ten days ago, a reply asked for after its reset: Ultra), `hud-ultra`, `hud-ultra-boss` and `hud-totem-ultra` (the usage API's null) and `hud-ultra-stale` (the trusted flag); `test/unit/limits-dropped.test.ts` has every path.
- **Newer wins (1.1.0, `newer`).** limits.json keeps, per window, the newer of the saved value and this payload's: the later resets_at; with the same resets_at the higher used_percentage, as use only grows within a window; without both resets, this payload's, as before. Only the fallback file changes: every session still draws its own stdin.
- **Other agents (1.1.0).** Nothing checks who sends stdin; `{}` draws a HUD. README's *Other agents* section is the contract for another tool: the fields read and what each draws, what stays Claude Code's own (the transcript's counts, the usage API, the 5-hour and 7-day windows), `COLUMNS` or `HUNGERBAR_WIDTH` for fitting and centring, and a separate `HUNGERBAR_CACHE_DIR` and `CLAUDE_CONFIG_DIR` per tool, since a payload without rate_limits draws the account's last-known limits (golden `hud-foreign` renders one in a clean cache: no limits).
- **Transcript reader** (only when a fallback needs it):
  - Main-chain rows only: type `assistant`, `isSidechain !== true` and `isApiErrorMessage !== true`.
  - Dedupe by `message.id`; several rows share one id.
  - Session hit ratio = Σcache_read / Σ(cache_read + cache_creation + input_tokens).
  - The TTL of a cached row is `5m` if `usage.cache_creation.ephemeral_5m_input_tokens > 0`, else `1h` if `ephemeral_1h_input_tokens > 0`, else the previous row's TTL.
  - Expiry = the last cached row's timestamp + TTL.
  - Reading is incremental per session_id (byte offset plus running sums, cut at the last `\n`), so the 3.4 MB transcript costs about 20 ms the first time and under 1 ms after that.
  - Before relying on the compact-boundary row shape, check it against a captured post-/compact transcript. If it does not match, the context fallback is unavailable after /compact.

# 6. Default output
## 6.1 Golden fixture `realistic` (pinned before any code exists)
`test/fixtures/payloads/realistic.json`:
```json
{
  "session_id": "00000000-0000-4000-8000-000000000001",
  "transcript_path": "{{TRANSCRIPT}}",
  "cwd": "{{REPO}}",
  "version": "2.1.310",
  "model": { "id": "claude-opus-5-5[1m]", "display_name": "Opus 5.5 (1M context)" },
  "effort": { "level": "xhigh" },
  "workspace": { "current_dir": "{{REPO}}", "project_dir": "{{REPO}}" },
  "cost": { "total_lines_added": 412, "total_lines_removed": 97 },
  "context_window": {
    "context_window_size": 1000000, "used_percentage": 28, "remaining_percentage": 72,
    "total_input_tokens": 279967,
    "current_usage": { "input_tokens": 6, "output_tokens": 812,
      "cache_creation_input_tokens": 1504, "cache_read_input_tokens": 278457 }
  },
  "rate_limits": {
    "five_hour": { "used_percentage": 2.4, "resets_at": 1792876800 },
    "seven_day": { "used_percentage": 86.1, "resets_at": 1792943999 }
  },
  "prompt_cache": { "warm": true, "caching_observed": true, "ttl": "1h",
    "expires_at": 1792862292, "hit_ratio": 0.9744, "requests": 127, "misses": 1 }
}
```
Test state:
- `{{REPO}}` is a temp folder named `webapp` whose `.git/HEAD` is `ref: refs/heads/main`.
- The seeded git cache is fresh and holds +1210/-279.
- `HUNGERBAR_NOW=1792859460`, which makes the 5h time left 17,340 s, the week 84,539 s and the cache 2,832 s.
- COLUMNS is unset and `NO_COLOR=1`.

Expected output (in the raw bytes every interior space is U+00A0):
```
Opus 5.5 · xhigh │ ███░░░░░░░ 28% 280k/1M │ webapp@main +1210 -279
5h 2% · 4h49m │ week 86% · 23h28m │ cache 97% · 47m │ v2.1.310
```
The lines are 66 and 62 columns wide.

## 6.2 Other states (each one is a golden)
- **`cold-extra`.** `prompt_cache.warm=false`, seven_day 93.4, and `rate_limits.spend_limit {used_usd:12.4, limit_usd:50}`:
  `5h 2% · 4h49m │ week 93% · 23h28m │ cache 97% · ❄ cold │ extra $12.40/$50 │ v2.1.310`
- **`ttl-5m`.** ttl `5m`, expires_at = now+252, hit_ratio 0.98: `cache 98% · 4m12s`.
- **`fresh`.** No rate_limits or prompt_cache, `used_percentage` and `current_usage` null, an empty transcript, and limits.json seeded with 2.4 and 86.1. The limits are dimmed:
  ```
  Opus 5.5 · xhigh │ ░░░░░░░░░░ --% │ webapp@main +1210 -279
  5h ~2% · 4h49m │ week ~86% · 23h28m │ v2.1.310
  ```
- **`resumed`.** prompt_cache is absent, and the transcript has a hit ratio of 0.9744 with the last cached row 29 minutes old (1h TTL): `cache ~97% · 31m`, dimmed.
- **`week-expired`.** stdin has no seven_day, and the cached seven_day resets_at has passed: `week ~0%`.
- **`caching-off`.** `caching_observed:false`: there is no cache item.
- **`hit-null`.** `hit_ratio:null`: `cache --` (plus `· ❄ cold` when it is not warm).
- **`no-effort`:** `Opus 5.5 │ ...`.
- **`not-a-repo`:** `Downloads │ ...`.
- **`detached`:** `webapp@a1b2c3d`.
- **`usage-extra`.** usage.json has enabled 1240/5000 USD cents: `extra $12.40/$50`.
- **`usage-scoped`.** Fable at 100%, resetting in 2d3h, placed right after week: `fable 100% · 2d3h`.
- **ASCII mode.** Turned on by HUNGERBAR_ASCII=1, icons=ascii or TERM=dumb. It uses plain spaces, `...` as the ellipsis, and a cold cache shows as `cache 97% / cold`:
  ```
  Opus 5.5 / xhigh | [###-------] 28% 280k/1M | webapp@main +1210 -279
  5h 2% / 4h49m | week 86% / 23h28m | cache 97% / 47m | v2.1.310
  ```

## 6.3 Width goldens
- **COLUMNS=80** (budget 76): `realistic` is unchanged. `cold-extra` drops the version and its line 2 is 73 columns.
- **COLUMNS=60** (budget 56):
  ```
  Opus 5.5 · xhigh │ ███░░░░░░░ 28% │ webapp@main
  5h 2% · 4h49m │ week 86% · 23h28m │ cache 97% · 47m
  ```
- **COLUMNS=40** (budget 36):
  ```
  Opus 5.5 · xhigh │ █░░░░ 28% │ main
  5h 2% · 4h49m │ wk 86% · 23h28m
  ```

# 7. Formatting rules (integer maths; must reproduce the goldens)
## 7.1 Numbers
- **Context %:** the CC integer, or `Math.round` of the fallback, clamped to 0-100.
- **Limit %:** `Math.floor(used_percentage)`, clamped to 0-100. So 2.4 shows 2, 86.1 shows 86, 99.9 shows 99, and 100 shows only at exactly 100.
- **Cache hit:** round half up of hit_ratio × 100, using `Math.floor(x*100 + 0.5 + 1e-9)`. 0.9744 shows 97.
- **Tokens:**
  - under 1000: the number as is;
  - under 999500: `round(n/1000)` + `k`;
  - otherwise: `(n/1e6).toFixed(1)` with a trailing `.0` dropped, + `M`.
  - So 279967 shows `280k` and 1000000 shows `1M`.
- **Money:**
  - The used amount has 2 decimals. The limit has 2 decimals, with `.00` dropped.
  - Currency signs: USD `$`, EUR `€`, GBP `£`. Any other currency is shown as `CODE ` in front of the number.
  - `spend_limit` is in dollars. `extra_usage` is in cents, so divide by 100.

## 7.2 Time
- **Limit time left.** t = resets_at - now, floored to whole minutes (ccstatusline also floors):
  - t <= 0: no time is shown;
  - under 60 s: `<1m`;
  - under 1 h: `47m`;
  - under 1 day: `{h}h{mm}m`, with the minutes zero-padded (`4h49m`, `4h05m`, `23h28m`);
  - otherwise `{d}d{h}h` (`6d3h`).
- **Cache countdown.** r = expires_at - now. It is shown only if `warm === true`, expires_at is not null and r > 0; otherwise it shows `❄ cold`.
  - With ttl `5m`, or r under 120 s: `{m}m{ss}s` (`4m12s`), or `{s}s` under 60 s.
  - Otherwise `{m}m`, floored (`47m`).
  - The TTL always comes from `prompt_cache.ttl` and is never hard-coded.

## 7.3 Bar
- Width W defaults to 10. filled = clamp(floor((pct×W + 50)/100), 0, W), so 28% gives 3 cells.
- Unicode mode uses `█` and `░`; ASCII mode uses `[###-------]`.

## 7.4 Fit to width
Budget B = (HUNGERBAR_WIDTH ?? COLUMNS) - 4 - widthReserve. Claude Code's `statusLine.padding` is not read: `COLUMNS` is the full width, not reduced by it, and Claude Code applies the padding on both sides, so the area it draws is COLUMNS - 4 - 2 × padding (*What Claude Code passes*, §0.9). A render reads no `settings.json`, so a non-zero padding belongs in `widthReserve` twice (`"widthReserve": 2 × padding`), and doctor warns while `widthReserve` is below that. (This line said `- padding` until 2026-10-28, one side of two; no build ever subtracted it.) The HUD's gate and its centring read the same B. If COLUMNS is unset or invalid, nothing is fitted. The steps below run in order until the line fits:
- **Line-1 items:**
  1. drop the tokens;
  2. drop the diff;
  3. shrink the bar from 10 to 5 cells;
  4. truncate the folder to 12 columns with `…`;
  5. drop the folder and keep the branch;
  6. truncate the branch to 16 columns with `…`;
  7. drop the bar and keep the %.
  - Never dropped: model, effort, context %.
- **Line-2 items:**
  1. drop the version;
  2. drop extra;
  3. drop scoped;
  4. in minecraft mode, collapse the pips and hearts to the icon alone;
  5. shorten `week` to `wk`;
  6. drop the cache item;
  7. drop the week time left;
  8. drop the 5h time left.
  - Never dropped: the 5h % and the week %.

The drop order follows the item id, whichever line the config puts the item on. If a line still does not fit, it is emitted as is.

## 7.5 Sanitize every string from stdin, git, the transcript or the API
- Strip CSI (`ESC [ … final`) and OSC (`ESC ] … BEL` or `ESC \`) sequences and any other `ESC x`.
- Strip C0 U+0000-001F, DEL U+007F, C1 U+0080-009F, and the bidi controls U+061C, U+200E, U+200F, U+202A-202E and U+2066-2069.
- Caps: model 40, folder 48, branch 64 code points.

## 7.6 Display width
- 0 for combining marks: U+0300-036F, U+200B-200D and U+FE00-FE0F.
- 2 for East Asian Wide/Fullwidth (U+1100-115F, U+2E80-A4CF, U+AC00-D7A3, U+F900-FAFF, U+FE30-FE4F, U+FF00-FF60, U+FFE0-FFE6) and for emoji U+1F300-1FAFF.
- 1 for everything else, including │ · █ ░ ▰ ▱ ♥ ❄.

## 7.7 Colours (SGR; every span ends with `\x1b[0m`; thresholds are configurable)
- **Model:** `1` (bold).
- **Effort:** low `90`, medium default, high `33`, xhigh `35`, max `1;31`.
- **Context bar and %:** green `32` below 50, yellow `33` from 50 to 79, red `31` at 80 or more. Empty cells are `90`; tokens are `90`.
- **Git:** folder `36`, `@` `90`, branch `35`, `+N` `32`, `-N` `31`.
- **Limits:**
  - the % uses the same thresholds as the context, and the labels and time left are `90`;
  - a last-known item is dimmed as a whole (`2`) and gets a `~`.
- **Cache:**
  - the % is `32` at 90 or more, `33` at 70 or more, otherwise `31`;
  - the countdown is `32`, turning `33` when r is under 20% of the TTL;
  - `❄ cold` is `36`.
- **Extra:** uses its utilization thresholds.
- **Version and separators** (`│`, `·`): `90`.

# 8. Minecraft variant (icons=minecraft, opt-in)
Line 1 is unchanged. On line 2, the 5h window becomes the **hunger bar**: 🍗 (U+1F357, 2 columns) followed by 10 pips of food left, ▰ amber `33` and ▱ `90`. The week becomes **health**: 10 ♥ (U+2665, present in Cascadia Mono), red `31` for hearts left and `90` for spent ones.
- Units left = clamp(floor(((100 - shownPct)×10 + 50)/100), 0, 10).
- At 5h ≥ 90%, the drumstick becomes 🦴 U+1F9B4 ("starving").

Output, colour on, with ANSI stripped (1 red heart and 9 grey):
```
Opus 5.5 · xhigh │ ███░░░░░░░ 28% 280k/1M │ webapp@main +1210 -279
🍗▰▰▰▰▰▰▰▰▰▰ 2% · 4h49m │ ♥♥♥♥♥♥♥♥♥♥ 86% · 23h28m │ cache 97% · 47m │ v2.1.310
```
Line 2 is 78 columns. At 80 columns the version is dropped.

How it degrades:
- **NO_COLOR:** spent hearts print as `·`:
  `🍗▰▰▰▰▰▰▰▰▰▰ 2% · 4h49m │ ♥········· 86% · 23h28m │ cache 97% · 47m │ v2.1.310`.
- **Starving:** `🦴▰▱▱▱▱▱▱▱▱▱ 92% · 1h10m`.
- **Labels:** `minecraft.labels:true` puts `5h ` / `week ` before each icon.
- **Narrow terminal:** the pips and hearts collapse to `🍗 2% · 4h49m` / `♥ 86% · 23h28m`.
- **ASCII mode:** overrides minecraft completely.

`hungerbar glyphs` prints a width ruler for the glyphs that come from font fallback (❄ 🍗 🦴), so Windows Terminal 1.25 with Cascadia Mono can be checked by eye. Every glyph is a single code point with no VS16.

# 9. Git subsystem
## HEAD read (no process, under 1 ms)
- Walk up from the folder, at most 40 levels. Stop at `GIT_CEILING_DIRECTORIES` entries and at the root.
- A `.git` directory is the gitdir. A `.git` file means following its `gitdir: <p>` line, relative to the file. A `commondir` file in the gitdir points to the common dir that holds the refs (worktrees, submodules).
- Read HEAD and trim it (CRLF-safe):
  - `ref: refs/heads/X` shows X;
  - any other `ref:` is shown with `refs/` removed;
  - a 40- or 64-character hex value shows its first 7 characters.
- **Unborn branch:** the ref is in neither `<common>/refs/heads/X` nor `<common>/packed-refs`.

## Cache entry
- File: `git/<fnv1a(lowercase root, forward slashes)>.json`.
- Contents: `{"v":1,"at":<epoch s>,"head":"<HEAD text>","indexMtimeMs":<n>,"edits":"<added>/<removed>","added":<n>,"removed":<n>,"files":<n>}`.
- **Fresh** only when all of these hold:
  - head is unchanged;
  - `.git/index` mtimeMs is unchanged;
  - edits (stdin `cost.total_lines_added/removed`) is unchanged;
  - age is under `git.ttlSeconds` (15).
- So a commit, a stage or a Claude edit invalidates the entry at once.
- The render always shows the cached numbers when there are any. A stale or missing entry starts a refresh after the write.

## Refresher (`hungerbar refresh git <root>`)
- **Spawn:**
  - `spawn(process.execPath, [selfPath, 'refresh', 'git', root], {detached:true, stdio:'ignore', windowsHide:true, cwd:cacheDir}).unref()`;
  - `selfPath` comes from `fileURLToPath(import.meta.url)`.
- **Lock:** `git/<key>.lock` opened with `fs.openSync(p,'wx')`. It counts as stale after 10 s; then unlink it and retry once.
- **git binary:**
  - `HUNGERBAR_GIT_BIN` in tests;
  - otherwise the first `git`/`git.exe` in an **absolute** PATH entry. `.`, empty and relative entries are skipped, and on Windows so is an entry with no drive or UNC share (`\Users\x` means the current drive's, though `path.win32.isAbsolute` calls it absolute); off Windows the file must be executable (1.1.0).
  - The result is cached in `gitbin.json`, keyed by fnv(PATH).
- **Command:** `git --no-optional-locks -C <root> diff HEAD --shortstat --no-ext-diff --no-textconv`. On an unborn branch it is `git --no-optional-locks -C <root> diff --cached --shortstat --no-ext-diff --no-textconv`.
- **Environment:** the inherited env plus `GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=Never LC_ALL=C LANG=C`.
- **Timeout:** `git.timeoutMs` (2000). Then `taskkill /PID <pid> /T /F` on win32. Elsewhere the child is spawned `detached`, so it leads a process group of its own, and `SIGKILL` goes to that group (`-pid`), its children included, else to the pid (1.1.0).
- **Parse:**
  - `/(\d+) files? changed/`, `/(\d+) insertions?\(\+\)/` and `/(\d+) deletions?\(-\)/`;
  - empty output means clean, 0/0.
- **Write:** to a temp file, then `renameSync`, retried 3 times on EPERM/EBUSY. Then remove the lock.
- **Untracked files** are not counted. This is documented and matches v1.4.4.

## Modes
- `swr` (the default): as above.
- `sync`: runs the git command inline, about +160 ms.
- `off`: shows the branch only.

# 10. Cache and state files
## Location
- Windows: `%LOCALAPPDATA%/hungerbar` (for example `C:/Users/you/AppData/Local/hungerbar`).
- macOS: `~/Library/Caches/hungerbar`.
- Linux: `${XDG_CACHE_HOME:-~/.cache}/hungerbar`.
- Override: `HUNGERBAR_CACHE_DIR`.

## Files
- `git/<key>.json`, `git/<key>.lock` and `gitbin.json`.
- `acct-<fnv(CLAUDE_CONFIG_DIR or ~/.claude)>/limits.json`:
  - Contents: `{"v":1,"five_hour":{"pct":2.4,"resets_at":1792876800},"seven_day":{"pct":86.1,"resets_at":1792943999},"at":<epoch>}`.
  - It is written only when the values change, so a normal render writes nothing. Each window keeps the newer value (1.1.0, §5's *Newer wins*).
  - For an account with no 5-hour window (1.1.0, §5) it holds `"five_hour":null,"fiveHourNone":true`, and since 1.2.1 `"fiveHourNoneAt":<epoch>`, when it was found; 1.2.1 trusts the flag only with it. Readers before 1.1.0 ignore the keys and find five_hour null.
  - With no 5-hour window saved and the no-5-hour shape on stdin (1.2.1, §5) it holds `"noFiveHourSince":<epoch>`, the first such render: a reply asked for after it with the shape still there is the Ultra plan. A live five_hour removes it.
  - `hungerbar totem use` (1.2.0, §0.13) rewrites it, setting the windows the used reset refilled to null, so the refill shows at the next live render and `?` until then.
- `acct-…/usage.json` (opt-in):
  - Contents: `{"v":1,"at":<epoch>,"extra":{"enabled":false,"usedCents":0,"limitCents":null,"currency":"USD"},"scoped":[{"name":"Fable","pct":100,"resets_at":<epoch>}],"lockUntil":<epoch>}`.
  - `fiveHourNone` (1.2.1): true when the answer's `five_hour` was null (an Ultra account's answer, 3 Nov), false when it was an object, absent when the answer had no `five_hour` key; a failed fetch keeps the last one. §5's *No 5-hour window* reads it.
  - The token is never stored.
- `acct-…/usage.lock`.
- `transcript/<session_id>.json`:
  - Contents: `{"v":1,"size","offset","sumRead","sumCreate","sumInput","recentIds":[≤64],"lastCached":{"ts","ttl"},"lastUsage","lastModel","lastEffort"}`.
  - Files older than 7 days are pruned, and only by the refresher.
- `previous-statusline.json`, written by setup.
- `capture/`, only with `HUNGERBAR_CAPTURE`; with the usage API on, also `usage-<YYYYMMDD>.json` there (1.1.0, §11).

Every write goes to a temp file and is then renamed. Off Windows the file keeps the mode it had (1.1.0), which the rename would otherwise take from the temp file. A missing or corrupt file is treated as absent.

# 11. Opt-in usage API (off by default)
## When it runs
- On only when `network.usageApi:true` or `HUNGERBAR_USAGE_API=1`.
- Always off when `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or `HUNGERBAR_OFFLINE=1` is set.
- The render spawns `hungerbar refresh usage` only when usage.json is older than `network.ttlSeconds` and the lock is not live. The TTL is 180 s, or 3600 s while extra is disabled and scopedWeekly is off and no limit is hungry. Hungry (1.1.0): a drawn limit (live or last known) is at 10% left or less, or used up; the TTL is then plain `network.ttlSeconds` even with extra disabled. The render reads the limits once and hands the flag to the check. The consent text that names the hourly cadence (setup's, when only scopedWeekly is asked) and README's *Privacy and network* say "once an hour, or every 3 minutes while a limit is at 10% left or less"; schema.json's `scopedWeekly` and `ttlSeconds` say the same in terms of ttlSeconds ("every ttlSeconds while a limit is at 10% left or less").
- The render never waits for the fetch.

## Token
- Sources, in order:
  1. `CLAUDE_CODE_OAUTH_TOKEN`;
  2. `${CLAUDE_CONFIG_DIR:-~/.claude}/.credentials.json` `claudeAiOauth.accessToken`, skipped if `expiresAt` is at or before now;
  3. on macOS, `security find-generic-password -s "Claude Code-credentials" -w`. When CLAUDE_CONFIG_DIR is set, Claude Code appends the first 8 hex digits of its sha256 to the service name, and Hungerbar does the same.
- Never refresh the token, and never write or log it.

## Request
- `GET https://api.anthropic.com/api/oauth/usage`.
- Headers: `Authorization: Bearer <t>`, `anthropic-beta: oauth-2025-04-20`, and an honest `User-Agent: hungerbar/<version>`. If the endpoint ever demands a claude-code UA, drop the feature rather than spoof it.
- Timeout: `AbortSignal.timeout(5000)`.

## Parsing a 200
- `extra_usage.{is_enabled, used_credits, monthly_limit, currency}`.
- From `limits[]`, entries with `kind === "weekly_scoped"` become `{name: scope.model.display_name, pct: percent, resets_at: Date.parse(resets_at)/1000}`. An entry with percent 0 and a null reset that names a model is real data (ccstatusline's rule).

## Errors
- 401/403: lock for 600 s and keep the last digest.
- 429: lock for `Retry-After` seconds (300 if missing).
- Timeout, 5xx or invalid JSON: lock for 30 s.

## Proxy
When HTTPS_PROXY is set, the refresher runs with `NODE_USE_ENV_PROXY=1` where the Node version supports it. `doctor` reports whether it is active.

## By hand (1.1.0)
- `hungerbar refresh usage` is also a command for people (§13): one fetch now, whatever the TTL, and exactly one line on stdout. On success: `extra credits $45.80 left of $50 (fetched now)` (`… used, no monthly limit`, `extra usage is off for this account` or `no extra usage in the answer` otherwise), with `; Fable's weekly 38% left` for each scoped limit while scopedWeekly is on. On an error: `usage API: <what went wrong>; the next try is in <time>`, from usage.json's error and lockUntil.
- Nothing is fetched and no token read while non-essential traffic is off, while the usage API is off in the config (`the usage API is off (network.usageApi); nothing fetched`), or while a 429's lock lasts; another refresh holding the lock is said too. Any other lock (401/403, no token, a failed answer) does not stop a person's ask.
- The render's detached worker runs the same command; its stdout goes nowhere, and the checks it adds are the ones the render made before spawning it.
- The tests hand `refreshUsage` a Keychain reader stub (a parameter, as getToken's), so the real `security` never runs in them.

## Capture (1.1.0)
- With `HUNGERBAR_CAPTURE=<dir>`, a fetch that worked also writes `usage-<YYYYMMDD>.json` (UTC) there, the day's latest: only the parsed answer's `extra_usage` and `limits` keys, never the raw body, its headers or the token. It is there to check the credits' units and an Ultra account's answer against real data.

# 12. Config
Location: `${CLAUDE_CONFIG_DIR:-~/.claude}/hungerbar.json` (for example `C:/Users/you/.claude/hungerbar.json`), or `HUNGERBAR_CONFIG` to override.
- It is strict JSON. A missing file means defaults, and unknown keys are ignored.
- Invalid JSON means defaults plus a dim `cfg!` tag at the end of line 2.
- `schema.json` ships for editor completion, and setup writes its absolute path into `$schema`.

All the defaults:
```json
{
  "icons": "unicode",
  "color": "auto",
  "lines": [["model", "context", "git"],
            ["limit5h", "limitWeek", "scopedWeek", "cache", "extra", "version"]],
  "bar": { "width": 10 },
  "thresholds": { "warn": 50, "danger": 80, "cacheGood": 90, "cacheWarn": 70 },
  "git": { "mode": "swr", "ttlSeconds": 15, "timeoutMs": 2000 },
  "network": { "usageApi": false, "ttlSeconds": 180, "scopedWeekly": false },
  "minecraft": { "labels": false },
  "nbsp": true,
  "widthReserve": 0
}
```
Values:
- `icons`: unicode, ascii or minecraft.
- `color`: auto, always or never.
- `git.mode`: swr, sync or off.
- `lines`: at most 3 lines. Item ids are model (with effort), context, git, limit5h, limitWeek, scopedWeek, cache, extra, version and (1.2.0, opt-in, in no default line) resets.
- `totems` (1.2.0, §0.13): the limit resets you declared, a list of at most 16 `{n, kind, until, at, label}`; `hungerbar totem` writes it, and an expired grant is ignored.

Environment variables take priority over the file:
- `HUNGERBAR_ICONS`;
- `HUNGERBAR_ASCII=1` (automatic when `TERM=dumb`);
- `NO_COLOR` and `FORCE_COLOR`;
- `HUNGERBAR_USAGE_API=1` and `HUNGERBAR_OFFLINE=1`;
- `HUNGERBAR_WIDTH`, `HUNGERBAR_CONFIG` and `HUNGERBAR_CACHE_DIR`;
- `HUNGERBAR_DEBUG=1`, which prints phase timings to stderr.

Test-only variables:
- `HUNGERBAR_NOW` (epoch seconds);
- `HUNGERBAR_NO_SPAWN=1`;
- `HUNGERBAR_GIT_BIN`;
- `HUNGERBAR_CAPTURE=<dir>`, which tees a scrubbed copy of the payload, and (1.1.0) the usage API's answer, its `extra_usage` and `limits` only (§11);
- `HUNGERBAR_USAGE_URL`, accepted only for 127.0.0.1 or localhost.

# 13. CLI
- **`hungerbar`:** render from stdin. On a TTY it renders the demo instead.
- **`hungerbar preview [--payload f.json] [--cols N] [--icons minecraft] [--now T]`.**
- **`hungerbar glyphs`:** the width ruler for each glyph.
- **`hungerbar doctor [--bench] [--check-updates]`.** It reports:
  - the node path and version;
  - which shell Claude Code will use, found in CC's own order: CLAUDE_CODE_GIT_BASH_PATH, then C:/Program Files/Git/bin/bash.exe, then the x86 path, then `<git dir>/../../bin/bash.exe`, and otherwise PowerShell;
  - the current statusLine command, with a warning for npx, an npm shim or backslashes;
  - COLUMNS;
  - the cache dir;
  - the workspace-trust, disableAllHooks and allowManagedHooksOnly caveats;
  - leftover node, git or gh processes Hungerbar started: a `refresh` worker, the git refresher's diff (`--shortstat`) or status (`status --porcelain=v2 --branch`), the PR refresher's `gh pr view --json` with its exact fields (0.7.0), never the user's own git or gh runs. On Windows the list comes from WMI through `[wmisearcher]` in `powershell.exe`, which loads no module (1.1.0: `Get-CimInstance` loads CimCmdlets first, which took 22 to 37 s on a GitHub Windows runner without `PSModulePath`), and holds node.exe, git.exe and gh.exe only; on Linux from every `/proc/<pid>/cmdline`, with no process; on macOS (and other Unixes) from `/bin/ps -A -ww -o pid=,args=` (1.1.0). When it cannot be read (no `powershell.exe` or `ps`, no `/proc` or one with no process in it, an error, over 15 s) doctor warns that leftovers were not checked instead of saying there are none;
  - a timed render using the CC-style spawn.
- **`hungerbar setup [--print] [--direct] [--restore] [--node <path>] [--install-self]`.** It:
  - backs up `settings.json` to `settings.json.bak.<yyyymmdd-hhmmss>`;
  - saves the old statusLine to previous-statusline.json;
  - merges ONLY the `statusLine` key, keeping the order of the other keys;
  - reads BOM and CRLF, and writes UTF-8 without a BOM, with a 2-space indent, keeping CRLF if the file used it;
  - follows symlinks;
  - refuses a read-only settings.json in one line before any question or write, and so does `--restore` (1.1.0): off Windows the rename would replace it, as the folder alone decides. `look` and `icons` refuse a read-only `hungerbar.json` or Windows Terminal `settings.json` the same way, before their backup;
  - with `--print`, shows the diff and writes nothing.
- **`hungerbar totem [<n> [--until <date>] [--kind full|5h|week|fable] [--label <text>] | add [<n>] … | use [--kind …] | clear] [--print]`** (1.2.0, §0.13): the limit resets Anthropic gave you, in `hungerbar.json`'s `totems`, through the look writer's discipline; `use` also forgets the refilled windows in `limits.json`.
- **`hungerbar refresh git <root>`:** internal.
- **`hungerbar refresh usage`:** the usage API's worker, and since 1.1.0 a command for people, in the help and README: one fetch now and one line saying what came back, or nothing fetched while the usage API is off or a 429's lock lasts (§11 *By hand*).
- **`hungerbar mirror <dir>`:** copies the source (without node_modules), dist, schema, README, LICENSE and the current .tgz into a folder. Since 1.0.0 (before its publication) it also copies `docs/`, `scripts/`, `.github/`, `CHANGELOG.md` and `CONTRIBUTING.md`, and it keeps a tarball the folder already has, so earlier releases stay there when the checkout no longer has them. It runs only from a source checkout (an installed release has no `src/`), so the README's command list leaves it out and CONTRIBUTING describes it.

# 14. Install from a tarball (pinned, no per-render download)
1. Build and test it: `npm ci && npm run build && npm test`.
2. Make a pinned install from a tarball:
   - Run `npm pack`, which writes `hungerbar-<version>.tgz`, then `npm i -g ./hungerbar-<version>.tgz`.
   - On Windows it lands at `C:/Users/<you>/AppData/Roaming/npm/node_modules/hungerbar/dist/hungerbar.mjs` (under the npm prefix).
   - Do not use `npm link`, because the live line would follow uncommitted edits.
3. Preview with `hungerbar setup --print`, then run `hungerbar setup`. The draft wrote a launcher, `C:/Users/<you>/AppData/Local/hungerbar/statusline.cmd`:
```
@echo off
"C:\Program Files\nodejs\node.exe" "C:\Users\<you>\AppData\Roaming\npm\node_modules\hungerbar\dist\hungerbar.mjs"
```
   and this into `~/.claude/settings.json`:
```json
"statusLine": {
  "type": "command",
  "command": "exec \"C:/Users/<you>/AppData/Local/hungerbar/statusline.cmd\"",
  "padding": 0,
  "refreshInterval": 10
}
```
   About `--direct`:
   - It writes `"\"C:/Program Files/nodejs/node.exe\" \"C:/Users/<you>/AppData/Roaming/npm/node_modules/hungerbar/dist/hungerbar.mjs\""` instead.
   - That measured 139 ms vs 173 ms, but without the cmd layer that guards against stranded processes.
   - It becomes the default only if the kill-storm test shows no orphans without the launcher. It showed none (§0.5), so `setup` writes the direct command and `--launcher` writes the `.cmd`.
4. Optionally create `~/.claude/hungerbar.json` (icons, usageApi; §12).
5. Check it:
   - `hungerbar preview`;
   - `node dist/hungerbar.mjs < test/fixtures/payloads/realistic.json`;
   - `hungerbar doctor --bench`;
   - `claude --debug` to see stderr.
   - CC re-runs the command as soon as statusLine.command changes.
6. Rollback: `hungerbar setup --restore`. The previous status line comes back from previous-statusline.json.
7. Upgrade: `npm i -g ./hungerbar-<new>.tgz`. The path is the same, so settings are untouched.
8. Offline copy: `hungerbar mirror <dir>` copies the source, the build and the tarball into a folder, after each install or upgrade if you keep one.

# 15. Install for other users (the draft's plan)
1. **Publishing:**
   - Set `"private": false` and re-check the name (`npm view hungerbar` returned 404 on 2026-10-24).
   - Make the GitHub repo public.
   - On a tag, a GitHub Action runs `npm publish --provenance` and attaches `hungerbar.mjs` to the GitHub Release.
2. **A user runs `npm i -g hungerbar`, then `hungerbar setup`.** Setup writes the command for the platform:
   - **Windows with Git Bash:** the .cmd launcher plus `exec "…/statusline.cmd"`, as above.
   - **Windows without Git Bash** (CC runs the command in PowerShell): `& "C:/…/hungerbar/statusline.cmd"`. Before release, CI must confirm that UTF-8 bytes pass through unchanged; if they don't, setup sets icons=ascii for this path.
   - **macOS and Linux:** `'<process.execPath>' '<npm root -g>/hungerbar/dist/hungerbar.mjs'`, a `'` inside a path written `'\''` (1.1.0).
   - `doctor` flags nvm, fnm or volta version-specific execPaths and offers `--node bare` (about +6 ms).
3. **Without npm:** download `hungerbar.mjs` from the release and run `node hungerbar.mjs setup --install-self`. It copies itself to `<data>/hungerbar/app/` and wires that copy.
4. **README:**
   - It never puts `npx`/`bunx` in the command; the shim was measured adding about 180 ms to every render.
   - It documents the manual settings block, the `echo '{…}' | hungerbar` mock test, and uninstalling with `hungerbar setup --restore && npm rm -g hungerbar`.
   - There is no update check on the render path.

# 16. Test plan
1. **Golden tests** (the contract).
   - **Runner:**
     - copies `fixtures/state/<case>.json` into a temp `HUNGERBAR_CACHE_DIR`, writing the git cache under the computed key with matching head and index mtime;
     - builds a temp repo of the described shape;
     - fills in `{{REPO}}`/`{{TRANSCRIPT}}`;
     - sets `HUNGERBAR_NOW=1792859460` and `HUNGERBAR_NO_SPAWN=1`;
     - runs `node dist/hungerbar.mjs`;
     - compares the stdout bytes and the cache files written afterwards.
   - **Updates:** `npm run golden:update` regenerates the files. The 8 goldens in sections 6 and 8 are written by hand from this spec first, and the code must match them.
   - **Cases:**
     - realistic, cold-extra, ttl-5m, fresh, resumed, week-expired;
     - glitch-zero, caching-off, hit-null, cache-expired (warm=true but expires_at < now);
     - no-effort, effort-from-transcript, ctx-pct-null, post-compact, ctx-200k;
     - not-a-repo, detached, worktree-file, submodule, unborn, packed-refs, crlf-head;
     - unc-path, spaces-path, arabic-folder;
     - injection (ESC/OSC 8/bidi in display_name, folder and branch);
     - big-payload (16 KB), oversize (300 KB), invalid-json, empty-stdin;
     - gateway-spend, usage-extra, usage-scoped;
     - old-cc (no prompt_cache or effort).
   - **Modes:**
     - plain (NO_COLOR), colour (.ansi with the escapes made visible), ascii, minecraft and minecraft-nocolor;
     - widths unset, 80, 70, 60 and 40 for realistic, cold-extra and minecraft.
2. **Unit tests:**
   - format boundaries (0, 59 s, 1m59s, 2m, 59m, 1h, 23h59m, 1d) and floor rounding;
   - percent cases (99.9, 100, 0.4) and tokens (279967, 999499, 999500, 1000000, 1250000);
   - money and currencies;
   - suffix stripping;
   - width (CJK, emoji, combining marks);
   - sanitize;
   - the effort chain (a fixture with settings.json effortLevel `medium` must still show `xhigh`);
   - the glitch rule;
   - the scoped placeholder rule.
3. **Transcript tests:**
   - synthetic JSONL with duplicate message.ids, sidechain, API-error and attachment rows, and a truncated last line;
   - a scrubbed fixture derived from a real session must give a 0.9744 hit ratio;
   - incremental reading must equal a full scan;
   - the compact boundary must be respected.
4. **Git tests:**
   - temp repos made with `git init` for every shape above;
   - a `git.exe` planted in the repo root must never run;
   - a fake slow git (`bench/fake-git.mjs`, via HUNGERBAR_GIT_BIN) to check the timeout and the tree-kill;
   - the stale-while-revalidate flow (stale entry, refresher spawned, file written, next render correct);
   - lock contention and stale-lock recovery;
   - a de-DE environment must still parse, because of LC_ALL=C.
5. **Non-blocking:** with a fake git that sleeps 3 s, the render must not exceed the spawn floor + 100 ms.
6. **No-network guard:** with `fetch` and `net.connect` stubbed to throw, a render with the default config passes and no usage refresher is spawned.
7. **Usage refresher** against a local mock server:
   - 200, 401 (600 s lock), 429 with Retry-After, a timeout, invalid JSON, and is_enabled=false;
   - assert the token never appears in argv, logs or cache files.
8. **setup tests:**
   - a temp CLAUDE_CONFIG_DIR with a BOM+CRLF settings.json, an existing ccstatusline command, a symlinked file and a missing file;
   - `--print` writes nothing;
   - the backup exists;
   - `--restore` round-trips byte for byte;
   - the order of the other keys is kept.
9. **Windows kill-storm** (`bench/killstorm.mjs`):
   - 500 CC-style spawns through Git Bash, each killed at a random 0-60 ms;
   - afterwards `tasklist` must show no leftover hungerbar node.exe or git.exe, and no console window may flash;
   - run it with both the launcher and `--direct`.
10. **Performance:** `npm run bench` uses cc-like-spawn.mjs (Git Bash wrapper shell, payload piped, median of 15) against the budgets in section 17. CI asserts that the in-process time is at most 15 ms.
11. **CI matrix:**
   - windows-latest (Git Bash, plus the PowerShell fallback path), ubuntu-latest and macos-latest;
   - each with Node 20, 22 and 24.
12. **Contract capture:** `HUNGERBAR_CAPTURE` saves each new Claude Code version's payload, scrubbed of the session id, the transcript path, the scratchpad folder (`scratchpad_dir`, new in 2.1.317, as `{{SCRATCHPAD}}`, 1.2.1) and the workspace paths, as a new fixture.
13. **A week of real use** on Windows Terminal 1.25 with Cascadia Mono, running alongside ccstatusline:
   - 5h and week must match `/usage`;
   - the flip to cold must repaint at expires_at + 1 s;
   - `/effort` changes must show within one render;
   - +/- must equal `git diff HEAD --shortstat`;
   - check the widths of ❄ 🍗 🦴 with `hungerbar glyphs`.

# 17. Performance budgets
Measured on the development machine (Windows 10) with the CC-style harness. Expect about ±15% noise.

| Path | Measured | Budget |
|---|---|---|
| Git Bash floor (`true`) | 79.8 ms | n/a |
| hungerbar `--direct`, cache hit | 139.3 ms | ≤ 160 ms |
| hungerbar via the .cmd launcher (default) | 172.7 ms | ≤ 200 ms |
| stale render that also spawns the refresher | 173.1 ms | ≤ 215 ms |
| sync git mode | 302.7 ms | opt-in only |
| ccstatusline today (npm shim) | 665.7 ms | to beat |

- In-process work: at most 15 ms.
- First render of a resumed 3.4 MB transcript: at most +25 ms (a full scan measured 19.9 ms; incremental reads are under 1 ms).
- Network calls on the render path: 0.
- CPU at refreshInterval 10: about 1-2% of one core.

# 18. Build steps in order
1. Scaffold the repo:
   - package.json (`private:true`), tsconfig, build.mjs, LICENSE, .gitignore;
   - write SPEC.md from this document;
   - first commit.
2. Fixtures:
   - capture one real payload with a throwaway capture build;
   - hand-write the 8 pinned goldens from sections 6 and 8, plus the fixture payloads and state files.
3. Core: stdin, sanitize, width, format, color, glyphs, config, payload normalize, the items and layout. Make the stdin-only goldens pass, including widths and ASCII.
4. Git: the HEAD reader, cache freshness, the refresher, locks, absolute git resolution and the tree-kill. Then the git tests and the non-blocking test.
5. Limits: last-known values, the glitch rule and per-account directories.
6. The transcript fallback (lazy and incremental), then its tests.
7. The Minecraft theme, then its goldens.
8. CLI: preview, glyphs, doctor, setup (`--print`, `--restore`, `--direct`), mirror. Then the setup tests.
9. Bench, kill-storm and the no-network guard, compared against the section 17 budgets.
10. The opt-in usage refresher (extra, scoped weekly, creds, locks), then the mock-server tests.
11. Install: `npm pack`, `npm i -g` from the tarball, `hungerbar setup`, and `hungerbar mirror` for an offline copy. Then a week of real use.
12. CI workflow, once a GitHub repo exists.
13. Publish preparation: README with screenshots, the name check, release.yml with provenance, and `private:false`.

Effort: about 4-5 focused days, which is roughly 3 Claude Code sessions (steps 1-3, 4-8, 9-11).

# 19. Out of scope for v1
- Session cost and burn rate.
- OSC 8 links.
- Truecolor themes.
- `subagentStatusLine`.
- PR status.
- Any update check on the render path.
- Counting untracked files in +/-.