// Subcommands other than the render and the internal refreshers.
import { VERSION, type Env } from '../env.ts';
import { say } from './args.ts';
import { doctor } from './doctor.ts';
import { glyphs } from './glyphs.ts';
import { icons } from './icons.ts';
import { look } from './look.ts';
import { mirror } from './mirror.ts';
import { preview } from './preview.ts';
import { setup } from './setup.ts';
import { totem } from './totem.ts';

const HELP = `hungerbar ${VERSION}: a Claude Code status line (limits drain and refill like a Minecraft hunger bar)

usage:
  hungerbar                      render from stdin (Claude Code runs this); a terminal shows the demo
  hungerbar preview [--situation normal|tight|fresh|extra|fable|agents|all] [--payload f.json]
                    [--look classic|hud] [--fable off|tail|tooltip|boss|beacon] [--align left|center]
                    [--pr on|off] [--user off|user|user@host] [--op off|tag|gold] [--bed on|off] [--phantoms on|off]
                    [--ultra on|off] [--poison on|off] [--totem on|off]
                    [--agents off|allays|bees] [--pickaxe tiers|plain]
                    [--width N] [--icons minecraft|unicode|ascii] [--now T] [--no-color]
  hungerbar look [classic|hud] [--fable off|tail|tooltip|boss|beacon] [--align left|center] [--print]
                 [--pr on|off] [--user off|user|user@host] [--op off|tag|gold] [--bed on|off] [--phantoms on|off]
                 [--ultra on|off] [--poison on|off] [--totem on|off]
                 [--agents off|allays|bees] [--pickaxe tiers|plain]
                                 shows or switches the look: Classic Plus or the Minecraft HUD (hungerbar.json only)
  hungerbar glyphs [--hud]       width ruler for the icons (--hud: the Minecraft HUD's)
  hungerbar doctor [--bench]     checks the install and times a render
  hungerbar refresh usage        asks the usage API now and prints what came back (network.usageApi)
  hungerbar totem [<n> [--until <date>] [--kind full|5h|week|fable] | add [<n>] … | use | clear] [--print]
                                 the limit resets Anthropic gave you, as the HUD's Totem of Undying (hungerbar.json)
  hungerbar setup [--print] [--launcher] [--node <path>] [--icons plain|colour]
                  [--look classic|hud] [--fable off|tail|tooltip|boss|beacon] [--align left|center]
                  [--pr on|off] [--user off|user|user@host] [--op off|tag|gold] [--bed on|off] [--phantoms on|off]
                  [--ultra on|off] [--poison on|off] [--totem on|off]
                  [--agents off|allays|bees] [--pickaxe tiers|plain]
                                 a terminal asks for the look when --look is not given
  hungerbar setup --restore      puts the previous status line back
  hungerbar icons [plain|colour] shows or switches the icon style (a Windows Terminal font setting)
  hungerbar mirror <dir>         from a source checkout: copies its source, build and tarballs into a folder
  hungerbar --version`;

export async function runCli(args: string[], env: Env, self: string): Promise<number> {
  const [cmd, ...rest] = args;
  switch (cmd) {
    case 'preview': return preview(rest, env);
    case 'look': return look(rest, env, self);
    case 'glyphs': return glyphs(rest);
    case 'doctor': return doctor(rest, env, self);
    case 'setup': return setup(rest, env, self);
    case 'mirror': return mirror(rest, self);
    case 'totem': return totem(rest, env, self);
    case 'icons': return icons(rest, env);
    case 'version': case '--version': case '-v':
      say(VERSION);
      return 0;
    case 'help': case '--help': case '-h':
      say(HELP);
      return 0;
    default:
      process.stderr.write(`hungerbar: unknown command "${cmd}"\n\n${HELP}\n`);
      return 1;
  }
}
