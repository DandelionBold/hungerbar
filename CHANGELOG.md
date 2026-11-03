# Changelog

What changed for users in each version. Versions before 1.0.0 were private builds; 1.0.0 is the first public release.

## 1.2.0 (2026-11-03)

The totem now stands for a limit reset Anthropic gave you, not for your extra credits.

- **The totem is your limit reset.** In 1.1.0 the totem followed your extra credits. That was a misreading: the Totem of Undying is meant for the limit resets Anthropic sometimes gives (Settings → Usage → Resets). Now, while you hold one, the totem waits in hotbar slot 5. When a limit it can refill drops to 10% left or less, it moves to your offhand and the emerald, your credits, moves to slot 5: a reminder that you can reset the limit instead of paying. At 0 its frame turns gold, and it pops for 30 seconds when Hungerbar sees that moment. The HUD never uses a reset for you.
- **A bigger totem.** The ☥ was a speck. The totem is now a golden idol with raised wings and green eyes, centred in its slot, picked in round 10 of the design picker. It does not stack, as in Minecraft: you see one totem however many resets you hold, and `hungerbar totem`, `look` and `doctor` say how many.
- **The last day.** In a reset's last 24 hours a yellow `!` appears beside the totem, which steps aside to make room.
- **No totem without a reset.** With none declared, slot 5 and the offhand are as `hud.totem off` drew them in 1.1.0. The emerald keeps its count past $99, its grey old count and its grey frame when the credits are out.
- The totem's memory file is smaller and exists only while you hold a totem.
- **`hungerbar totem`** tells Hungerbar about your limit resets (Settings → Usage → Resets), because Claude Code does not pass them to status lines: `hungerbar totem 1 --until 2026-12-01` says you hold one, to use by the end of that day. `--kind full|5h|week|fable` says which limits it refills (`full`, the 5-hour window, the week and Fable's weekly, is the default), `add` adds a grant with its own expiry, `use` takes off the one that expires first, `clear` forgets them all, and `hungerbar totem` alone says what you hold. `--print` shows the change and writes nothing.
- It writes the new `totems` key in `hungerbar.json` the way `look` writes its keys: after a backup, every other key in its place, and the way back printed. A reset that expires is ignored from that moment and removed at the next write. Nothing about it uses the network.
- **`use` lets a refill show at once.** It also makes Hungerbar forget the last limits it saved for the windows the reset refilled, so a render without live limits no longer shows the old use with `~` until the window's own reset. Fable's weekly comes from the usage API and refreshes within 3 minutes.
- `hungerbar look` and `doctor` say how many resets you hold, of which kinds and until when. `doctor` warns about a reset that expired, an entry it cannot read, a 5-hour reset on an account with no 5-hour window, and a Fable reset while Fable's weekly is off. `hungerbar setup` ends with how to declare one when the HUD has none.
- `schema.json` describes `totems` for your editor.
- **The classic lines can show your resets:** add `resets` to `lines` for `☥ Limit resets: 1 (use by 2026-12-01)`. Its count turns yellow while a limit a reset can refill is at 10% left or less, and red once that limit is used up. It is in no line by default, so the classic lines look as before, and it is the first item to go when a line is too wide.
- **The README's pictures show 1.2.0.** `anatomy.png`, `hero.gif`, `idle.gif`, `center.gif`, `frame.gif`, `fable.gif`, `git.gif`, `pr.gif` and `setup.gif` are made again from 1.2.0's renders with one limit reset declared, so the golden idol waits in slot 5 where 1.1.0's ☥ was. The anatomy numbers the totem as its own part, 20; `hero.gif` ends with the totem moving to the offhand and the emerald to slot 5; `frame.gif` shows the pop, then the totem staying gold while the credits pay in slot 5; and `setup.gif` ends with how to declare a reset. A new `totem.gif` shows the totem's day: waiting, the move at 7%, the pop at 0, the credits paying, and the reset used. `classic.png` is untouched.

## 1.1.0 (2026-11-02)

The HUD learns the Totem of Undying, the pickaxe's tool tiers and the bees, and the hearts tell more.

- **Golden hearts on the Ultra plan.** An account with no 5-hour limit used to get a grey `?` and ten dark hearts, which read as "no health left". Now it gets the golden apple: the day's ☼, a bold gold ∞ where the 5-hour % goes, and ten gold hearts, Minecraft's absorption hearts. `hud.ultra off` brings 1.0's look back.
- **Limits that are not live are marked `~`.** When Claude Code sends no limits and Hungerbar shows the last ones it saved, the HUD now marks them as the classic lines do: a grey `~` before the %, and the red hearts, the drumsticks and the % drawn dimmer. Before, an hours-old 98% looked current. Live limits look as before, and with nothing saved the `?` stays.
- **Poisoned hearts while the credits pay.** When the 5-hour window is used up and your extra credits pay, the hearts show how much of the credits is left, in poison green, at least one while anything is left, and the day's sun or moon takes the skull's place. When the credits run out, the skull is back. A used-up week changes nothing on the hearts. `hud.poison off` brings back 1.0's skull and dark hearts.
- `hungerbar look hud`, `setup` and `preview` take `--ultra on|off` and `--poison on|off`; both are on by default. `hungerbar look` and `doctor` say what they show. The three hearts-line looks above were picked in round 9 of the design picker.
- **The Totem of Undying.** While you have extra credits, the HUD now carries a gold totem ☥, the way a Minecraft player keeps one for a bad fight: it waits in hotbar slot 5 while your limits are fine. When the 5-hour window or the week drops to 10% left or less, it swaps into the offhand, ☥ with your dollars where the emerald was, so you can see the credits are about to take over. When a window hits 0 it pops there for 30 seconds, ☥✦ between gold sides, with the frame's edges gold too; then the green paying emerald is back, and the totem is used up until the window resets. No credits, no totem. `hud.totem off` brings back 1.0's slot 5 and offhand (the fixes below, which have no setting, still apply). Hungerbar remembers the last render's hearts in a small file per session, so it sees the moment the window hits 0.
- **The emerald shows real dollars past $99.** The offhand had two cells for its count, so $500 of credits showed a yellow 99, as if you had $99. From $100 the emerald gives up its spare cell: ◆100 to ◆999, then ◆ 1k to ◆99k, and a yellow ◆99k from $100,000. Below $100 nothing changes. The totem's count works the same way.
- **An old credits count turns grey.** When the extra credits come from a usage API answer more than 15 minutes old, their count is drawn in grey instead of white, so you know it may be out of date. The emerald or the totem keeps its colour.
- **No more green frame with no credits left.** When a limit was used up and the credits were at $0, 1.0 still lit the offhand's frame green, as if the credits paid. Now it stays grey around the empty well.
- `hungerbar look hud`, `setup` and `preview` take `--totem on|off` (on by default); `hungerbar look` and `doctor` say what it shows, and doctor counts the totem's files. The totem was picked in round 9B of the design picker, round 9's follow-up, and the emerald's count in round 9.
- **Your agents at work fly in the sky.** When Claude Code runs subagents, or a workflow's agents as Ultracode does, the HUD now shows each one at work in line 1's sky after the cache readout: a striped bee flying home to its hive ▤, up to four, then a count such as +2. An agent counts as at work while its file in the session's subagents folder was written in the last minute. Nothing shows while none works, whether Ultracode is on or off, and the phantoms keep their own part of the sky.
- **Allays, the calm option.** `hud.agents allays` shows Minecraft's friendly blue allays instead of the bees; `off` shows nothing and never reads the folder. `hungerbar setup` asks which you want, with a preview of each; Enter keeps the bees on a new install, or what your `hungerbar.json` already has.
- **How it knows about the agents.** The status line itself reads no folder. The transcript's background worker looks at the session's subagents folder about every 10 seconds while the session uses agents, and reads only the agent files' names and times, never what is in them, so a new agent shows a few seconds late. From the session transcript it also notes whether Ultracode is on; neither look draws that by itself.
- **The pickaxe's material follows the model.** The pickaxe in hotbar slot 1 and its effort numeral take the model's tool tier. The numeral was always the enchant pink in 1.0; with colour icons ⛏ is an emoji that keeps its own colours, so there the numeral shows the tier. `hud.pickaxe plain` brings back 1.0's colours.

  | Model | Tier | Colour (1.0's pickaxe) |
  |---|---|---|
  | Fable | netherite | `#857579` (`#9D8F8F`) |
  | Opus | diamond | `#55FFFF` (the same) |
  | Sonnet | iron | `#C6C6C6` (`#D8D8D8`) |
  | Haiku | gold | `#FFAA00` (`#8F8F8F`) |
  | any other | stone | `#AAAAAA` (the same) |

- `hungerbar look hud`, `setup` and `preview` take `--agents off|allays|bees` (bees by default) and `--pickaxe tiers|plain` (tiers by default); `hungerbar look` and `doctor` say what they show, and `hungerbar preview --situation agents` shows a day with three agents at work. The bees were picked in round 9B of the design picker and the pickaxe's tiers in round 9C; the allays were round 9's pick.
- **The README's pictures show 1.1.0.** `anatomy.png`, `hero.gif`, `idle.gif`, `center.gif`, `frame.gif`, `fable.gif`, `git.gif`, `pr.gif` and `setup.gif` are made again from 1.1.0's renders, with the totem in slot 5, the tier numerals and Fable's netherite pickaxe. The anatomy also shows three bees, and points at them and at the totem with their rows' numbers; `hero.gif` ends with the totem swapping into the offhand; `frame.gif` shows the totem's pop and the poisoned hearts before the green frame; and `setup.gif` asks the seventh question. `classic.png` is untouched.
- **Hearts and drumsticks refill at the reset.** Claude Code draws the status line again when a limit's window resets, and that render now shows the window full: 100%, with no clock. Before, it kept the old window's use until Claude Code sent new numbers.
- **An account without a 5-hour window (Ultra) shows none.** When Claude Code sends a weekly limit and no 5-hour window, Hungerbar no longer fills the gap with the last 5-hour value it saw, which came from another plan or account. The classic lines leave the Session item out, and the HUD shows the golden hearts (above). Hungerbar remembers it, so a render without any limits does not bring the old value back; a 5-hour window from Claude Code ends it.
- **Several sessions no longer turn the last-known limits back.** With more than one Claude Code session on an account, the session that rendered last decided the limits shown when Claude Code sends none, even when its numbers were older. Now each window keeps the newest numbers: the later reset, or with the same reset the higher use. Each session still draws its own limits.
- **The usage API checks more often when a limit runs low.** With no extra usage and Fable's weekly off, it asked once an hour; now it asks every 3 minutes (`network.ttlSeconds`) while a limit is at 10% left or less. setup's consent text, the README and `schema.json` say so.
- **`hungerbar refresh usage`** asks the usage API right away and prints one line: the extra credits left (and Fable's weekly, with `network.scopedWeekly` on), or what went wrong and when the next try is. It fetches nothing while the usage API is off or a rate limit lasts.
- With `HUNGERBAR_CAPTURE` set, a usage fetch also saves the day's answer, only its `extra_usage` and `limits`, so its units can be checked against real data. The token and the headers are never saved.
- **The README has an "Other agents" section:** the fields Hungerbar reads from stdin and what each draws, what stays Claude Code's own, the width it needs, how to keep another tool's caches apart from Claude Code's, and a wrapper for a tool with other field names.
- **The tests run on Windows, Linux and macOS.** Every change is now tested on all three. The HUD's glyphs and widths were still checked by eye in Windows Terminal only; elsewhere, `hungerbar glyphs --hud` shows whether your terminal draws each one at its width.
- **A folder name over 255 bytes no longer breaks the status line on macOS and Linux.** Such a name made a file check fail there, and the whole line showed "hungerbar error". Now that folder is simply not a repo of its own, and the line draws as usual.
- **A git or gh that runs past its time limit is killed with its own child processes on macOS and Linux,** as on Windows. Before, only the process itself was killed there.
- **A read-only settings file is left alone.** On macOS and Linux, `setup`, `look` and `icons` replaced a read-only `settings.json` or `hungerbar.json` anyway. Now they say it is read-only and change nothing, before making a backup, on every OS; `setup --restore` does the same. A file they do write keeps its permissions, so a `settings.json` at 0600 stays 0600.
- **`hungerbar doctor` checks for leftover background processes on macOS and Linux too,** from `/proc` on Linux and `ps` on macOS. When there are none, it now says "no leftover Hungerbar worker, git or gh" on every OS.
- `setup` writes a command that works on macOS and Linux when a path has a `'` in it.
- Looking for git and `gh` on `PATH` skips a Windows entry without a drive letter (`\Users\x`, which means the current drive), and on macOS and Linux a file that is not executable.
- **`hungerbar doctor` lists processes without loading a PowerShell module.** It looked for leftover refreshers through `Get-CimInstance`, which loads the CimCmdlets module first. Where `PSModulePath` is not set and many modules are installed, as on GitHub's Windows runners, that took 22 to 37 seconds. The same WMI query now goes through `[wmisearcher]` and takes about a quarter of a second anywhere.
- **doctor no longer says "no leftover" when it could not look.** If the process list cannot be read (no `powershell.exe`, `ps` or `/proc`, an error, or over 15 seconds), doctor warns that leftovers were not checked.
- **The README has an "Install with your AI" section:** what to tell your assistant, and the steps it follows, asking you before it turns on anything that uses the network.

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
