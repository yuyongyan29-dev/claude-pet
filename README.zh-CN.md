# Claude Pet — Clawd 住在你的 Claude Code 里

[English](README.md) · **简体中文**

<p align="center">
  <a href="#安装">安装</a> ·
  <a href="https://github.com/yuyongyan29-dev/claude-pet"><strong>⭐ 给仓库点 Star</strong></a> ·
  <a href="#命令">命令</a>
</p>

<p align="center"><img src="docs/hero.gif" alt="Clawd walking" width="640"></p>

**Clawd** 是一只像素宠物，它在 Claude Code 输入框上方来回散步，并对 Claude 正在做的事做出反应：思考时托腮，搜索时东张西望，跑命令时敲笔记本，等你回答时挥手，深夜会打瞌睡。

> **喜欢 Clawd？[给 Claude Pet 一颗 Star ⭐](https://github.com/yuyongyan29-dev/claude-pet)** — 点击仓库右上角的 **Star**，让更多 Claude Code 用户发现这只编程小伙伴。

## 环境要求

- 终端需要 Claude Code **2.1.287+**；桌面版 Code 标签页内的 Claude Code 需要 **2.1.286+**，见[官方版本要求](https://code.claude.com/docs/en/plugins/mods/overview#turn-mods-on-or-off)。本地验证使用 2.1.292。
- 宠物界面适用于交互式终端和桌面 Code 标签页；`claude -p`、VS Code 扩展面板和云端会话不会显示。桌面版运行在 WSL 中的会话不支持 mods。
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
/plugin update clawd-pet@claude-pet-market
```

**卸载**：

```
/plugin uninstall clawd-pet@claude-pet-market
```

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

## 命令

随时执行 `/clawd-pet help` 查看命令。其他 mod 没有注册 `/pet` 时，它可作为简写。下表的所有命令都可以把 `/pet` 换成 `/clawd-pet`。

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

设置、养成状态和 token 计数保存在 Claude Code 的插件存储中。每个会话写入自己的记录，并发会话不会覆盖彼此的 token 增量或不同设置。记录较大或超过插件存储容量时，会存档到 Claude 配置目录的 `clawd-pet-history/`。已有的 `clawd-pet.json` 会被导入，原文件保持不变。

配置目录优先使用 `CLAUDE_CONFIG_DIR`，其次是 `HOME/.claude`，Windows 上还支持 `USERPROFILE/.claude`。如需重置，请先关闭所有使用此 mod 的会话，再删除配置目录下 `plugins/store/` 中属于本插件的存储文件（保留其他插件的文件），以及存在的 `clawd-pet.json` 和 `clawd-pet-history/`。Claude Code 可能根据 `cleanupPeriodDays` 设置清理长期未使用的插件存储。插件不联网，不上传任何数据。

## 常见问题

- **装好了看不到 Clawd？** 执行 `/clawd-pet show`，检查版本及 `/plugin` 中的已启用 mods，再重开会话。如果其他 mod 占满输入框上方的区域，请增大终端窗口。
- **显示成方块而不是像素图？** 图片不可用时会自动改用方块，稍后重试。`/clawd-pet pixel` 保持方块模式，`/clawd-pet hd` 重新尝试图片。Ghostty / kitty / iTerm2 支持图片显示。
- **太大或太小？** `/pet size 4` 到 `/pet size 40` 自由调整。

## 兼容性与开发

Clawd 会保留其他 mod 的区域内容，根据剩余空间缩小；没有剩余行时让出位置。发布了可选 forecast 接口的 token-weather 可与 Clawd 共用一行；没有这个接口的原版继续独立显示。如果其他 mod 直接替换整个区域且不包含 `next(e)` 的结果，仍可能遮住 Clawd 和其他 mod。

见[兼容性说明及官方 API 参考](docs/mod-compatibility.md)。在仓库根目录执行：

```sh
claude plugin validate clawd-pet
claude plugin validate .
claude plugin test clawd-pet
```

## 许可证

代码部分采用 [MIT 许可证](LICENSE)。Clawd 角色及其美术素材（`clawd-pet/frames/`、`clawd-pet/frames-hat/`、`clawd-pet/hooks/sprites.ts` 中的精灵数据，以及 `docs/` 中的 GIF，见 [NOTICE](NOTICE)）归 Anthropic 所有，**不在** MIT 许可范围内。

## 致谢

Clawd 及其动画来自 Claude 桌面应用中 Anthropic 的 clawd-quest 素材。本项目为非官方粉丝作品，与 Anthropic 无关，也未获其认可。
