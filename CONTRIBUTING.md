# Contributing to Hungerbar

Thank you for helping. Bug reports, ideas and pull requests are all welcome.

- **A bug?** [Open a bug report](https://github.com/DandelionBold/hungerbar/issues/new?template=bug_report.yml) and paste what `hungerbar doctor` prints.
- **An idea?** [Open a feature request](https://github.com/DandelionBold/hungerbar/issues/new?template=feature_request.yml) and say what you want to see in the status line, and why.
- **A change?** Open a pull request. For anything large, open an issue first, so we can agree on the shape before you write it.

## Set up

You need:

- Windows 10 or 11, with [Git for Windows](https://gitforwindows.org) (git and Git Bash).
- Node.js 22.18 or newer. The tests run the TypeScript sources directly, which needs Node's built-in type stripping. The built file itself runs on Node 20.
- Windows Terminal, to see the HUD the way users do.

```bash
git clone https://github.com/DandelionBold/hungerbar.git
cd hungerbar
npm ci
npm run build          # writes dist/hungerbar.mjs
```

Try your build without installing it:

```bash
node dist/hungerbar.mjs preview --situation all
echo '{"model":{"display_name":"Opus 5.5"}}' | node dist/hungerbar.mjs
```

To try it in Claude Code, pack and install it, then run setup:

```bash
npm pack
npm i -g ./hungerbar-<version>.tgz   # the file npm pack wrote
hungerbar setup
```

Please do not use `npm link` for this: Claude Code would then run your checkout's `dist/hungerbar.mjs`, which every build (`npm test` included) replaces while you work.

To keep a copy of your checkout, run `node dist/hungerbar.mjs mirror <dir>` from it. It copies the source, the tests, the build, the docs, the scripts and any `hungerbar-*.tgz` from the checkout's root into that folder. Each run replaces what it copies, but a tarball already in the folder stays, so earlier releases are kept. It works only from a source checkout, not from an installed release, which has no `src/`.

## How the code is laid out

| Folder | What is in it |
|---|---|
| `src/` | The TypeScript source. `esbuild` bundles it into one file, `dist/hungerbar.mjs`, with no runtime dependencies. |
| `src/hud/` | The Minecraft HUD: a port of the design engine, plus the layers added on top (frame, centring, git state, PR badge, the player's name, the bed, the phantoms). |
| `src/cli/` | The commands: `setup`, `look`, `preview`, `doctor`, `icons`, `glyphs`, and `mirror` (for a checkout only). |
| `test/` | The tests, the golden files, the fixtures and the pinned reference files. |
| `bench/` | The timing bench and the kill-storm. |
| `scripts/media/` | The generator for the README's pictures. It is not shipped. |
| `docs/media/` | The README's pictures. |

[SPEC.md](SPEC.md) is the design contract. Its §0 lists the amendments, which win over the sections after it: §0.9 is the HUD and §0.10 the defaults. If you change behaviour, change SPEC too.

## Run the checks

Every pull request needs these three green:

```bash
npm run typecheck          # tsc, strict
npm test                   # builds, then runs every test (about 500, a few minutes)
npm run test:hud-coverage  # the HUD's modules at 100% lines, branches and functions
```

`npm run test:unit` runs only the fast unit tests while you work.

### Golden files

Most of the output is pinned byte for byte. Each case in `test/fixtures/cases/` is one JSON file: the payload Claude Code would send, the config, and the state of the caches, the git repo and the transcript. `test/golden/` holds what `dist/hungerbar.mjs` must print for it, once per mode (colour, no colour, ASCII, and several widths). In `.ansi` files, `␛` stands for the escape character.

The tests pin the clock (`HUNGERBAR_NOW`), turn the background refreshers off (`HUNGERBAR_NO_SPAWN`) and map shown paths like `D:/webapp` onto temp folders (`HUNGERBAR_FS_MAP`), so the goldens look like a real machine but never depend on yours.

After a change that is meant to alter the output:

```bash
npm run golden:update
git diff test/golden       # read every changed line before you commit
```

### The oracles

Two looks were designed outside this code, and the tests hold the code to those designs:

- **The classic look** was picked in `test/reference/hungerbar-picker-3.html`. `test/picker.test.ts` runs that page's own renderer and requires the same bytes from Hungerbar.
- **The HUD** was designed in a separate engine, vendored as `test/reference/hud4.js`. `src/hud/` is a TypeScript port of the part Hungerbar ships. `test/hud.oracle.test.ts` renders thousands of random states with both and requires the same spans, colour for colour. `test/hud.reference.test.ts` checks that the vendored files still have the sha256 hashes in `test/reference/SOURCES.json`, and that the engine still draws the frozen renders of the design rounds.

The oracle run in `npm test` uses 4,000 random states. Before a release, run the long one once. It takes a long time. In PowerShell:

```powershell
$env:HUD_ORACLE_N = 200000
node --test test/hud.oracle.test.ts
Remove-Item Env:HUD_ORACLE_N
```

In Git Bash:

```bash
HUD_ORACLE_N=200000 node --test test/hud.oracle.test.ts
```

### SPEC's bundle line

`test/hud.e2e.test.ts` checks SPEC's `**Bundle.**` line against the build: the size of `dist/hungerbar.mjs`, and the earlier builds it names by commit. If your change makes the bundle bigger or smaller, update the size in that line, and the bytes it says this version added. The earlier builds are commits from before the first public release, so they are not in a clone of this repository. There, the two tests that read them skip themselves; the size checks always run.

### Speed

```bash
npm run bench          # Claude Code-style timings against SPEC §17's budgets, the HUD beside classic
npm run killstorm      # Windows: 500 killed runs, and no leftover process is allowed
```

Timings depend on the machine and on what else it is doing, so compare runs on the same machine.

## The README's pictures

Every GIF and picture in `docs/media/` is made from real renders:

```bash
node scripts/media/make.mjs                  # all of them
node scripts/media/make.mjs hero idle        # only these
```

The names are `hero`, `fable`, `git`, `pr`, `center`, `idle`, `frame`, `setup`, `classic` and `anatomy`; each scene is in `scripts/media/scenes/`. The generator works in a new `hungerbar-media-*` folder inside your temp folder, or inside the folder `--work <dir>` names, and deletes only that new folder when it is done. `--keep` keeps it, with every frame, and prints where it is. The generator runs `dist/hungerbar.mjs` in a sandbox with its own home, config, cache, transcript and git repo, so nothing of yours is read or changed, and nothing uses the network. It draws each frame on Windows Terminal's grid in headless Microsoft Edge and encodes the GIFs with ffmpeg. It needs Edge (`EDGE=<path>` points at another one), ffmpeg (`FFMPEG=<path>`, else `ffmpeg` on `PATH`), and the fonts Windows Terminal uses: Cascadia Mono, Segoe UI Emoji, Segoe UI Symbol and Yu Gothic UI. Before it saves a picture, it checks that no frame shows your user name, your home folder or your checkout's path.

If your change alters what the HUD draws, please make the pictures again and include them.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm run typecheck` and `npm test` on `windows-latest` with Node 22 and Node 24, on every push to `main` and every pull request. A hosted runner has no Claude Code, no Windows Terminal and no logged-in `gh`, and it runs as Administrator. The tests do not need any of these: they pin the names, the elevation, the terminal settings and the GitHub CLI where it matters. One test, the one for a symbolic link to `settings.json`, skips itself where Windows does not allow symbolic links (without Developer Mode or Administrator rights), so on most desktops it shows as skipped. The two tests that read the commits SPEC's bundle line names skip themselves too, since a clone does not have those commits (see [SPEC's bundle line](#specs-bundle-line)).

## Writing style

The README, the messages Hungerbar prints and the comments are written for people who read them once. Use plain words and short sentences. Say exactly what happens, and make sure every claim is true of the code.

## Pull requests

- Keep each pull request to one change, with its tests.
- Add a line to [CHANGELOG.md](CHANGELOG.md) under a new "Unreleased" heading if users will notice the change.
- By contributing, you agree that your work is released under the [MIT License](LICENSE).
