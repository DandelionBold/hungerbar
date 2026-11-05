<p align="center">
  <img src="docs/media/hero.gif" alt="Hungerbar's Minecraft HUD in Claude Code's status line over a five-hour session: hearts and food drain, the XP bar fills, commits turn the terrain gold, a bed shows during a break, phantoms come late in the session, a boss bar shows Fable's weekly limit, and the totem leaves slot 5 for the offhand as the 5-hour window runs low" width="100%">
</p>

# Hungerbar

**Your Claude Code limits as a Minecraft HUD, right in the status line.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Version 1.2.1](https://img.shields.io/badge/version-1.2.1-blue.svg)](https://github.com/DandelionBold/hungerbar/releases/tag/v1.2.1)
[![Node 20 or newer](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![Platform: Windows Terminal](https://img.shields.io/badge/platform-Windows%20Terminal-0078D4.svg)](#requirements)
[![CI](https://github.com/DandelionBold/hungerbar/actions/workflows/ci.yml/badge.svg)](https://github.com/DandelionBold/hungerbar/actions/workflows/ci.yml)

Hearts are your 5-hour window. Drumsticks are your week. The XP bar is your context. The last two hours of git grow as terrain in the hotbar.

**Quick start.** With Claude Code and Node.js 20 or newer, run these two commands in a terminal, one after the other, and answer setup's questions (Enter takes each default):

```bash
npm i -g https://github.com/DandelionBold/hungerbar/releases/download/v1.2.1/hungerbar-1.2.1.tgz
hungerbar setup
```

Or let your AI do it: tell Claude Code `Install Hungerbar for me: https://github.com/DandelionBold/hungerbar`. [Install with your AI](#install-with-your-ai) has the steps it follows.

[Install](#install) has the requirements, what to type if PowerShell says running scripts is disabled, and what setup changes.

- [What it is](#what-it-is)
- [Anatomy](#anatomy)
- [Features](#features)
- [Install](#install)
- [Configuration](#configuration)
- [Commands](#commands)
- [The classic look](#the-classic-look)
- [Privacy and network](#privacy-and-network)
- [Other agents](#other-agents)
- [How it stays fast](#how-it-stays-fast)
- [Troubleshooting](#troubleshooting)
- [Uninstall and rollback](#uninstall-and-rollback)
- [Contributing](#contributing), [License](#license), [Trademarks](#trademarks)

## What it is

Claude Code can run a command of your choice to draw a status line under its prompt. Hungerbar is that command. On each render, Claude Code passes it the model, the context, the cost, your 5-hour and weekly limits and the prompt cache. Hungerbar adds your git state and draws it all as Minecraft's HUD:

- **Hearts** show what is left of the 5-hour window. **Drumsticks** show what is left of the week.
- The **XP bar** is the context. The **level** counts the times it was compacted.
- **Air bubbles** are the prompt cache. They pop as it cools.
- The **hotbar** holds the thinking effort, your prompts, the session's cost and the last two hours of git as terrain.
- The **branch** shows what git is doing. It can also show the pull request and its checks.
- **Bees** fly home across the sky while Claude Code's subagents work.
- The **totem** is a limit reset Anthropic gave you, once you tell Hungerbar about it.

Hungerbar is one JavaScript file with no runtime dependencies. It never uses the network while it draws, and it runs git only in the background (unless you set `git.mode` to `sync`). Its network features stay off until you say yes.

In plain text, a normal day looks like this (at the left edge, without your name or colours):

```
Opus 5.5 Efficiency III                   ◦ ○ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉ 4m12s · hit 98%
☼ 4h49m     98% ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥                       🍗🍗 18% ↻ 3d23h
81k/1.0M ▂▂▂▂▂▂ ▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂ 8%  ⌂ D:/webapp
v2.1.306  ◆ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      🬌••🬍       ▅▆▆ ▆▅▆▆ ▀▀▂▂  +1208 -279  ⎇ main
⠀⠀⠀⠀⠀⠀⠀⠀⠀🮂🮂🮂🮂🮂🮂⠀🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂
```

## Anatomy

![The HUD drawn large, with its 26 parts numbered in reading order](docs/media/anatomy.png)

This is one render. The Claude Code session is about four and a half hours old and the context was compacted twice. Those are two signs of a long session, so two phantoms fly in the sky. Fable is in use, so the boss bar shows and the pickaxe is netherite. Nobody has written for about 7 minutes, so the bed is out. Three agents work in the background, so three bees fly home at the other end of the sky (a second 4). A limit reset is declared and every limit is above 10%, so the totem waits in slot 5. The branch has changes and an approved pull request. Claude Code runs as Administrator, so the name is gold.

| # | Part | What it shows | In Minecraft |
|---|---|---|---|
| 1 | Boss bar | Fable's weekly limit while you use Fable (`hud.fable boss`, the default). It shows a pink bar as wide as the hotbar, right over it, that gets shorter as you use Fable, then the % left and ↻ when it is full again. It has no name of its own: the line below already names the model in use. The bar and the % turn red at 10% or less. It needs the usage API. | The boss bar at the top of the screen, showing a boss's health. |
| 2 | Item in your hand | The model, in its rarity colour: light purple for Opus and Fable, aqua for Sonnet, yellow for Haiku. | The name of the held item, coloured by its rarity: epic is light purple, rare is aqua, uncommon is yellow. |
| 3 | Enchantment | The thinking effort, from `Efficiency I` (low) to `V` (max). | An enchantment on a tool. Efficiency makes a tool dig faster, from level I to V. |
| 4 | Phantoms | A long session (`hud.phantoms`). There is one phantom for each sign: 100 or more prompts, 4 hours or more, 2 or more compactions, context at 70% or more. With one sign, a small dim phantom flies far away. With two or more, that many big ones fly with green eyes. They hint that `/clear` would help. The other end of the sky, after the air bubbles and the cache's numbers, is the agents': a bee flying home to its hive ▤ for each agent at work (`hud.agents`; allays with `allays`), up to four and then a count. | Flying undead mobs with green eyes. They come at night for a player who has not slept for days. Bees fly home to their hive; an allay is a friendly spirit that fetches items for you. |
| 5 | Air bubbles | The prompt cache. There are ten bubbles, all full right after Claude Code writes the cache, and they pop one by one as its time runs out. Then come the time left and the hit ratio. When the cache has expired, the bubbles are empty and `cold` shows. | The breath meter over the hunger bar. Its bubbles pop while you stay underwater. |
| 6 | Day and night | The 5-hour window as one Minecraft day: ☼ yellow, then orange for dusk after 3 hours, ☾ in the last hour, and ☠ once it is used up. Then come the time to its reset and the % left. | The day: the sun, dusk and the moon, as a clock shows them. The skull stands for dying, and a new window is a respawn. |
| 7 | Hearts | What is left of the 5-hour window, as ten hearts. A lost heart turns dark, from the right. With no 5-hour limit (Ultra) all ten are gold; while the extra credits pay, poison green shows the credits left. | Health: ten hearts. Gold ones are absorption hearts from a golden apple, green ones are poisoned. |
| 8 | Level | How many times the context was compacted, as a green number in a black box. There is no box before the first compaction. | The experience level: the green number over the XP bar. |
| 9 | Drumsticks | What is left of the week, as ten drumsticks. An eaten one vanishes from the left. Then come the % left and ↻ the time to its reset. The % turns red at 10% or less. | Hunger: ten drumsticks. Food refills your hearts, as the week refills each 5-hour window. |
| 10 | Context tokens | The tokens in the context and the size of the window, such as `96k/1.0M`. The number is green under 50%, yellow under 80% and red after that. | No counterpart. Minecraft shows only the level. |
| 11 | XP bar | How full the context is. Its notches sit over the hotbar's dividers, and the % used comes after it. `/compact` drains most of it and adds a level. | The experience bar, which fills as you collect experience. |
| 12 | Spawn point | ⌂ and the folder Claude Code runs in. A long path is cut from the front. | Your spawn point: home, where you come back to. |
| 13 | Operator | Your user name before the folder (`hud.user`). While Claude Code runs as Administrator (root elsewhere), the name turns bold gold (`hud.op gold`, the default). With `tag`, a red `[OP]` shows instead. | An operator: a player with admin rights on a server. Servers often show it as a coloured name or an `[OP]` rank in chat. |
| 14 | Version | Claude Code's version, in dark grey. | The version in the corner of the title screen. |
| 15 | Offhand | ◆ The extra credits left, in whole dollars, when the account has extra usage; from $100 the emerald gives up its spare cell for three digits (◆250, then ◆ 1k to ◆99k). Behind a Claude apps gateway that has not sent dollars yet, the % of the credits left (◆37%). The count turns grey when the credits were last read more than 15 minutes ago. Its frame turns green while a limit is used up and the extra credits pay, and stays grey when they are out. While the totem takes the offhand, the emerald moves to slot 5 as it is. | The offhand slot, holding an emerald, the villagers' money. |
| 16 | Pickaxe | The selected slot, in the mint selection frame. The pickaxe and its effort numeral (Ⅰ to Ⅴ) take the model's tool tier (`hud.pickaxe`): netherite for Fable, diamond for Opus, iron for Sonnet, gold for Haiku, stone for any other. The numeral sits on a glint that turns a deeper purple with more effort. | The selected hotbar slot, holding a pickaxe. Tools come in tiers, from stone to netherite. Enchanted items shimmer with a purple glint. |
| 17 | Book and quill | 📖 The prompts you sent this session, typed or sent while Claude was working. Slash commands, interrupts and notifications do not count. 100 or more shows 99 in yellow. | The book and quill, a book you write in. |
| 18 | Gold | The session's cost, in whole dollars. | A gold ingot. |
| 19 | Bed | After 5 minutes without a message, a bed lies in the empty slot (`hud.bed`). It has a white pillow and a red blanket on oak legs. It goes away with your next message. It never shows while a tool is still running. | A bed, where you sleep through the night. |
| 20 | Totem | A limit reset you hold (`hungerbar totem`, `hud.totem`): a golden idol with raised wings and green eyes, centred in hotbar slot 5. When a limit it refills is at 10% or less, it moves to the offhand and the emerald to slot 5; at 0 its frame turns gold, and it pops for 30 seconds (✦) when Hungerbar sees that moment. In its last 24 hours a yellow `!` stands beside it. One totem however many resets you hold. | The Totem of Undying. Held in the offhand, it saves you from dying once. Totems do not stack. |
| 21 | Terrain | The last two hours of git, one column per quarter hour. Each column is as high as the diff got then. It is green when at least as many lines were added as removed, grey when more were removed, and gold where you committed. A quarter hour with no diff is flat brown ground. | The land: hills of grass and stone, with gold. |
| 22 | Grass and cobblestone | The lines added (grass) and removed (cobblestone) now. The smaller count is a slab, sized by its share. | A grass block and a cobblestone block. A slab is a part of a block. |
| 23 | Counts | The exact `+added -removed`, in green and red. | Like the count on a stack of items. |
| 24 | Branch | ⎇ is coloured by your files: green when clean, yellow when changed, aqua when only new untracked files exist, red with a conflict. The branch is coloured by its commits: white, purple during a merge, rebase or cherry-pick, gold when ahead of or behind its upstream, grey `@sha` on a detached HEAD. Short marks follow it, such as `merge`, `!2`, `?3` and `↑2↓1`. | The chat colours: green, yellow, aqua, red, purple and gold. |
| 25 | Pull request | The branch's pull request (`hud.pr`, with your own `gh`). It shows `#128`, then the checks: gold ● still running, green ✓ passed, red × failed. At most one more mark follows: ✓ approved, ± changes requested, ‼ a conflict, ◌ a draft. A merged PR shows in purple and a closed one in dark grey. | No counterpart. It uses the chat colours too. |
| 26 | Hotbar frame | A thin edge under the hotbar: mint under the selected slot, grey under the rest. The offhand gets an edge under and over it, green while the extra credits pay, gold while the totem calls (a limit it refills is used up). | The frame of the hotbar, and the box around the selected slot. |

## Features

### Fable's weekly limit

![The four Fable options, each shown with Fable in use and then on Opus](docs/media/fable.gif)

Fable has its own weekly limit. `hud.fable` picks how the HUD shows it:

| Option | While you use another model | While you use Fable |
|---|---|---|
| `off` | nothing | nothing |
| `tail` | a grey note after the weekly food: `Fable 65% ↻ 4d00h` | the word Fable turns pink and ten hexagons count what is left |
| `tooltip` | the same note | line 1 shows Fable's wear, like a tool's: `Fable 5.1 Eff III █▉ 38% ↻ 2d05h` |
| `boss` (the default) | the same note | a sixth line on top: a boss bar as wide as the hotbar, the % left and when it is full again |
| `beacon` | a beacon at the end of the food line, `◈ Fable 65% ↻ 4d00h`, with a beam into the line above | the same, with Fable in pink |

The % turns red at 10% left or less. A used-up Fable says when it is back: `Fable 0% ↻ 19h00m` in the grey note, or `0% ↻ 19h00m` at the end of the boss bar. Fable 5.1 in use with `boss`:

```
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂 38% ↻ 2d05h
Fable 5.1 Efficiency III                  ◦ ○ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉ 4m12s · hit 98%
☼ 4h49m     98% ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥                       🍗🍗 18% ↻ 3d23h
81k/1.0M ▂▂▂▂▂▂ ▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂ 8%  ⌂ D:/webapp
v2.1.306  ◆ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      🬌••🬍       ▅▆▆ ▆▅▆▆ ▀▀▂▂  +1208 -279  ⎇ main
⠀⠀⠀⠀⠀⠀⠀⠀⠀🮂🮂🮂🮂🮂🮂⠀🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂
```

The numbers come from the usage API, which uses the network. So every option but `off` shows nothing until you turn the usage API on. `hungerbar setup` asks you, or run `hungerbar look hud --fable boss`. Both say first what the usage API reads and sends (see [Privacy and network](#privacy-and-network)).

### Hearts that tell more

Three looks for the hearts line, picked in round 9 of the design picker (each round drew a few options for each new part of the HUD side by side, and one was chosen):

- **Ultra** (`hud.ultra`). On a plan with no 5-hour limit, Claude Code sends only the week. Instead of a grey `?` and ten dark hearts, which read as "no health left", the line shows the golden apple: the day's ☼, a bold gold ∞ and ten gold hearts, Minecraft's absorption hearts. Gold shows nowhere else on the line, so it can only mean "no 5-hour limit". On the other plans Claude Code also sends only the week for a while: when your 5-hour window resets, it stops sending it until Claude's next reply. So Hungerbar turns the hearts gold only once it knows: Claude was asked something after that reset (a prompt, or a tool result in a running turn), has replied, and the 5-hour window is still missing, or the usage API (`network.usageApi`) says the account has no 5-hour limit. Until then the window shows refilled, as a new one: ten red hearts and 100%, until Claude's next reply brings its numbers. Hungerbar remembers the answer, so the next session starts gold on Ultra (1.2.1).
- **Not live** (no key). When Claude Code sends no limits, Hungerbar shows the last ones it saved. They get a grey `~` before the %, and the red hearts, the drumsticks and the % are drawn dimmer, as the classic lines mark them. The `~` goes as soon as Claude Code sends live limits again.
- **Poison** (`hud.poison`). When the 5-hour window is used up and your extra credits pay, the hearts show how much of the credits is left, in poison green: $45.80 of $50 is nine hearts, and anything left is at least one. The day's sun or moon and the time to the reset take the skull's place. When the credits run out, the skull is back.

```
☼             ∞ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥                       🍗🍗 18% ↻ 3d23h
☼ 4h49m    ~98% ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥                       🍗🍗~14% ↻ 23h28m
☼ 1h05m      0% ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥                       🍗🍗 18% ↻ 3d23h
```

Ultra and poison are on by default. `hungerbar look hud --ultra off --poison off` brings back 1.0's `?`, skull and dark hearts.

### The totem: your limit resets

![The totem's day: it waits in hotbar slot 5; at 7% of the 5-hour window it moves to the offhand and the emerald to slot 5; at 0 it pops between gold sides; it stays gold while the credits pay in slot 5; after hungerbar totem use the window is full again and the totem is gone](docs/media/totem.gif)

Anthropic sometimes gives limit resets (Settings → Usage → Resets). Using one sets your usage limits back to full, whenever you choose. Claude Code does not pass them to status lines, so you tell Hungerbar once, with `hungerbar totem 1 --until 2026-12-01` (see [Commands](#commands)), and the HUD carries it as the Totem of Undying (`hud.totem`). The look was picked in round 10 of the design picker:

- **It waits in hotbar slot 5**, a golden idol with raised wings and green eyes, centred in the slot.
- **When a limit it refills drops to 10% left or less** (the 5-hour window, the week, or Fable's weekly while you use Fable), it moves to your offhand and the emerald, your credits, moves to slot 5: a reminder that you can use the reset instead of paying.
- **When that limit hits 0**, its frame turns gold and stays gold while the limit is at 0. When Hungerbar sees the moment, it pops for 30 seconds: a ✦ beside it. Slot 5's emerald gets green sides while the credits pay.
- **In a reset's last 24 hours** a yellow `!` stands beside the totem, which steps aside to make room.
- **It does not stack**, as in Minecraft: you see one totem however many resets you hold. `hungerbar totem`, `hungerbar look` and `hungerbar doctor` say how many.

Waiting, a limit at 7%, then the moment the 5-hour window hits 0 with $45.80 of credits left:

```
v2.1.306  ◆ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      🬌••🬍       ▅▆▆ ▆▅▆▆ ▀▀▂▂  +1208 -279  ⎇ main
v2.1.306  🬌••🬍  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      ◆ 50       ▅▆▆ ▆▅▆▆ ▀▀▂▂  +1208 -279  ⎇ main
v2.1.306 ▐🬌¨🬍✦▌ ▐⛏ Ⅲ ▌📖42 ▄▄ 3     ▐◆ 45▌      ▅▆▆ ▆▅▆▆ ▀▀▂▂  +1208 -279  ⎇ main
```

The HUD never uses a reset for you: you do, in Settings → Usage → "Reset for free" (claude.ai or Claude Desktop), or with `/limit-reset` where your Claude Code has it; then `hungerbar totem use`. A reset leaves the HUD by itself when it expires. With none declared, nothing about the totem is drawn. `hungerbar look hud --totem off` hides it. To see the pop, Hungerbar keeps what it last drew in a small file per session, only while you hold a reset (see [What it writes](#privacy-and-network)).

### The emerald

Three changes to the offhand's emerald, your extra credits in whole dollars, picked in round 9 of the design picker. They have no setting:

- **Dollars past $99.** The emerald had two cells for its count, so $500 showed a yellow 99. From $100 it gives up its spare cell: ◆250, then ◆ 1k to ◆99k, and a yellow ◆99k from $100,000.
- **An old count.** Credits the usage API read more than 15 minutes ago are counted in grey, not white.
- **No green frame without credits.** When a limit is used up and no credits are left, the offhand's frame stays grey; 1.0 lit it green, as if the credits paid.

**Only a percentage (1.2.2).** Behind a Claude apps gateway (some company setups), Claude Code sends how much of your spend limit is used with every reply, and the dollars later: about every five minutes, and only from Claude Code 2.1.284 on, on both sides. Until the dollars come, the emerald shows the % of the credits left: ◆37% when 63% is used. 100% does not fit, so with nothing spent it shows a yellow ◆99%. Under 1% left the well is empty, as under a dollar. The poisoned hearts show the same share: 37% left is four hearts. Once the dollars come, the emerald shows them.

### Your agents at work

When Claude Code runs subagents, or a workflow's agents (as Ultracode does), the HUD shows each one at work in line 1's sky, after the cache readout. `hud.agents` picks the look:

- **bees** (the default, picked in round 9B of the design picker): a beehive ▤ and one striped bee for each agent, flying home to the hive.
- **allays** (round 9's pick, the calm option): Minecraft's friendly blue allays, one for each agent.
- **off**: nothing.

Up to four fly, then a count of the rest, such as `+2`. An agent is at work while its file in the session's subagents folder was written in the last minute. With none at work the sky stays clear, whether Ultracode is on or off. The phantoms keep their part of the sky, between the held item and the air bubbles, so the two never meet. Three bees, six bees, and three allays:

```
◦ ○ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉ 4m12s · hit 98%   ▤ ▐▐🬂 ▐▐🬋 ▐▐🬂
◦ ○ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉ 4m12s · hit 98%   ▤ ▐▐🬂 ▐▐🬋 ▐▐🬂 ▐▐🬋 +2
◦ ○ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉ 4m12s · hit 98%     🬎🬹🬆 🬎🬹🬋 🬎🬹🬆
```

The status line never reads the folder itself. The transcript's background worker looks at it about every 10 seconds while the session uses agents, and reads only the agent files' names and times, never what is in them (see [Privacy and network](#privacy-and-network)). So a new agent shows a few seconds late, and only once Claude Code draws the status line again. `hungerbar setup` asks which look you want, with a preview of each; `hungerbar look hud --agents allays` (or `off`) switches, and `hungerbar preview --situation agents` shows a day with three agents at work.

### The pickaxe's material

The pickaxe in hotbar slot 1 and the effort numeral next to it take the model's tool tier, in Minecraft's materials (`hud.pickaxe tiers`, the default, picked in round 9C of the design picker):

| Model | Tier | Colour | 1.0's pickaxe |
|---|---|---|---|
| Fable | netherite | `#857579` | `#9D8F8F` |
| Opus | diamond | `#55FFFF` | `#55FFFF` |
| Sonnet | iron | `#C6C6C6` | `#D8D8D8` |
| Haiku | gold | `#FFAA00` | `#8F8F8F` |
| any other | stone | `#AAAAAA` | `#AAAAAA` |

In 1.0 the numeral was always the enchant pink. With colour icons, ⛏ is an emoji that keeps its own colours, so there the numeral shows the tier; with plain icons both do. `hungerbar look hud --pickaxe plain` brings back 1.0's colours.

### Git state

![Real git states: clean, changed, untracked files only, ahead and behind, a merge conflict, a rebase stopped at step 2 of 5, a cherry-pick and a detached HEAD](docs/media/git.gif)

⎇ and the branch say what git is doing. Short marks follow the branch:

| | Shows |
|---|---|
| ⎇ | your files: green when clean, yellow when changed, aqua when the only changes are new files git does not track yet, red with a conflict (grey until the first background `git status` has answered) |
| the branch | your commits: white, purple during a merge, rebase or cherry-pick, gold when ahead of or behind its upstream; `@4f4e2d8` in grey on a detached HEAD |
| `merge`, `rebase 2/5`, `pick` | in purple: what is in progress (a rebase shows the branch it is rebasing, as git's prompt does) |
| `!2` | in red: 2 files with a conflict |
| `?3` | in aqua: 3 new files, as `git status` lists them (a new folder counts once) |
| `↑2↓1` | in gold: 2 commits to push and 1 to pull |

A clean branch level with its upstream has no marks. A long branch is cut from the front (`…/minecraft-hud-round-4 merge !2`). The counts come from a background `git status --porcelain=v2 --branch`. What is in progress is read from the files git keeps in `.git`, so the status line itself never runs git (unless you set `git.mode` to `sync`, which runs it inline). A merge you abort is gone on the next render, and the counts follow a few seconds later.

### Pull request and CI

![Nine pull request states, from checks running to closed](docs/media/pr.gif)

With `hud.pr` on, the branch's pull request follows the git state:

| | Shows |
|---|---|
| `#123` | the PR's number; grey with a grey ◌ while it is a draft |
| ● ✓ × | its checks: gold ● still running, green ✓ all passed, red × one failed (no mark when the PR has no checks) |
| ✓ ± ‼ ◌ | at most one more: a second green ✓ approved (✓✓ is ready to merge), yellow ± changes requested, red ‼ a conflict with its base branch, grey ◌ a draft |
| `#123 merged` | in purple once it is merged; `#123 closed` in dark grey once it is closed |

A branch with no pull request shows nothing extra. The status comes from your own GitHub CLI, so you need [`gh`](https://cli.github.com) installed and logged in (`gh auth login`); without `gh`, nothing shows. Asking `gh` uses the network, so the status is off until you say yes: `hungerbar setup` asks when it finds `gh`, or run `hungerbar look hud --pr on`. The details are in [Privacy and network](#privacy-and-network).

### Centred like Minecraft's hotbar

![The window narrows from 140 to 100 columns and widens again, and the HUD re-centres each time](docs/media/center.gif)

By default (`hud.align: center`) the whole HUD moves right as one block, so the hotbar sits in the middle of the status line. The normal day, centred in a 120-column window:

```
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀Opus 5.5 Efficiency III                   ◦ ○ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉ 4m12s · hit 98%
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀☼ 4h49m     98% ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥                       🍗🍗 18% ↻ 3d23h
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀81k/1.0M ▂▂▂▂▂▂ ▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂ 8%  ⌂ D:/webapp
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀v2.1.306  ◆ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      🬌••🬍       ▅▆▆ ▆▅▆▆ ▀▀▂▂  +1208 -279  ⎇ main
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀🮂🮂🮂🮂🮂🮂⠀🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂🮂
```

- **How far.** The width is `HUNGERBAR_WIDTH`, or the `COLUMNS` Claude Code passes, minus 4 and `widthReserve` (116 above). The hotbar's centre column (39) moves to the middle of it, `floor(width / 2) - 39` columns right, but never so far that the widest line would pass the edge.
- **Padding.** Hungerbar does not read the `padding` of Claude Code's `statusLine`, `COLUMNS` is the full width, and Claude Code puts the padding on both sides of the status line. So with a padding the centre sits that many columns right of the middle, and a line can end up to twice that past the edge, where Claude Code cuts it with `…`. Setup writes `"padding": 0`; if you keep another, set `widthReserve` to twice it (padding 3 needs `"widthReserve": 6`; `hungerbar doctor` warns until you do).
- **It follows the window.** Claude Code passes `COLUMNS` on every run and re-runs the status line on its events and every `refreshInterval` (10 s). After a resize, the next render is centred again.
- **When it stays left.** With an unknown width (no `COLUMNS`, as when you run `hungerbar` by hand) or no room to move, the HUD stays at the left edge.
- **Why not spaces.** Claude Code trims the spaces at the start of every status line. So the shift is made of U+2800 (braille pattern blank), which is not a space and draws nothing.

`hungerbar look hud --align left` puts the HUD at the left edge.

### The bed and the phantoms

![A bed appears after five minutes without a message and goes with the next one, but not while a tool runs; then phantoms gather as the signs of a long session add up](docs/media/idle.gif)

- **The bed** (`hud.bed`). After 5 minutes without a message, a bed lies in the empty hotbar slot 4. It goes with your next message. The time counts from the transcript's last message (a tool's result counts) or the prompt cache's last write. While Claude is still working, there is no bed, however long it takes: a tool call without its result (a long build, a test run, a subagent) keeps it away. A question for you (`AskUserQuestion`, `ExitPlanMode`) waits on you, so the bed comes. A permission prompt looks the same as a running tool, so it gets no bed.
- **The phantoms** (`hud.phantoms`). Phantoms gather in line 1's empty sky, one for each sign of a long session: 100 or more prompts, 4 hours or more, 2 or more compactions, and the context at 70% or more. One sign brings one small, dim phantom far away. Two or more bring that many big ones with green eyes, a hint that `/clear` would help. A fresh session has a clear sky.

Both are on by default. `hungerbar look hud --bed off --phantoms off` turns them off.

### Your name and the operator's mark

- **Your name** (`hud.user`) goes between ⌂ and the folder, in the folder's grey: `⌂ steve: D:/webapp` with `user` (the default), `⌂ steve@DESKTOP: D:/webapp` with `user@host`, or the folder alone with `off`.
- **The operator's mark** (`hud.op`) shows only while Claude Code runs elevated: as Administrator on Windows, or as root elsewhere. With `gold` (the default) your name turns bold gold. With `tag` a bold red `[OP]` comes before your name. With `off` nothing shows. When Claude Code runs normally, nothing changes.

The names come from the system (`os.userInfo`, `os.hostname`). On Windows, the elevation check is whether Hungerbar may open `%SystemRoot%\System32\config\systemprofile`, which only an elevated process may. None of this starts a process or uses the network. When line 3 runs out of room, the folder is cut from the front but keeps at least 10 columns; until it can, the host goes first, then the name, then the `[OP]` tag.

### The hotbar's frame

![The hotbar's frame; then the 5-hour limit is used up, the totem pops in the offhand between gold sides and stays gold, while the emerald in slot 5 gets green sides as the extra credits pay](docs/media/frame.gif)

A thin edge runs under the hotbar: mint under the selected slot (the pickaxe), grey under the rest, like the bottom of Minecraft's hotbar. When your account has extra usage, the offhand ◆ shows the extra credits left, in whole dollars. It is framed too, and its frame turns green while a limit is used up and the extra credits pay. The row's empty cells are U+2800, a blank that Claude Code does not trim, so the edge stays under the hotbar.

### Two icon styles

Hungerbar prints the same text in both styles; your terminal decides how 🍗 🔥 💾 💳 ❄ look.

- **colour**: colour emoji, Windows Terminal's default.
- **plain**: plain glyphs in Hungerbar's colours. The switch keeps your font first and puts `Segoe UI Symbol` right after it (`Cascadia Mono, Segoe UI Symbol` with Windows Terminal's default font). This applies to every program in the terminal.

```bash
hungerbar icons          # which style is on
hungerbar icons plain    # or: hungerbar icons colour
```

The switch changes only the font face in Windows Terminal's profile defaults (`profiles.defaults` in its `settings.json`), which every profile without its own font face uses. A profile with its own face is listed, not changed. The switch makes a backup next to the file first and keeps every other byte, comments included. `hungerbar icons` works with Windows Terminal only; in other terminals, plain icons need the terminal to fall back to a plain symbol font before its emoji font.

## Install

### Requirements

- **Claude Code.**
- **Node.js 20 or newer.**
- **Windows Terminal** is recommended. The HUD needs 256 or 24-bit colour, and its glyphs and widths were checked in Windows Terminal. In another terminal, `hungerbar glyphs --hud` shows whether each glyph has the right width.
- **Git for Windows**, on Windows. Claude Code runs status lines through its Git Bash, and the command `setup` writes is made for it.
- Optional: **git** for the git state and the terrain, and the **GitHub CLI** (`gh`), logged in, for the pull request status.

Hungerbar is built on Windows. Tests run on Windows, Linux and macOS in CI. The HUD's glyphs and widths were checked by eye in Windows Terminal only; elsewhere run `hungerbar glyphs --hud` first.

### Install from the release

```bash
npm i -g https://github.com/DandelionBold/hungerbar/releases/download/v1.2.1/hungerbar-1.2.1.tgz
hungerbar setup
```

Hungerbar is not on the npm registry, so npm installs it from the release's tarball. The two commands are on two lines because Windows PowerShell 5.1 has no `&&`; in another shell you can join them with `&&`.

If Windows PowerShell says `npm.ps1` or `hungerbar.ps1` cannot be loaded because running scripts is disabled on this system, its execution policy blocks the `.ps1` scripts that Node.js and npm put on your `PATH`. Type `npm.cmd` and `hungerbar.cmd` instead, here and for every `hungerbar` command in this README; they do the same. Command Prompt and Git Bash are not affected.

### Install with your AI

Tell Claude Code, or another assistant that can run commands on your machine:

```text
Install Hungerbar for me: https://github.com/DandelionBold/hungerbar
```

**If you are the AI assistant doing the install,** follow these steps and keep the user in the loop:

1. Check that `node --version` is 20 or newer. On Windows, check that Git for Windows is installed: Claude Code runs status lines through its Git Bash.
2. Install the release: `npm i -g https://github.com/DandelionBold/hungerbar/releases/download/v1.2.1/hungerbar-1.2.1.tgz`. If Windows PowerShell says running scripts is disabled, use `npm.cmd` and `hungerbar.cmd`.
3. Run `hungerbar setup`. Your shell gives it no terminal for its questions, so it asks nothing and sets up the defaults: the Minecraft HUD, centred, with the user's name, and nothing that uses the network. It changes only the `statusLine` key of `~/.claude/settings.json`, after a backup.
4. Setup then prints a command for the two features that use the network, such as `hungerbar look hud --fable boss --pr on`. Do not run it on your own. First tell the user what it turns on. The usage API reads their Claude login token and asks Anthropic's usage endpoint for their limits in the background; it is what shows Fable's weekly limit. The pull request status runs their own `gh` in the repo about once a minute. [Privacy and network](#privacy-and-network) has the details. Run the command only after the user says yes; otherwise leave both off.
5. Tell the user that the HUD shows in Claude Code sessions run in a terminal (Windows Terminal is recommended; the desktop app draws no status line), that `hungerbar doctor` checks the install, and that `hungerbar setup --restore` undoes it.

### What `hungerbar setup` does

![hungerbar setup on a first install, with Enter pressed for every question](docs/media/setup.gif)

In a terminal, `setup` asks a few questions. Each answer is shown as a preview drawn with your own names. Each question pre-selects the default, so Enter accepts it:

1. **The look:** the Minecraft HUD (the default) or the classic lines. Classic ends the questions here.
2. **Fable's weekly limit:** a boss bar (the default), another option, or none. For any option but none, setup then says what the usage API reads and sends, and asks `Turn on the usage API? [Y/n]`. If no, the option becomes none and the no is saved (`"usageApi": false`).
3. **Where it sits:** centred (the default) or at the left edge.
4. **Your name:** your user name (the default), `user@host`, or none.
5. **The operator's mark:** your name in gold (the default), a red `[OP]`, or nothing.
6. **The pull request status**, only when `gh` is found: setup says what it runs and sends, and asks `Show the pull request status? [Y/n]`.
7. **Your agents at work:** bees (the default), allays, or nothing, each previewed on a sky with three agents at work.

If you already have a `hungerbar.json`, Enter keeps what it has. The two network questions pre-select yes unless the file sets the key they ask about; then Enter keeps the file's value. The pull request question's key is `hud.pr`. The usage API question's key is `network.usageApi`; when the usage API is on already, setup asks about `network.scopedWeekly` (Fable's weekly) instead. Each no is saved, so the next setup keeps it: a no to the pull request status as `"pr": "off"`, a no to the usage API as `"usageApi": false` (or `"scopedWeekly": false`).

Flags answer for setup: `--look classic|hud`, then, for the HUD, `--fable off|tail|tooltip|boss|beacon`, `--align left|center`, `--user off|user|user@host`, `--op off|tag|gold`, `--pr on|off`, `--bed on|off`, `--phantoms on|off`, `--ultra on|off`, `--poison on|off`, `--totem on|off`, `--agents off|allays|bees` and `--pickaxe tiers|plain` (setup asks no question for `--bed`, `--phantoms`, `--ultra`, `--poison`, `--totem` and `--pickaxe`). The HUD's flags go with `--look hud`, for example `hungerbar setup --look hud --fable boss --pr on`. Without a terminal, setup asks nothing. Whenever it asks nothing (no terminal, or flags), it prints what of the HUD still waits for your yes, such as `hungerbar look hud --fable boss --pr on`. The pull request status is named only when `gh` is found, and a no you already gave (such as `"pr": "off"`) is not named again.

Then setup backs up `~/.claude/settings.json` to `settings.json.bak.<timestamp>`, remembers your old `statusLine`, and changes only that key:

```json
"statusLine": {
  "type": "command",
  "command": "\"C:/Program Files/nodejs/node.exe\" \"C:/Users/<you>/AppData/Roaming/npm/node_modules/hungerbar/dist/hungerbar.mjs\"",
  "padding": 0,
  "refreshInterval": 10
}
```

The command names `node.exe` and the bundle by their full paths, never through an npm shim. A `padding` or `refreshInterval` you already had is kept. Claude Code picks the new command up on its next render.

- `hungerbar setup --print` shows what would change and writes nothing.
- `hungerbar setup --icons plain` (or `colour`) also switches the [icon style](#two-icon-styles), as `hungerbar icons` does.
- `hungerbar setup --launcher` writes a `statusline.cmd` launcher instead. It is slower; keep it for setups where the direct command misbehaves.
- On macOS and Linux the command is `'<node>' '<npm root>/hungerbar/dist/hungerbar.mjs'` (a `'` in a path is written `'\''`).

### Upgrade

Install the newer release the same way: `npm i -g <the new release's .tgz URL>`. The install path stays the same, so `settings.json` needs no change. If Node moves to a new folder, run `hungerbar setup` again, because the command names `node.exe` by its full path.

## Configuration

Settings live in `~/.claude/hungerbar.json` (`HUNGERBAR_CONFIG` names another file; `CLAUDE_CONFIG_DIR` moves `~/.claude`). Every key is optional. When `setup` or `look` creates the file, it adds a `$schema` link to [`schema.json`](schema.json), so your editor can complete and check keys. `hungerbar look` changes the look's keys for you, with a backup.

The file is strict JSON. Unknown keys are ignored, and a value that is not allowed falls back to its default (except `hud.fable`, which falls back to `off`). A file that is not valid JSON draws the classic lines with a dim `cfg!` until you fix it.

**The look and the HUD**

| Key | Default | Values | What it does |
|---|---|---|---|
| `look` | `hud` | `hud`, `classic` | the Minecraft HUD, or the [classic lines](#the-classic-look) |
| `hud.fable` | `boss` | `off`, `tail`, `tooltip`, `boss`, `beacon` | how the HUD shows [Fable's weekly limit](#fables-weekly-limit); every option but `off` needs `network.usageApi` and `network.scopedWeekly` |
| `hud.align` | `center` | `center`, `left` | the hotbar in the middle of the status line, or the HUD at the left edge |
| `hud.minWidth` | `80` | 62 to 200 | the HUD draws only when a known width leaves this many columns; otherwise the classic lines draw |
| `hud.pr` | `off` | `off`, `on` | the branch's [pull request and CI](#pull-request-and-ci), through your own `gh` (uses the network) |
| `hud.user` | `user` | `off`, `user`, `user@host` | [your name](#your-name-and-the-operators-mark) before the folder |
| `hud.op` | `gold` | `off`, `tag`, `gold` | the mark while Claude Code runs as Administrator (root elsewhere) |
| `hud.bed` | `on` | `on`, `off` | the [bed](#the-bed-and-the-phantoms) after 5 minutes without a message |
| `hud.phantoms` | `on` | `on`, `off` | the phantoms of a long session |
| `hud.ultra` | `on` | `on`, `off` | the [golden hearts](#hearts-that-tell-more) when the account has no 5-hour limit (the Ultra plan) |
| `hud.poison` | `on` | `on`, `off` | the poisoned hearts while the extra credits pay for a used-up 5-hour window |
| `hud.totem` | `on` | `on`, `off` | the [totem](#the-totem-your-limit-resets): the limit resets you declared (`totems`), in hotbar slot 5, in the offhand while a limit one refills is at 10% or less, gold at 0; with none declared, nothing is drawn |
| `hud.agents` | `bees` | `bees`, `allays`, `off` | [your agents at work](#your-agents-at-work) in line 1's sky; `off` never reads the subagents folder |
| `hud.pickaxe` | `tiers` | `tiers`, `plain` | the [pickaxe and its numeral](#the-pickaxes-material) in the model's tool tier, or 1.0's colours |
| `totems` | none | a list of `{n, kind, until, at, label}` | the [limit resets](#commands) Anthropic gave you, written by `hungerbar totem`: `n` 1 to 99, `kind` `full` (the default), `5h`, `week` or `fable`, `until` when it expires; an expired one is ignored |

**Both looks**

| Key | Default | Values | What it does |
|---|---|---|---|
| `icons` | `minecraft` | `minecraft`, `unicode`, `ascii` | `unicode`: plain numbers for the limits in the classic lines; `ascii`: no Unicode at all, which also keeps the HUD off |
| `color` | `auto` | `auto`, `always`, `never` | `never` turns colour off, which also keeps the HUD off |
| `colorDepth` | `auto` | `auto`, `truecolor`, `256`, `16` | `auto` picks 24-bit in Windows Terminal, VS Code and terminals that set `COLORTERM`, else 256; `16` keeps the HUD off |
| `bold` | `true` | `true`, `false` | bold values (labels stay regular) |
| `nbsp` | `true` | `true`, `false` | inner spaces as U+00A0, so Claude Code keeps them |
| `widthReserve` | `0` | 0 to 200 | columns to leave free when the width is known; set it to twice a non-zero `statusLine.padding` |
| `git.mode` | `swr` | `swr`, `sync`, `off` | `swr`: git runs in the background; `sync`: inline, slower; `off`: no git commands (the branch and a merge, rebase or cherry-pick in progress still show, read from `.git`) |
| `git.ttlSeconds` | `15` | 1 to 3600 | how long a git answer counts as fresh |
| `git.timeoutMs` | `2000` | 100 to 30000 | a background git run is stopped after this |
| `network.usageApi` | `false` | `true`, `false` | the [usage API](#privacy-and-network): extra credits and per-model weekly limits (uses the network) |
| `network.scopedWeekly` | `false` | `true`, `false` | per-model weekly limits such as Fable's, for `hud.fable` and the `scopedWeek` item |
| `network.ttlSeconds` | `180` | 60 to 86400 | how often the usage API is asked while a session renders |

**The classic look only**

| Key | Default | Values | What it does |
|---|---|---|---|
| `lines` | 3 lines | up to 3 lists of item ids | which items each line shows: `model`, `effort`, `context`, `git`, `limit5h`, `limitWeek`, `scopedWeek`, `cache`, `extra`, `cwd`, `version`, and `resets` (in no line by default: the [limit resets](#the-totem-your-limit-resets) you hold, `☥ Limit resets: 1 (use by 2026-12-01)`); the default is `[["model","effort","context","git"],["limit5h","limitWeek","cache"],["extra","cwd","version"]]` |
| `bar.width` | `16` | 4 to 40 | the context bar's cells |
| `thresholds.warn` / `thresholds.crit` | `75` / `90` | 1 to 100 | the % used at which limits, context and extra turn yellow and red |
| `limits` | `left` | `left`, `used` | whether the icons and the % count what is left or what is used |
| `minecraft.session` / `minecraft.weekly` | `hearts` / `food` | `hearts`, `food` | which bar each limit shows |

For example, the full setup with both network features on:

```json
{
  "network": { "usageApi": true, "scopedWeekly": true },
  "hud": { "pr": "on" }
}
```

**Environment variables** win over the file:

| Variable | Effect |
|---|---|
| `HUNGERBAR_LOOK=classic\|hud` | the look, for this environment |
| `HUNGERBAR_HUD_ALIGN=left\|center` | where the HUD sits |
| `HUNGERBAR_ICONS=minecraft\|unicode\|ascii`, `HUNGERBAR_ASCII=1` | the icons; ASCII mode also keeps the HUD off (as does `TERM=dumb`) |
| `NO_COLOR`, `FORCE_COLOR` | no colour, or a forced depth (`FORCE_COLOR=0` keeps the HUD off, `1` keeps it off too unless `colorDepth` is `256` or `truecolor`, `2` is 256 colours, `3` is 24-bit) |
| `HUNGERBAR_WIDTH` | the width to fit and centre in, instead of `COLUMNS` |
| `HUNGERBAR_USAGE_API=1` | turns the usage API on, even where the file sets it to `false` |
| `HUNGERBAR_OFFLINE=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | turns everything that uses the network off |
| `HUNGERBAR_CONFIG`, `HUNGERBAR_CACHE_DIR` | another config file, another cache folder |
| `HUNGERBAR_DEBUG=1` | phase timings on stderr |
| `HUNGERBAR_CAPTURE=<dir>` | saves one payload per Claude Code version, with the working and project folders, the transcript path and the session id replaced; other paths, such as a worktree's, are kept, so read it before you share it; with the usage API on, also the day's answer as `usage-<YYYYMMDD>.json`, its `extra_usage` and `limits` only (never the token or headers) |

## Commands

```
hungerbar                      render from stdin (in a terminal it shows a demo)
hungerbar setup                switch Claude Code's status line to Hungerbar (a terminal asks for the look)
hungerbar setup --restore      put the previous status line back
hungerbar look [classic|hud]   show or switch the look; --fable, --align, --pr, --user, --op, --bed,
                               --phantoms, --ultra, --poison, --totem, --agents, --pickaxe; --print shows the
                               change and writes nothing
hungerbar preview              draw sample situations (normal, tight, fresh, extra, fable, agents); writes nothing
hungerbar doctor [--bench]     check the install and time a render
hungerbar refresh usage        ask the usage API now and print what came back (when network.usageApi is on)
hungerbar totem [<n>|add|use]  the limit resets Anthropic gave you (Settings → Usage → Resets), which Hungerbar
                               cannot see itself; clear forgets them; --until <date>, --kind full|5h|week|fable,
                               --label <text>; --print shows the change and writes nothing
hungerbar glyphs [--hud]       a width ruler for the icons, to check your terminal's font
hungerbar icons [plain|colour] show or switch the icon style (a Windows Terminal font setting)
hungerbar --help, --version
```

A few examples:

```bash
hungerbar look                                  # the look, its options, and whether this terminal draws the HUD (or why not)
hungerbar look hud --fable boss --pr on         # the boss bar and the PR status (each says first what it uses)
hungerbar preview --look hud --situation all    # every sample situation in the HUD
hungerbar preview --align center --width 120    # the HUD centred in a 120-column window
hungerbar totem 1 --until 2026-12-01            # you hold one limit reset, to use by the end of 1 December
hungerbar totem use                             # you used it (Settings → Usage → Reset for free, or /limit-reset)
```

`look` changes only `hungerbar.json`, after a backup next to it (`hungerbar.json.bak.<timestamp>`), and keeps every other key in its place. Each change prints the way back. Claude Code draws the new look on its next render.

`totem` tells Hungerbar about your limit resets, because Claude Code does not pass them to status lines. A reset sets your usage limits back to full whenever you choose; Anthropic gives them now and then, and Settings → Usage → Resets shows yours with its expiry. `hungerbar totem 1 --until 2026-12-01` says you hold one, to use by the end of that day (`--until` also takes `2026-12-01T18:00` in local time, the same with `Z` or `+02:00`, or `+7d` and `+12h`); `--kind` says which limits it refills: `full` (the 5-hour window, the week and Fable's weekly, the default), `5h`, `week` or `fable`. `hungerbar totem <n>` replaces what you held, `add` adds a grant with its own expiry, `use` takes one off (the one that expires first), and `clear` forgets them all. `hungerbar totem` alone says what you hold. A reset that expires is dropped by itself. Like `look`, it changes only the `totems` key of `hungerbar.json`, after a backup, and prints the way back. `use` also makes Hungerbar forget the last limits it saved for the windows the reset refilled, so the refill shows at once. Hungerbar never uses a reset for you: you do, in Settings → Usage → "Reset for free" (claude.ai or Claude Desktop), or with `/limit-reset` where your Claude Code has it.

## The classic look

![The classic look: three lines with the model, the context bar, hearts, drumsticks, the cache and the folder](docs/media/classic.png)

`hungerbar look classic` draws three lines instead, the look Hungerbar started with:

```
Model: Opus 5.5 │ Thinking: high │ Context: [█░░░░░░░░░░░░░░░] 81k/1.0M (8%) │ ⎇ main │ (+1208,-279)
Session: ♥♥♥♥♥♥♥♥♥♥ 98% (↻ 4h 49m) │ Weekly:                 🍗🍗 18% (↻ 3d 23h) │ 💾 Cache Hit: 98% (◕ 🔥 4m12s)
💳 Extra: $0.00/$50 │ cwd: D:/webapp │ v2.1.306
```

The red hearts are what is left of the 5-hour window; a lost heart turns dark, from the right. The ten drumsticks are what is left of the week; an eaten one vanishes from the left. The % counts what is left too; `"limits": "used"` makes the icons and the % both count what is used. Limits turn yellow with 25% left and red with 10% left. Extra shows the dollars spent and your limit; behind a Claude apps gateway that has not sent dollars yet, it shows a % counted the same way: `💳 Extra: 37%` left, or 63% with `"limits": "used"`. The pie (● ◕ ◑ ◔ ○) empties as the cache cools, and the cache shows `○ ❄ COLD` once it expires. When the width is known, the lines are fitted: the version, the extra credits and the git changes go first, then the labels shorten, and so on. The model, the thinking effort, the context % and both limit %s are never dropped.

The classic lines can show the [limit resets](#the-totem-your-limit-resets) you hold: add `resets` to a line of `lines`, for example `[["model","effort","context","git"],["limit5h","limitWeek","cache"],["extra","resets","cwd","version"]]`. It reads `☥ Limit resets: 1 (use by 2026-11-13)`, with the soonest expiry. The count turns yellow while a limit a reset can refill is at 10% left or less, and red once that limit is used up. With no reset held it shows nothing, and when a line is too wide it is the first item to go.

`hungerbar look hud` switches back. For the classic lines in one shell only, set `HUNGERBAR_LOOK` to `classic` there and start Claude Code from that shell: `$env:HUNGERBAR_LOOK = 'classic'` in PowerShell, `export HUNGERBAR_LOOK=classic` in Git Bash.

The classic lines also draw, byte for byte, wherever the HUD cannot:

- with no colour or only 16 colours (`NO_COLOR`, `FORCE_COLOR=0`, `FORCE_COLOR=1` unless `colorDepth` is `256` or `truecolor`, `"color": "never"`, `"colorDepth": "16"`);
- in ASCII mode (`"icons": "ascii"`, `HUNGERBAR_ASCII=1`, `TERM=dumb`);
- with a `hungerbar.json` that is not valid JSON;
- when a known width leaves fewer than `hud.minWidth` (80) columns.

## Privacy and network

Hungerbar runs on your machine and keeps what it learns there. Two features use the network. Both are off until you say yes, and `hungerbar setup` explains each one before it asks.

**What it reads on your machine**

- The JSON Claude Code passes on stdin for each render.
- The session's transcript, read incrementally: for the prompt and compaction counts, the bed, fields an older Claude Code does not pass, and whether Ultracode is on and when an agent was last started.
- With `hud.agents` on (`bees`, the default, or `allays`), while the session uses agents: the names and modification times of the agent files in the session's subagents folder, next to the transcript (`<session>/subagents`, and its workflows' folders). The transcript's background worker reads them, never what is in the files, and keeps only the newest times. With `hud.agents off` the folder is never read.
- Your git repo's files: `.git/HEAD` and its refs, when the index last changed, `.git/logs/HEAD` for the terrain, the files git keeps during a merge, rebase or cherry-pick, and, with the PR status on, `.git/config` to see whether a remote is on GitHub. A background refresher runs `git diff HEAD --shortstat` and, for the HUD, `git status --porcelain=v2 --branch`.
- Your user name and computer name from the system, and whether Claude Code runs elevated.
- Environment variables: the ones under [Configuration](#configuration), `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_EFFORT_LEVEL` (when Claude Code passes no effort), `PATH` (to find git and `gh`), `GIT_CEILING_DIRECTORIES` and `GH_HOST`; the terminal's `COLUMNS`, `TERM`, `COLORTERM`, `WT_SESSION` and `TERM_PROGRAM`; the system's folders and names, such as `LOCALAPPDATA` and `USERNAME`; in `doctor`, `CLAUDE_CODE_GIT_BASH_PATH` and `SHELL`; and the `HUNGERBAR_*` variables the tests use.
- `~/.claude/hungerbar.json` (with the limit resets you declared in its `totems` key), and its own cache folder (below).
- `~/.claude/settings.json`, in `setup`, `doctor` and `look` (`look` only to say whether Claude Code runs Hungerbar yet). Windows Terminal's `settings.json`, in `setup`, `icons` and `doctor`.
- In `doctor`: the command lines of running processes, to find leftover Hungerbar refreshers: on Windows those of `node.exe`, `git.exe` and `gh.exe`, on Linux every process's (from `/proc`), on macOS every process's (from `ps`). It shows only the leftovers.
- With the usage API on: your Claude login token, which its background refresher reads from `CLAUDE_CODE_OAUTH_TOKEN`, else `~/.claude/.credentials.json`, else the macOS Keychain; and `HTTPS_PROXY` (or `https_proxy`), to send the refresher's request through your proxy and, in `doctor`, to say so. See the usage API below.

**What it writes**

- Its cache folder: `%LOCALAPPDATA%\hungerbar` on Windows, `~/Library/Caches/hungerbar` on macOS, `$XDG_CACHE_HOME/hungerbar` or `~/.cache/hungerbar` on Linux. It holds small JSON files: the git answers, the last known limits, the usage API's answer, the PR answers, the HUD's terrain history, the totem's memory (what the HUD last drew, one small file per session while you hold a limit reset, so it sees when a limit hits 0), the transcript counts (with the times of the newest agent files, while the session uses agents) and, after `setup`, your previous status line (and, with `setup --launcher`, `statusline.cmd`). Terrain histories, the totem's files, transcript counts and PR answers untouched for a week are deleted (checked at most once a day).
- `settings.json` (only the `statusLine` key, with a backup) when you run `setup` or `setup --restore`.
- `hungerbar.json` (with a backup) when you run `setup`, `look` or `totem`. `totem use` also rewrites the last known limits in the cache folder, forgetting the windows the reset refilled.
- Windows Terminal's `settings.json` (only the font face, with a backup) when you run `icons plain` or `icons colour`, or `setup --icons plain` or `setup --icons colour`.
- For `doctor`'s timed render, a throwaway cache folder in your temp folder, deleted when it is done.
- With `HUNGERBAR_CAPTURE=<dir>` set, one payload per Claude Code version in that folder, and, with the usage API on, the day's latest usage answer (only its `extra_usage` and `limits`).

**What uses the network, and only after you say yes**

1. **The usage API** (`network.usageApi`, with `network.scopedWeekly` for Fable's weekly limit). A background refresher reads your Claude login token: from `CLAUDE_CODE_OAUTH_TOKEN`, else `~/.claude/.credentials.json`, else the macOS Keychain. It sends one request, `GET https://api.anthropic.com/api/oauth/usage`, with that token in the `Authorization` header and `hungerbar/<version>` as the User-Agent. When `HTTPS_PROXY` is set, the request goes through it (on Node 24 or newer). It asks about every 3 minutes (`network.ttlSeconds`) while a session renders. When your account has no extra usage and `network.scopedWeekly` is off, it asks once an hour, or every 3 minutes while a limit is at 10% left or less. With no token, or a token that is refused, it waits 10 minutes before it tries again; when it is rate-limited, it waits as long as the server asks. It keeps the extra credits and the per-model weekly limits in `usage.json`. `hungerbar refresh usage` asks right away and prints one line: the extra credits left (and Fable's weekly, with `network.scopedWeekly` on), or what went wrong and when the next try is. It fetches nothing while the usage API is off or a rate limit lasts. The token is never stored, logged or sent anywhere else.
2. **The pull request status** (`hud.pr`). While a session renders in a repo with a remote on GitHub, on a branch (not a detached HEAD), a background refresher runs your own `gh pr view --json number,state,isDraft,mergeable,reviewDecision,statusCheckRollup` in the repo, about once a minute. While `gh` is not logged in or sees no GitHub remote, it asks only every 10 minutes. While `gh` is not on your `PATH`, the refresher still starts every 10 minutes to look for it, but starts nothing else and uses no network. `gh` uses its own login, so Hungerbar never sees a token. Hungerbar keeps only what the badge needs: the PR's number, its state, its checks' result, its review decision and whether it conflicts. It saves them under the repo's path and the branch, with when and how `gh` last answered (a PR, no PR, or why not, such as not logged in).

**Turning the network off**

- Leave `network.usageApi` and `hud.pr` off. They are off unless you turn them on, and setup saves a no to either.
- Set `HUNGERBAR_OFFLINE=1`, or Claude Code's own `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, to stop both, whatever the file says.

Hungerbar has no telemetry and no update check. Nothing else uses the network.

## Other agents

Hungerbar reads one JSON object on stdin and draws from it. Nothing checks who sent it, so another tool that runs a status line command with JSON on stdin can run Hungerbar too. Even `{}` draws a useful HUD: the model as `Claude`, an empty XP bar, the folder Hungerbar runs in, and that folder's git state.

**What it reads, and what each field unlocks**

| Field | What it draws |
|---|---|
| `model.display_name`, else `model.id` | the item in your hand: the model's name and its rarity colour; `Claude` without either |
| `effort.level` (`low` to `max`) | the enchantment (`Efficiency I` to `V`) and the pickaxe's numeral |
| `context_window.context_window_size`, `used_percentage` and `current_usage` | the XP bar, its % and the context tokens |
| `workspace.current_dir`, else `cwd` | the spawn point, and the repo whose branch, git state and terrain are drawn |
| `worktree.branch` | the branch drawn after ⎇, in place of the one `.git/HEAD` names, for a tool that knows better (inside a repo only) |
| `cost.total_cost_usd` | the gold: the session's cost in whole dollars |
| `cost.total_duration_ms` | the session's age, one of the phantoms' signs |
| `cost.total_lines_added` and `total_lines_removed` | nothing of their own: a change only freshens the cached `+added -removed` diff |
| `rate_limits.five_hour` and `rate_limits.seven_day`, each `{used_percentage, resets_at}` (`resets_at` in epoch seconds) | the day, the hearts and the drumsticks, with the time to each reset |
| `rate_limits.spend_limit` (`used_usd`, `limit_usd`, `used_percentage`) | the extra credits in the offhand: the dollars left, or the % left while it has only `used_percentage`; when it is there it wins over the usage API's answer, which is then not read |
| `prompt_cache` (`warm`, `expires_at`, `ttl`, `hit_ratio`, `caching_observed`) | the air bubbles, the countdown and the hit % |
| `version` | the version |
| `session_id` | the key of the terrain's history and of the transcript's counts |
| `transcript_path` | Claude Code's transcript (below) |

**What stays Claude Code's own**

- The transcript is Claude Code's JSONL. The book's prompt count and the level (compactions) come only from it, and the bed reads it too (or `prompt_cache`). For another tool they stay empty.
- The usage API reads a Claude login token and asks Anthropic, so Fable's weekly limit is always the Claude account's, whatever tool renders. The extra credits in the offhand are the Claude account's too, unless the tool sends its own `rate_limits.spend_limit`.
- The hearts and the day are a 5-hour window and the drumsticks a 7-day one, as Claude's limits are. Pass another tool's limits only when they mean the same; otherwise leave `rate_limits` out.

**The width.** The classic lines are fitted, and a centred HUD is centred, only when Hungerbar knows the width. When the tool does not set `COLUMNS` for the command, set it (or `HUNGERBAR_WIDTH`) yourself. Without a width the classic lines are not fitted and the HUD stays at the left edge.

**Keep each tool apart.** Hungerbar remembers the last limits it saw for each Claude account, under its cache folder, and reads `hungerbar.json` from `CLAUDE_CONFIG_DIR`. Run each tool with its own `HUNGERBAR_CACHE_DIR` and `CLAUDE_CONFIG_DIR`. Otherwise your Claude account's last-known limits can show inside another tool's render, and the HUD draws them undimmed.

A wrapper for a tool whose status JSON has other field names (the names on the right are made up) can remap them in `node` and pipe the result to Hungerbar:

```sh
#!/bin/sh
# Another agent's status JSON in, Hungerbar's HUD out, in caches of its own.
export HUNGERBAR_CACHE_DIR="$HOME/.cache/hungerbar-myagent"
export CLAUDE_CONFIG_DIR="$HOME/.config/myagent/hungerbar"
export COLUMNS="${COLUMNS:-120}"
node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const a = JSON.parse(s || "{}");
  process.stdout.write(JSON.stringify({
    model: { display_name: a.model_name },
    cwd: a.working_directory,
    context_window: { context_window_size: a.context_limit, used_percentage: a.context_used_pct },
    cost: { total_cost_usd: a.session_cost },
  }));
});' | hungerbar
```

As of November 2026:

- OpenAI's Codex CLI has no command status line hook, only its own fixed items, so Hungerbar cannot run there.
- Google's Antigravity CLI has a `statusLine` command hook like Claude Code's, with JSON on stdin. A Hungerbar adapter for it is planned for v1.2. A payload saved with `HUNGERBAR_CAPTURE=<dir>` from it would help: read it before you share it, since it keeps some paths.

## How it stays fast

Claude Code runs the status line on its events and every 10 seconds, so each render has to be quick.

- **One file, run directly.** The bundle has no runtime dependencies, and `setup` runs it by the full path to `node.exe`, never through `npx` or an npm shim (`npx` was measured adding about 180 ms per render).
- **Stdin first.** Almost everything comes from the JSON Claude Code passes. The transcript is read incrementally, from where the last render stopped. When more than 4 MiB is new, a background worker catches up instead.
- **No waiting on git or the network** (unless you set `git.mode` to `sync`, which runs git inline). The render reads cached answers. When one is stale, it starts a detached background refresher and draws the last answer meanwhile. Locks keep refreshers from piling up, and a git run that hangs is stopped after `git.timeoutMs`.
- **The line goes out first.** The HUD's terrain history is written after the line is printed, and only when it changed.
- **A hard deadline.** If a render takes over 2 seconds, Hungerbar prints `Hungerbar · no data` and exits.

`hungerbar doctor` times a render on your machine the way Claude Code runs it.

## Troubleshooting

Start with:

```bash
hungerbar doctor
```

It checks Node, Git Bash, the `statusLine` command in `settings.json`, your `hungerbar.json`, the cache folder, the look and whether this terminal draws the HUD (and why not), the usage API, the PR status, your name and elevation, leftover background processes, and it times a render.

| What you see | What to try |
|---|---|
| `running scripts is disabled on this system` | Windows PowerShell's execution policy blocks `npm.ps1` and `hungerbar.ps1`. Type `npm.cmd` and `hungerbar.cmd` instead, or use Command Prompt or Git Bash. |
| No status line at all | Claude Code runs status lines only in folders you have trusted. `doctor` also warns when `disableAllHooks` is on, which turns the status line off too. |
| The classic lines instead of the HUD | `hungerbar look` says why: too few colours, ASCII mode, an invalid `hungerbar.json`, or a window narrower than `hud.minWidth`. |
| `cfg!` in the classic lines | `hungerbar.json` is not valid JSON. `doctor` names the error. |
| No boss bar or Fable note | The usage API is off. Run `hungerbar look hud --fable boss`, or turn on `network.usageApi` and `network.scopedWeekly`. |
| No pull request badge | `hud.pr` is off, `gh` is missing or not logged in (`gh auth status`), or the repo has no remote on GitHub. `hungerbar look` says whether `hud.pr` is on and `gh` is found. |
| `hungerbar look` still counts a limit reset you used | Run `hungerbar totem use` after you use one; Hungerbar cannot see your resets. A reset that expires is dropped by itself. |
| A dimmed `~` limit shows the old use after you used a reset | `hungerbar totem use` makes Hungerbar forget the last limits it saved for the windows the reset refilled, so the next render shows `?` until Claude Code sends the new ones. Fable's weekly comes from the usage API, not from that file: it refreshes within 3 minutes after `hungerbar totem use` (a `fable` or `full` reset). |
| Lines cut off with `…` | Your `statusLine.padding` is not 0. Set `widthReserve` to twice it; `doctor` warns until you do. |
| Icons too wide or misaligned | `hungerbar glyphs --hud` shows each glyph's width in your terminal. Try `hungerbar icons plain`. |
| `hungerbar error (run hungerbar doctor)` | The render failed. Run `claude --debug` to see Hungerbar's error on stderr, and please [open an issue](https://github.com/DandelionBold/hungerbar/issues). |

`HUNGERBAR_DEBUG=1` prints each render's phase timings on stderr.

## Uninstall and rollback

```bash
hungerbar setup --restore
npm rm -g hungerbar
```

`setup --restore` puts your previous status line back. When nothing else in `settings.json` changed, the file comes back byte for byte. It leaves `hungerbar.json` alone, so a later `setup` keeps your look.

To remove everything, also delete `~/.claude/hungerbar.json`, its `hungerbar.json.bak.*` backups, the `settings.json.bak.*` backups and the cache folder (`%LOCALAPPDATA%\hungerbar` on Windows). If you switched to plain icons, run `hungerbar icons colour` before you uninstall; the backup next to Windows Terminal's `settings.json` holds the file as it was.

To go back to an earlier release, install its tarball the same way: `npm i -g <its .tgz URL>`.

## Contributing

Bug reports, ideas and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to build, test and make the pictures. [SPEC.md](SPEC.md) is the design contract, and [CHANGELOG.md](CHANGELOG.md) lists what changed in each version.

## License

[MIT](LICENSE). Copyright Kamal Nady.

## Trademarks

Minecraft is a trademark of Mojang AB. Hungerbar is not affiliated with or endorsed by Mojang or Microsoft.
