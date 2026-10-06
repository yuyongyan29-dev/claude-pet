# Claude Pet — Clawd lives in your Claude Code

**English** · [简体中文](README.zh-CN.md)

<p align="center">
  <a href="#install">Install</a> ·
  <a href="https://github.com/yuyongyan29-dev/claude-pet"><strong>⭐ Star this repo</strong></a> ·
  <a href="#commands">Commands</a>
</p>

<p align="center"><img src="docs/hero.gif" alt="Clawd walking" width="640"></p>

**Clawd** is a pixel pet that strolls along the band above your Claude Code prompt and reacts to what Claude is doing: chin in hand while thinking, looking around while searching, typing on a laptop while running commands, waving when it's waiting for you, and dozing off late at night.

> **Like Clawd? [Give Claude Pet a star ⭐](https://github.com/yuyongyan29-dev/claude-pet)** — click **Star** at the top right of this repository. It helps other Claude Code users discover their next coding companion.

## Requirements

- Claude Code **2.1.287+** in the terminal, or **2.1.286+** in the desktop app's Code tab, per the [official mods requirements](https://code.claude.com/docs/en/plugins/mods/overview#turn-mods-on-or-off). Local validation uses 2.1.292.
- The pet UI appears in interactive terminal sessions and the desktop Code tab. It does not appear in `claude -p`, the VS Code extension panel, or cloud sessions; Desktop sessions running in WSL do not support mods.
- For the pixel image, use Ghostty, kitty or iTerm2.

## Install

Run these in Claude Code:

```
/plugin marketplace add yuyongyan29-dev/claude-pet
/plugin install clawd-pet@claude-pet-market
```

Start a new session and Clawd appears above the prompt.

**Update**

```
/plugin marketplace update claude-pet-market
/plugin update clawd-pet@claude-pet-market
```

**Uninstall**

```
/plugin uninstall clawd-pet@claude-pet-market
```

## Moves

| | | | |
|:-:|:-:|:-:|:-:|
| <img src="docs/think.gif" width="144" alt="thinking"> | <img src="docs/laptop.gif" width="144" alt="running a command"> | <img src="docs/wave.gif" width="144" alt="waiting for you"> | <img src="docs/lightbulb.gif" width="144" alt="/pet idea"> |
| thinking | running a command | waiting for you | /pet idea |
| <img src="docs/dance.gif" width="144" alt="/pet dance"> | <img src="docs/breakdance.gif" width="144" alt="/pet breakdance"> | <img src="docs/hula.gif" width="144" alt="/pet hula"> | <img src="docs/jump.gif" width="144" alt="/pet jump"> |
| /pet dance | /pet breakdance | /pet hula | /pet jump |
| <img src="docs/confetti.gif" width="144" alt="/pet party"> | <img src="docs/meditate.gif" width="144" alt="/pet meditate"> | <img src="docs/dizzy.gif" width="144" alt="/pet spin · clicked too much"> | <img src="docs/hats.gif" width="144" alt="/pet hat …"> |
| /pet party | /pet meditate | /pet spin · clicked too much | /pet hat … |


## Features

- **Follows Claude's state**: thinking, searching, editing, running commands, calling subagents, waiting for your answer, or running low on context — each has its own animation and caption.
- **Grows with you**: feed it and pat it. Its level tracks your lifetime Claude Code token usage (one level per 100M tokens) and unlocks new moves and titles (Hatchling → Explorer → Dancer → … → Infinite).
- **Hats**: wizard hat, ninja headband, top hat, cowboy hat, astronaut helmet, crown.
- **Click to interact**: click Clawd to pat it; click too much and it gets dizzy.
- **Pixel-perfect where possible**: drawn as a real image in Ghostty, kitty and iTerm2; block characters elsewhere. Works in the desktop app's Code tab too.
- **Optional sounds**: tiny chiptune reactions, off by default.

## Commands

Use `/clawd-pet help` anytime. `/pet` is a shorter alias when another mod has not registered that name. Every command below also works with `/clawd-pet` in place of `/pet`.

| Command | What it does |
| --- | --- |
| `/pet` | Show / hide (hiding lasts until the session ends) |
| `/pet feed` · `/pet pat` | Feed · pat |
| `/pet size 6` | Size 4–40 (body width in columns); also `/pet bigger` · `/pet smaller` |
| `/pet come` · `run` · `stay` · `roam` | Come here · run a lap · stay put · wander again |
| `/pet dance` · `breakdance` · `hula` · `jump` · `hop` · `wave` · `party` · `spark` · `idea` · `think` · `meditate` · `spin` … | Tricks (some unlock at higher levels) |
| `/pet hat wizard` · `ninja` · `tophat` · `cowboy` · `astronaut` · `crown` · `off` | Put on / take off a hat |
| `/pet name Crabby` | Rename |
| `/pet sound on` · `off` | Sounds on / off |
| `/pet hd` · `/pet pixel` | Switch between image and block rendering |
| `/pet stats` | Level, title, hunger, mood, moves learned |

## Data

Settings, care, and token counts persist locally in Claude Code's plugin store. Each session writes its own record, so simultaneous sessions retain token increments and changes to different settings. Large records, or saves exceeding the store limit, are archived in `clawd-pet-history/` in your Claude config directory. Existing `clawd-pet.json` saves are imported and left untouched.

The config directory comes from `CLAUDE_CONFIG_DIR`, or `HOME/.claude`, or `USERPROFILE/.claude` on Windows. To start over, close all sessions using this mod, remove its plugin store file under the config directory's `plugins/store/` (leave other plugins' files alone), and remove `clawd-pet.json` and `clawd-pet-history/` if present. Claude Code may expire an unused plugin store according to its `cleanupPeriodDays` setting. The plugin makes no network requests and uploads nothing.

## FAQ

- **Installed but no Clawd?** Run `/clawd-pet show`, check the version and the active mods listed in `/plugin`, then start a new session. Enlarge the terminal if another mod uses all the band's available rows.
- **Blocks instead of a pixel image?** Clawd falls back to blocks when images are unavailable and retries later. `/clawd-pet pixel` keeps block mode; `/clawd-pet hd` tries images again. Use Ghostty / kitty / iTerm2 for image support.
- **Too big or too small?** Anything from `/pet size 4` to `/pet size 40`.

## Compatibility and development

Clawd preserves other mods' band content and shrinks to the space left; it yields when no rows remain. Published token-weather forecasts can share its caption line. Stock versions without that optional contract keep their own display. A mod that replaces the entire band without including `next(e)` can still hide other mods, including Clawd.

See [compatibility notes and official API references](docs/mod-compatibility.md). Run the native checks from the repository root:

```sh
claude plugin validate clawd-pet
claude plugin validate .
claude plugin test clawd-pet
```

## Repository layout

```
.claude-plugin/marketplace.json   marketplace manifest (claude-pet-market)
clawd-pet/
  .claude-plugin/plugin.json      plugin manifest
  hooks/                          the mod: register.tsx, sprites, hats, click handling
  frames/ frames-hat/             pre-rendered pixel frames (plain and with hats)
  sounds/                         chiptune reaction sounds
  tests/                          mod tests (claude-code/testing)
  tools/gen_hats.py               regenerates hats.ts and frames-hat/
```

## License

The code is released under the [MIT License](LICENSE). The Clawd character and its artwork (`clawd-pet/frames/`, `clawd-pet/frames-hat/`, the sprite data in `clawd-pet/hooks/sprites.ts`, and the GIFs in `docs/`; see [NOTICE](NOTICE)) belong to Anthropic and are **not** covered by the MIT License.

## Credits

Clawd and its animations come from Anthropic's clawd-quest sprites in the Claude desktop app. This is an unofficial fan project, not affiliated with or endorsed by Anthropic.
