# Changelog

What changed for users in each version. Versions before 1.0.0 were private builds; 1.0.0 is the first public release.

## 1.0.1 (unreleased)

- **`hungerbar doctor` lists processes without loading a PowerShell module.** It looked for leftover refreshers through `Get-CimInstance`, which loads the CimCmdlets module first. Where `PSModulePath` is not set and many modules are installed, as on GitHub's Windows runners, that took 22 to 37 seconds. The same WMI query now goes through `[wmisearcher]` and takes about a quarter of a second anywhere.
- **doctor no longer says "no leftover" when it could not look.** If the process list cannot be read (no `powershell.exe`, an error, or over 15 seconds), doctor warns that leftovers were not checked.

## 1.0.0 (2026-10-28)

The first public release. The Minecraft HUD is now the default look.

- **New defaults.** With no `hungerbar.json`, you get the HUD with Fable's boss bar, centred, your user name before the folder, your name in gold while Claude Code runs as Administrator, the bed and the phantoms.
- **The network stays off until you say yes.** The usage API (which Fable's weekly limit needs) and the pull request status are still off by default, also with no `hungerbar.json` or an invalid one. `hungerbar setup` explains each one and asks, with yes pre-selected. When setup asks no questions (no terminal, or flags), it prints the command that turns on what still waits for your yes.
- **setup pre-selects every default,** so pressing Enter through the questions gives the full setup. With a `hungerbar.json`, Enter keeps what it has. The two network questions pre-select yes unless the file sets the key they ask about (`network.usageApi`, `network.scopedWeekly` or `hud.pr`). A no to either is saved (`"pr": "off"`, or `"usageApi": false` or `"scopedWeekly": false`), so the next setup keeps it.
- With the usage API already on, setup asks only about Fable's weekly (`network.scopedWeekly`).
- After a change, `hungerbar look` prints the way back, with the Fable option you had, and says how to turn the usage API off again.
- `hungerbar preview` turns the usage API on in memory only for an explicit `--fable`.
- **The boss bar has no name.** The line under it already names the model in use, so the word Fable is gone from the start of the boss bar. The bar, the % left and when it is full again stay where they were, right over the hotbar.
- A payload piped with a UTF-8 BOM, as Windows PowerShell 5.1 sends it, renders like one without.
- When `CLAUDE_CODE_OAUTH_TOKEN` is set, the usage API's consent text names it, because the refresher reads it before `.credentials.json`.
- The README has pictures and GIFs made from real renders.

## 0.7.0 (2026-10-28)

- **Git state.** ⎇ and the branch are coloured by your files and commits, with short marks for a merge, rebase or cherry-pick in progress, conflicts, new files, and commits to push or pull.
- **Pull request and CI status** (`hud.pr`, opt-in). The branch's pull request, its checks and its review, from your own `gh`.
- **Your name and the operator's mark** (`hud.user`, `hud.op`). Your name before the folder, and a mark while Claude Code runs as Administrator or root.
- **The bed** (`hud.bed`) after 5 minutes without a message, but not while a tool is still running, and **the phantoms** (`hud.phantoms`) when a session runs long.
- setup asks for the name, the operator's mark and the PR status. `look` and `preview` take the new options, and `doctor` shows them.
- `hungerbar doctor` lists a stranded background `git status` or `gh pr view`, says what `git.mode off` still shows, and says whether the terminal runs elevated even while `hud.op` is off.

## 0.6.0 (2026-10-28)

- **Centred HUD** (`hud.align`). The hotbar sits in the middle of the status line, like Minecraft's, and follows the window's width.
- `widthReserve` is now advised at twice `statusLine.padding`, since Claude Code pads both sides. `doctor` warns until it is.

## 0.5.1 (2026-10-27)

- **The hotbar's frame.** A thin edge under the hotbar, and a frame around the offhand that turns green while the extra credits pay.

## 0.5.0 (2026-10-27)

- **The Minecraft HUD** (`"look": "hud"`, opt-in at the time). Hearts and food around a hotbar, the context as the XP bar, the prompt cache as air bubbles, and the last two hours of git as terrain.
- **Fable's weekly limit** on the HUD (`hud.fable`): `tail`, `tooltip`, `boss` or `beacon`.
- `hungerbar look` shows or switches the look. setup asks for it, with previews.
- The prompt count includes prompts sent while Claude was working.
- setup keeps the current look when you press Enter, refuses unknown options, and refuses an unreadable `settings.json` before it asks anything.

## 0.4.0 (2026-10-25)

- The icons and the % now both count what is left. `"limits": "used"` makes both count what is used.

## 0.3.0 (2026-10-25)

- **Two icon styles.** `hungerbar icons plain|colour` switches Windows Terminal's font face between plain glyphs and colour emoji, with a backup.

## 0.2.0 (2026-10-25)

- Hearts for the 5-hour window and ten drumsticks for the week. In Minecraft food refills your hearts, as the weekly budget refills each 5-hour window.
- A pie timer (● ◕ ◑ ◔ ○) for the prompt cache.

## 0.1.2 (2026-10-24)

- Nothing changed for users. For contributors: `mirror`, which copies a source checkout (see CONTRIBUTING.md), stores `.gitignore` as `gitignore` in the copy.

## 0.1.1 (2026-10-24)

- `hungerbar doctor` times the live command without touching the real caches.

## 0.1.0 (2026-10-24)

- The first build: the Classic Plus status line. Three lines with the model, the thinking effort, the context, the git branch and changes, the 5-hour and weekly limits, the prompt cache, the extra credits, the folder and the version, fitted to the window's width.
- Git changes come from a background refresher, so the status line never waits on git.
- The last known limits show dimmed when Claude Code passes none.
- The opt-in usage API for the extra credits.
- `hungerbar setup`, `setup --restore`, `doctor`, `preview` and `glyphs`.
