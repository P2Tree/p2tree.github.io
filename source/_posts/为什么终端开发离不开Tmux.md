---
title: 为什么终端开发离不开 Tmux
tags:
  - Tmux
  - 终端开发
  - Terminal
  - 软件工具
categories: 软件工具
index_img: /img/20230623/index.webp
banner_img: /img/20230623/index.webp
cover: /img/20230623/index.webp
top_img: /img/20230623/index.webp
abbrlink: "3229e191"
date: 2023-06-23 10:00:00
---

## 开头叨叨

我在每天的软件开发工作中都离不开 tmux，它极大的提高了我的工作效率，我使用它优化我的工作流程，维护开发环境，并结合其他工具扩展软件开发的体验感。

如果你之前还没有听说过这个软件，我建议你花 20 分钟了解一下它。有非常多的程序员使用这个软件，尤其是需要连接到远程服务器进行开发的同学。但我发现目前中文网络上还很少有能系统的讲解 “为什么要使用 tmux” 的文章，大多数文章都是直接开门见山地罗列怎么配置 tmux，再拉个表格梳理难以记忆的快捷键清单。

在这篇文章中，我不会花大篇幅介绍怎么使用 tmux，而是告诉你为什么要用它，以及我自己实践很多年的使用技巧。

## 三个 tmux 组件

在使用 tmux 之前，有三个重要的概念一定要了解，分别是 session，window 和 pane。简单介绍下。

- session 是会话，也就是和操作系统建立的一次通信状态，不过 tmux 中的 session 不同于直接用 shell 建立的 session，可以理解成一种虚拟 session；session 包含 window，默认启动 session 后会带有 1 个 window。
- window 就是窗口，也就是展示在屏幕上能看到的全部内容，可以看做是窗口类软件的 tab；window 包含 pane，默认带有 1 个 pane。
- pane 就是每一个分屏的窗格，tmux 允许对一个 window 做分屏，每个 “子屏“ 都叫做一个 pane。

tmux 提供了各种快捷键来 create、rename、move、delete 这些组件，以及可以便捷的在这些组件之间切换。你可以任意使用这些组件搭建自己的工作环境。

## 我的 tmux 工作流

这里我介绍下我的环境，这是我工作中的一张截图：

![Tmux工作截图](/img/20230623/img1.png)

tmux 体现在最下边一行，这一行叫做 tmux 状态栏。左下角是 当前聚焦的 session、window、pane 的 index，也就是光标所在的位置。这个单纯就是美观，实际工作中用处不大。

中间部分是当前 session 中所有 window 的 list，以及当前所在的 window。这个在切换 window 时可以参考。

右边只是一个日期和时间，用处也不是很大。

日常开发中，我的工作流是这样的：

- 第一个窗口开发，第二个测试，第三个调试。可以随时开启临时窗口完成一些其他功能，用完后关闭。窗口之间切换使用 `shift + left` 和 `shift + right` ，操作和 window list 显示布局一致。非活跃窗口有消息时，状态栏会高亮提示。
- 每个窗口上的布局都不同，开发窗口左边用来编码，右边用来编译和 shell 操作。在编码时，会将左边 pane 全屏。pane 之间切换使用 `ctrl + h`，`ctrl + j`，`ctrl + k` 和 `ctrl + l`，vim 癌晚期患者必备（vim 内部分屏切换也是这套按键，之后讲 vim 时我会提到怎么配置）。
- 以上所有布局都是同一个会话，这个会话用来做一件事情。当有其他更紧急的事情接手时，我会开启新的会话。经常有人找我验证一些其他问题，或者我手里同时有两三件事在推进，打工人都懂 😂。
- 下班后，直接关闭终端走人，第二天开终端后，我提前配好了 ssh 授信，所以可以自动连接并进入 tmux 环境。如果有多个 session，系统会询问我现在打算进入哪个 session。

## 最主要的功能点

那么，简单来说，tmux 有哪些很难被其他软件完美替代的功能呢？

- 会话管理
    
    tmux 可以将会话和终端相分离。简单说就是我们使用终端运行任务，之后关闭终端或远程断开连接，都不影响任务的继续运行。这样我可以做到下班时断开 ssh 连接就好了，第二天上班建立 ssh 连接就可以恢复昨天的开发界面、窗口布局，以及查看昨晚编译和测试的结果。
    
    当程序员为了快速恢复环境而不关电脑，与公司为了省电要求下班关电脑之间产生冲突时，tmux 就是一个完美的解决方案 🐶。
    
    另外，你也不会希望遇到因为网络问题或电脑死机，导致 ssh 断连后，运行的程序和任务被 kill 掉的结果吧。
    
    另一个类似的软件是 screen，但 tmux 比 screen 要好用很多，建议使用 tmux。
    
- 分屏
    
    现在大多数终端软件都可以做到分屏，本地开发工作中， tmux 的分屏功能并不是必要的，甚至终端软件的分屏功能都不是必要的，完全可以使用 dwm 这种窗口管理器实现。
    
    但如果你是在远程服务器上开发，那么 tmux 的分屏还是很重要的，这意味着你不需要和服务器建立多个 ssh 连接。
    
- 自动化创建环境
    
    远程服务器并不常关机，所以启动 tmux 服务之后，一次配置好窗口布局和环境，可能很长时间都不需要再次配置了。
    
    但如果某一天你们 IT 突然发邮件说今晚 10 点停机维护，是不是就意味着我们的布局要重新配置了？
    
    其实不一定，tmux 的布局创建都是利用 tmux 指令来完成的，可以将创建布局的指令按类似 shell 脚本的原理配置好，每次需要配置时运行一次就好了。运行指令脚本需要 tmux 辅助工具，比如 tmuxp 来完成。
    
- 共享会话
    
    在远程开发工作中，我们可以将多个 host 端的终端连接到同一个 tmux session，这样可以实现一些需要多屏共享的需求。我自己不太用得到这个功能。
    

## 常用的几个命令

本着不给网络环境增加冗余信息的原则，怎么安装 tmux 我就不展开了。可以在这里了解：[Tmux 使用教程 - 阮一峰的网络日志 (ruanyifeng.com)](https://www.ruanyifeng.com/blog/2019/10/tmux.html)

tmux 可以添加参数使用。以下是我常用的命令：

```bash
# 启动新 session
tmux

# 查看 session list
tmux ls

# 接入 session
tmux attach -t <session id/name>

# 关闭 session
tmux kill-session -t <session-id/name>

# 脱离 session
tmux detach

# 切换 session
tmux switch -t <session-id/name>

# 重命名 session
tmux rename-session -t <session-id/name> <new-name>
```

## 我的使用技巧

看到这里，想必我应该介绍清楚 tmux 为什么是终端开发必备软件了。

说它是神器，可能过誉了，但说它必不可少，这反而是大实话。不过，应该有很多小伙伴会在使用 tmux 时，被它复杂难懂的配置脚本和快捷键劝退。这部分内容，我会介绍一下我在使用 tmux 这些年，总结出来的一些经验和使用技巧，方便你再一次尝试这个软件，或者——如果你已经在用了——改进你的工作流。

### 1 tmux 版本

如果你刚刚使用 tmux，并且被配置脚本困扰，也许你会去网上搜搜别人是怎么配置的，然后拿过来后，却发现并不一定起作用，那么你可能需要考虑看看自己的 tmux 版本。

tmux 目前的最新版本是 3.3a，但很多 Linux 发行版中内置的 tmux 却是很久前的 2.6 甚至 2.2 版本。很遗憾，tmux 在版本更新过程中多次调整了它的配置接口，所以你参考的网上的配置和你自己使用的 tmux 版本可能不匹配。更悲剧的是，大多数人并没有意识到这个问题，所以他们在上传自己配置时，并不会说清这套配置的版本号。

我自己的 tmux 配置中写明了版本号，这应该是大家都去注意的，一个完善的配置文件，应该写清楚它适用的软件版本、运行说明、注意事项等。

使用 `tmux -V` 可以查看 tmux 版本。

### 2 修改键位

tmux 的默认键位是很反人类的，不但很难记得住，而且点击起来也很别扭。prefix 键，也就是 tmux 前缀键，本来其实就是两个键（默认的 `ctrl + b`），然而有些功能，却还需要 `shift` 键参与，比如 `prefix + %` ，看着像是两个键，实际上是四个键参与（`ctrl + b`, `shift + 5` ）。

每个人都会有自己的使用习惯，但大家能统一意见的始终是用 tmux 一定要改键。我的一些键位修改供参考：

- prefix 键：`ctrl + a`
- 水平分屏：`prefix + -`
- 垂直分屏：`prefix + \\`
- pane 之间移动：`ctrl + h`，`ctrl + j`，`ctrl + k`，`ctrl + l`
- window 之间移动：`shift + left`，`shift + right` （就是左右方向键）

还有几个常用的按键没有改键：

- 创建 window：`prefix + c`
- 重命名 window：`prefix + ,`
- 将当前 pane 全屏：`prefix + z`

### 3 复制粘贴

这个问题应该是网络上和 tmux 相关的问题中，搜索次数最多的问题了。同样的，在不同版本的 tmux 中，解决这个问题的方案并不相同。在最新的 3.3a 版本中，我认为复制粘贴的功能已经比较好用了。

- 第一种情况，在本机使用 tmux。
    
    tmux 原生支持的方案是：使用 `prefix + [` 进入选择模式，控制光标到一段文字的开头，`space` 开始选择，继续移动光标选中需要复制的内容，`enter` 确认复制，并自动退出选择模式。这时内容就会被复制到剪切板。`prefix + ]` 来粘贴。如果 tmux 配置开启了鼠标增强模式，还可以用鼠标选取内容，右键弹出菜单操作。
    
    如果你的终端能支持适配 tmux，那么直接用鼠标选取内容，内容就会自动复制到系统剪切板中，右键粘贴或弹出右键菜单粘贴，比如 mac 上使用 iterm2 可以做到。
    
- 第二种情况，通过远程终端连接使用 tmux。
    
    tmux 无法解析出你在 host 端选取的文字，也就无法把它复制到剪切板中，所以不能依赖鼠标选择。你依然可以使用的是 tmux 原生方案，因为 tmux 会将内容复制到服务器那边系统的剪切板，那么在终端中再粘贴也就没有问题了。
    
    但是，如果希望将内容复制到 host 这边，这种办法就行不通了。可行的办法是直接利用当前终端的复制粘贴功能，直接鼠标选择文本来复制和粘贴。如果开启了鼠标增强模式，那么 tmux 会接管鼠标选择功能，绕开它的办法是按住 `shift` 键的同时来选择复制和粘贴。当然，这种方法自动滚屏就失效了。
    
    还有一种我听说的方案，是利用其他软件专门同步远程服务器的剪切板和 host 机器的剪切板，Github 上有类似的项目，感兴趣可以了解一下。
    

如果我说的这些还不能满足你的需要，可能你得自己再摸索摸索了，远程访问模式本来对复制粘贴就不友好，也许最不会产生心智负担的方案就是文件传输吧 😆。

我自己不常使用复制粘贴的功能，粘贴代码这种行为，往外边粘，公司安全部门不同意，往里边粘，公司法务部门不开心。如果是粘贴报错信息或者运行日志，可能提炼关键点更有利于解决问题。

### 4 美化

有关于状态栏的美化就不说了，网络上很多类似的帖子。

我说几个不常见的：

- tmux 和 neovim 配合实现不同 mode 下变化光标样式：
    
    在 .tmux.conf 中配置这个命令：
    
    ```tmux
    set-option -sa terminal-overrides '*:Ss=\\E[%p1%d q:Se=\\E[ q'
    ```
    
    一定要注意一点，这个配置 是在 neovim 0.9 + zsh + tmux 3.3a 下才能生效。vim 需要配置一下也能实现相同的效果。你可能还需要考虑不同终端软件可能对光标样式做的主动更改。
    
- 斜体字体。如果终端能够显示斜体字，但打开 tmux 中却不显示，那么需要这么配置：
    
    在用户根目录下创建名为 `screen-256color.terminfo` 的文件，内容为：
    
    ```bash
    # A screen-256color based TERMINFO that adds the escape sequences for italic.
    #
    # Install:
    #
    #   tic screen-256color.terminfo
    #
    # Usage:
    #
    #   export TERM=screen-256color
    #
    screen-256color|screen with 256 colors and italic,
            sitm=\\E[3m, ritm=\\E[23m,
            use=screen-256color,
    ```
    
    终端执行以下命令：
    
    ```bash
    $ tic screen-256color.terminfo
    ```
    
    在 shell 脚本中配置这个环境变量并 source：
    
    ```bash
    export TERM=screen-256color
    ```
    
    在 .tmux.conf 中加入以下配置：
    
    ```bash
    set -g default-terminal "screen-256color"
    ```
    
    为了在 vim 中也能显示斜体字，还需要在 .vimrc 中加入以下配置：
    
    ```vimrc
    let &t_ZH="\\e[3m"
    let &t_ZR="\\e[23m"
    
    # 或者如果是 neovim，在 init.lua 中加入：
    vim.g.t_ZH = "\\\\e[3m"
    vim.g.t_ZR = "\\\\e[23m"
    ```
    
- 支持真彩色
    
    真彩色是 24 位颜色，比 256-color（8 位）更艳丽，对于很多插件，尤其是终端和 vim 中的色彩主题，开启真彩色会显示更好的视觉效果。
    
    首先需要你的终端支持真彩色，新一些的终端都支持，可以使用这个脚本验证：
    
    ```bash
    curl -fL <https://raw.githubusercontent.com/Beavan/tools/master/sh/24-bit-color.sh> |bash
    ```
    
    如果显示的颜色条没有明显的色彩块边界，那么就是真彩色了。
    
    在 .tmux.conf 中加入：
    
    ```tmux
    set -g default-terminal "screen-256color"
    set-option -ga terminal-overrides ",*256col*:Tc"
    ```
    
    vim 中支持真彩色，还需要在 .vimrc 中加入：
    
    ```tmux
    set termguicolors
    
    # neovim 在 init.lua 中加入
    vim.opt.termguicolors = true
    ```
    
- 实现当前 pane 的背景突出显示。
    
    iterm2 有这么个效果，当分屏后，当前光标所在屏幕会正常显示，而其他屏幕会变灰。tmux 也可以实现这种效果。
    
    在 .tmux.conf 中添加这个配置：
    
    ```tmux
    set -g window-style 'fg=grey62,bg=grey19'
    set -g window-active-style 'fg=terminal,bg=terminal'
    ```
    
    颜色可以自己随意改，试了下是 256 color。效果不如 iterm2 好，但我感觉足够用了。
    
- 状态栏背景和终端样式保持一致。
    
    比如说我的终端是磨砂效果，我不想显示 tmux 的绿色大横条。那么可以配置 status bar 的 style：
    
    ```tmux
    # 在 3.2 及更新版本中
    set-option -g status-style bg=default
    
    # 在较旧的版本中
    set-option -g status-bg default
    ```
    

## 简单总结

这些内容零散的躺在我的笔记中很久了，终于有机会整理成文。

如果你之前没有使用过 tmux，看过这篇文章可能并不会帮你完全熟悉这个软件，任何软件的熟练使用都依赖于 “尝试” 和 “探索”。如果能吸引你 “入坑”， 或者其中有一些能值得你参考的内容，那我这篇文章就没白写。

有疑问和请求都可以给我留言，也请 feel free 指出文中的错误。

---
{% note info %}
本文同步发布在知乎账号下：[为什么终端开发离不开 Tmux - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/639084118)
{% endnote %}
