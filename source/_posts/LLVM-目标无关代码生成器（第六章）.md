---
title: LLVM 目标无关代码生成器（第六章）
abbrlink: 5cc76640
date: 2020-12-09 22:45:08
tags:
  - 编译器
  - LLVM
  - 译文
categories: 软件开发
cover: /img/20201209/index.webp
---
> 本文是一篇译文，翻译自：
> [https://llvm.org/docs/CodeGenerator.html​llvm.org/docs/CodeGenerator.html](https://llvm.org/docs/CodeGenerator.html)
> 如有问题，敬请指出。  
> 转载需注明出处，若需相关专业翻译服务，可联系我。

---

## 6 实现一个原生汇编器

### 6.1 指令解析（原文未完成）

> 原文待完成状态

### 6.2 指令别名分析

指令解析之后，会进入到 `MatchInstructionImpl` 函数。该函数实现了别名处理，之后会做真正的匹配工作。

别名分析是为了识别同样一条指令的不同文本形式，并下降到同一种指令表示。在 TableGen 中有几种不同类型的别名描述，将会在后续小节阐述，它们的顺序是从简单到复杂排好序的，一般情况下，只需要使用第一种描述方法即可，这通常是最简洁的描述方法。

### 6.2.1 助记符别名

助记符别名的描述比较简单，它是一个 TableGen 的类 `MnemonicAlias`，接受两个指令类。它将一个输入的助记符映射到一个输出的助记符。

### 6.2.2 指令别名

通常对指令别名的解析是在指令匹配过程时完成的，需要提供新的别名映射关系和特定要生成的指令。所以，一个指令别名的描述分为两部分：要匹配的指令字符串名以及要生成的指令。比如：

```
def : InstAlias<"movsx $src, $dst", (MOVSX16rr8W GR16:$dst, GR8  :$src)>;
def : InstAlias<"movsx $src, $dst", (MOVSX16rm8W GR16:$dst, i8mem:$src)>;
def : InstAlias<"movsx $src, $dst", (MOVSX32rr8  GR32:$dst, GR8  :$src)>;
def : InstAlias<"movsx $src, $dst", (MOVSX32rr16 GR32:$dst, GR16 :$src)>;
def : InstAlias<"movsx $src, $dst", (MOVSX64rr8  GR64:$dst, GR8  :$src)>;
def : InstAlias<"movsx $src, $dst", (MOVSX64rr16 GR64:$dst, GR16 :$src)>;
def : InstAlias<"movsx $src, $dst", (MOVSX64rr32 GR64:$dst, GR32 :$src)>;
```

这个例子成功的将相同的指令别名映射为不同的指令（仅依赖于操作数在汇编上的类型）。对应生成的指令可以与指令字符串名中的操作数顺序不同，也可以多次使用字符串名中的输入操作数，比如：

```
def : InstAlias<"clrb $reg", (XOR8rr  GR8 :$reg, GR8 :$reg)>;
def : InstAlias<"clrw $reg", (XOR16rr GR16:$reg, GR16:$reg)>;
def : InstAlias<"clrl $reg", (XOR32rr GR32:$reg, GR32:$reg)>;
def : InstAlias<"clrq $reg", (XOR64rr GR64:$reg, GR64:$reg)>;
```

这个例子展示了多次使用在字符串名中的同一个操作数。在 X86 后端中，`XOR8rr` 有两个输入的 GR8 寄存器和一个输出的 GR8 寄存器（其中一个输入和输出共用同一个寄存器）。`InstAlias` 的操作数是直接对应的，不需要特殊指定重复的寄存器。生成的指令还可以直接使用立即数或固定寄存器作为操作数，如：

```
// 固定的立即数操作数
def : InstAlias<"aad", (AAD8i8 10)>;

// 固定的寄存器
def : InstAlias<"fcomi", (COM_FIr ST1)>;

// 简单的别名描述
def : InstAlias<"fcomi $reg", (COM_FIr RST:$reg)>;
```

指令别名的描述可以使用 `Requires` 来约束它针对特殊 subtarget 的所属性。

如果后端支持，指令输出器可以自动的发射指令别名，而不是指令别名的映射名，这样可以让输出的汇编代码更清晰可读。如果希望这样，在 `InstAlias` 中的第三个参数传入 0。

### 6.3 指令匹配（原文未完成）
> 原文待完成状态

---

第七章是目标相关的一些实现细节。这一部分和硬件特性相关，暂时不太关心，就不翻译了。需要提示的是，这部分内容很可能不再更新，其中部分内容我发现已经与代码不符，真实情况要结合代码熟悉。

完结，撒花 🎉

---
{% note info %}
本文同步发布在知乎账号下：[LLVM 目标无关代码生成器（第六章） - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/335343311)
{% endnote %}