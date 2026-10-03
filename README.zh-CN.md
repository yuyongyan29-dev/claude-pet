# Claude Pet — Clawd 住在你的 Claude Code 里

[English](README.md) · **简体中文**

<p align="center"><img src="docs/hero.gif" alt="Clawd walking" width="640"></p>

**Clawd** 是一只像素宠物，它在 Claude Code 输入框上方来回散步，并对 Claude 正在做的事做出反应：思考时托腮，搜索时东张西望，跑命令时敲笔记本，等你回答时挥手，深夜会打瞌睡。

## 实际效果

**终端（Ghostty）**

<img src="docs/terminal.gif" alt="Clawd in the terminal" width="320">

**桌面端（Claude 桌面应用 Code 标签页）**

<img src="docs/desktop.gif" alt="Clawd in the Claude desktop app" width="300">

## 动作一览

| | | | |
|:-:|:-:|:-:|:-:|
| <img src="docs/think.gif" width="144" alt="思考"> | <img src="docs/laptop.gif" width="144" alt="跑命令"> | <img src="docs/wave.gif" width="144" alt="等你回答"> | <img src="docs/lightbulb.gif" width="144" alt="/pet idea"> |
| 思考 | 跑命令 | 等你回答 | /pet idea |
| <img src="docs/dance.gif" width="144" alt="/pet dance"> | <img src="docs/breakdance.gif" width="144" alt="/pet breakdance"> | <img src="docs/hula.gif" width="144" alt="/pet hula"> | <img src="docs/jump.gif" width="144" alt="/pet jump"> |
| /pet dance | /pet breakdance | /pet hula | /pet jump |
| <img src="docs/confetti.gif" width="144" alt="/pet party"> | <img src="docs/meditate.gif" width="144" alt="/pet meditate"> | <img src="docs/dizzy.gif" width="144" alt="/pet spin · 连点太多"> | <img src="docs/hats.gif" width="144" alt="/pet hat …"> |
| /pet party | /pet meditate | /pet spin · 连点太多 | /pet hat … |



## 功能

- **跟随 Claude 的状态**：思考、搜索、编辑、执行命令、调用子代理、等待你回答、上下文快满时，Clawd 各有不同动作和气泡。
- **养成**：可以喂食、抚摸；等级按 Claude Code 累计消耗的 token 计算（每 1 亿 token 升 1 级），升级会解锁新动作和称号（Hatchling → Explorer → Dancer → … → Infinite）。
- **帽子**：巫师帽、忍者头带、礼帽、牛仔帽、宇航员头盔、皇冠。
- **点击互动**：点一下 Clawd 就是摸摸它，连点太多它会转晕。
- **图片终端高清显示**：在 Ghostty、kitty、iTerm2 中按像素图绘制；其他终端用方块字符绘制。桌面版 Code 标签页同样可用。
- **可选音效**：反应时的小段 8-bit 音效，默认关闭。

## 环境要求

- 支持 **mods**（插件通过 `hooks/hooks.json` 中的 `modules` 加载函数式 hooks）的 Claude Code 版本，终端 CLI 或桌面应用的 Code 标签页均可。
- 想看到像素级画面，建议使用 Ghostty、kitty 或 iTerm2。

## 安装

在 Claude Code 中依次执行：

```
/plugin marketplace add yuyongyan29-dev/claude-pet
/plugin install clawd-pet@claude-pet-market
```

安装后新开一个会话，Clawd 就会出现在输入框上方。

**更新**：

```
/plugin marketplace update claude-pet-market
```

**卸载**：

```
/plugin uninstall clawd-pet@claude-pet-market
```

## 命令

所有操作都通过 `/pet` 完成，`/pet help` 可随时查看。

| 命令 | 作用 |
| --- | --- |
| `/pet` | 显示 / 隐藏（隐藏只持续到本次会话结束） |
| `/pet feed` · `/pet pat` | 喂食 · 摸摸 |
| `/pet size 6` | 设置大小，4–40（身体所占列数）；也可用 `/pet bigger` · `/pet smaller` |
| `/pet come` · `run` · `stay` · `roam` | 过来 · 跑一圈 · 待着别动 · 继续闲逛 |
| `/pet dance` · `breakdance` · `hula` · `jump` · `hop` · `wave` · `party` · `spark` · `idea` · `think` · `meditate` · `spin` … | 表演动作（部分需要更高等级才解锁） |
| `/pet hat wizard` · `ninja` · `tophat` · `cowboy` · `astronaut` · `crown` · `off` | 戴帽子 / 摘帽子 |
| `/pet name 小龙虾` | 改名 |
| `/pet sound on` · `off` | 开 / 关音效 |
| `/pet hd` · `/pet pixel` | 切换高清图片 / 像素方块显示 |
| `/pet stats` | 查看等级、称号、饱食度、心情、已学会的动作 |

## 数据存储

宠物状态（名字、等级、饱食度、帽子、大小等）保存在 Claude 配置目录下的 `clawd-pet.json`（通常是 `~/.claude/clawd-pet.json`）。删除该文件即可重置。插件不联网，不上传任何数据。

## 常见问题

- **装好了看不到 Clawd？** 先执行 `/pet` 确认没被隐藏；再确认 Claude Code 版本支持 mods；最后重开会话。
- **显示成方块而不是像素图？** 当前终端不支持图片协议。换用 Ghostty / kitty / iTerm2，或执行 `/pet hd` 切换。
- **太大或太小？** `/pet size 4` 到 `/pet size 40` 自由调整。

## 致谢

Clawd 及其动画来自 Claude 桌面应用中 Anthropic 的 clawd-quest 素材。本项目为非官方粉丝作品，与 Anthropic 无关，也未获其认可。
