---
title: LLVM 后端实践笔记 9：ELF文件支持
tags:
  - 编译器
  - LLVM
categories: 软件开发
index_img: /img/20210731/index.webp
banner_img: /img/20210731/index.webp
cover: /img/20210731/index.webp
top_img: /img/20210731/index.webp
abbrlink: 949c9f6a
date: 2021-07-31 23:04:26
series: LLVM后端实践笔记
---
虽然我们的 Cpu0 模拟器只需要输入 hex 格式的编码文件就可以执行，但这一章依然介绍如何生成 ELF 文件，ELF 文件是一种通用的可执行文件、目标文件和共享库与核心转储文件标准，最早是由 System V 应用二进制接口发布，之后成为一种标准，并很快被类 Unix 操作系统接受。几乎所有支持编译的后端平台都需要生成一种可执行文件格式来执行代码，现在主流的三种可执行文件分别是 Linux 系统及裸机系统支持的 ELF 文件、Windows 系统支持的 COFF 文件以及 MacOS 系统支持的 Mach-O 文件格式。我们让 Cpu0 后端生成 ELF 文件格式。

之前章节我们介绍了 Cpu0 后端生成各种指令编码的代码，所以有关于指令编码的行为，是由 td 文件中的描述来确定的，LLVM 的公共部分已经帮我们生成了指令编码的功能。但目前还没有定义生成 ELF 文件的头部、段组成、重定位信息等内容，这一章主要实现这部分内容。

这一章，我们会使用二进制解析工具来检查 ELF 文件，比如 objdump 和 readelf 文件。需要注意的是，因为他们是 gnu 工具集的软件，在 MacOS 系统上的 objdump 和 readelf 没有默认安装，需要手动安装，并且为了和 MacOS 自身的工具做区分，还需要简单的配置环境路径。

LLVM 中有类似于 objdump 的工具，默认生成名称为 `llvm-objdump`，基本使用和 objdump 一致，我们这一章也会试用这个工具。

{% series %}

---
## 9.1 ELF 文件格式

这一节只是简单介绍，有关于详细的学习材料，在网上可以找到很多。ELF 文件格式的支持是 LLVM 默认便已经完成的，不需要我们做更多的工作（少量工作在第 2 章中已经完成）。

ELF 文件格式有两种视图，分别是目标文件视图和可执行文件视图。

目标文件视图是为链接器服务的，它的划分标准是段（Section），不同的段有 `.text` 段存放代码内容、`.data` 段存放数据、`.rodata` 段存放只读数据等，这些段的索引保存在 ELF 文件末尾的段头部表（Section header table）中。链接器通过访问段头部表来检索到各段。

可执行文件视图是为执行服务的，它的划分标准是节（Segment），不同的节可能是多个段的组合，比如执行时，因为要关心数据的访问权限，`.text` 段和 `.rodata` 段会合并为一个只读数据的节。加载器会访问位于 ELF 文件开头文件头部表之后的节头部表（Segment header table），来访问各节。

链接器和加载器的实现不会在本教程中涉及。

ELF 文件开头的文件头部表是用来描述文件基本信息的，接下来我们通过工具查看文件头部表信息。

### 9.1.1 读取 ELF 文件

工具 objdump 和 readelf 的功能类似，但我用起来觉得 objdump 更实用，大家也可以尝试；llvm-objdump 工具的用法与 objdump 工具类似。我们以 readelf 工具为例，读取 ELF 文件内容。

先编译生成一个目标文件：

```text
build/bin/llc -march=cpu0 -relocation-model=pic -filetype=obj ch5.c -o ch5.o
```

使用 readelf 工具解析 ELF 文件头部表：

```text
readelf -h ch5.o
```

除了通用的内容，比如魔数、类型、版本等，其中标明机器类型的一项，显示的是 `<unknown>: 0x3e7`，这是因为 readelf 工具是通用工具，它会记录主流机器的唯一编码，而我们的 Cpu0 并不是一个主流机器，所以它无法识别。之后我们代码生成的 llvm-objdump 才可以识别 Cpu0 的机器。

然后继续读取它的节头部表：

```text
readelf -l ch5.o
```

输出的内容是没有节头部表。这是正常的，因为我们当前生成的是目标文件，是给链接器用的，节头部表是链接器输出时在可执行文件中加入的内容。

然后我们看一下它的段头部表：

```text
readelf -S ch5.o
```

输出的内容中，可以看到各个段的基本信息，包括大小、基址、偏移等。因为段还没有经过链接，所以地址是 0。

其他参数可以通过 `-h` 参数来查看，比如 `-t` 打印详细段信息，`-r` 打印出重定位信息。

打印重定位信息时，可以看到 `_gp_disp` 符号是需要重定位的，但在汇编代码中找不到这个符号，因为这个符号是在动态链接时用来指定全局变量表位置的，由加载器决定，而在汇编代码中，我们当时设计了 `.cpload` 伪指令，这条伪指令的展开代码中有 `_gp_disp` ，所以重定位信息中才会出现这个符号。如果按照 `-relocation-model=static` 来生成目标文件，就不会出现这个符号了。

## 9.2 支持反汇编

在执行反汇编命令时：

```text
build/bin/llvm-objdump -d ch5.o
```

提示我们 cpu0 机器没有反汇编器。因为我们还没有实现反汇编，这一节我们来实现它。

### 9.2.1 文件修改

#### (1) CMakeLists.txt

需要新增反汇编代码的文件，所以在构建文件中需要增加说明。我们反汇编指令的大多数编码信息都是从 td 文件中解析的，这里指定基于 td 生成一个 inc 文件 Cpu0GenDisassemblerTables.inc，这个文件会在 Cpu0Disassembler.cpp 中用到。

#### (2) LLVMBuild.txt

同理，增加一些说明，其中要说明我们的后端支持反汇编。

#### (3) Cpu0InstrInfo.td

对一些基本类添加反汇编函数的引用。这里添加了 JumpFR 类的引用。

### 9.2.2 文件新增

新增一个子目录，以及对应的文件。

#### (1) Disassembler/Cpu0Disassembler.cpp

在这个反汇编文件中，实现了 td 文件中所有反汇编函数引用的函数，即 DecoderMethod 关键字指定的函数，尤其是对应一些特殊操作数的反汇编，比如内存引用的反汇编，因为这种特殊操作数格式是我们自定义的 td 类来定义的，所以也需要指定其反汇编方法。

#### (2) Disassembler/CMakeLists.txt 和 Disassembler/LLVMBuild.txt

另外，该路径下的 CMakeLists.txt 和 LLVMBuild.txt 文件也要一并添加。

  

以上就是所有要修改和添加的文件，llvm-objdump 无法指定处理器类型，所以无法指定当前的可执行文件是要按 Cpu032I 还是 Cpu032II 来反汇编，所以需要指定默认值，我们在 Cpu0MCTargetDesc.cpp 中指定了当 cpu 型号为空时，按照 Cpu032II 来使用。Cpu032II 的指令集能够覆盖 Cpu032I，所以能够解析所有编码。

### 9.2.3 验证结果

最后测试一下，编译源码成功后，重新反汇编目标文件：

```text
build/bin/llvm-objdump -d ch5.o
```

可以看到反汇编信息正常输出了。反汇编信息并不是我们后端按正常流程必须要有的一个功能，但它依然非常重要，核心的作用是辅助调试，会在如 `lldb` 和 `llvm-objdump` 这类工具中用到。

## 9.3 总结

以上就是本章的全部内容，这一章比较简单，LLVM 为我们实现了大部分的支持 ELF 文件格式输出的特性。下一章我们会支持汇编器功能。

---
{% note info %}
本文同步发布在知乎账号下：[LLVM 后端实践笔记 9：ELF 文件支持 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/395013751)
{% endnote %}