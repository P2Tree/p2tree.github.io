---
title: LLVM New Pass Manager
date: 2022-12-03 17:29:47
tags:
  - LLVM
  - 编译器
index_img: /img/20221203/index.jpg
banner_img: /img/20221203/index.jpg
categories: 软件开发
---
这是一篇**译文**，主要介绍了 LLVM 中的 New Pass Manager 原文链接：

https://blog.llvm.org/posts/2021-03-26-the-new-pass-manager/

by Arthur Eubanks（Mar 26, 2021）

## Pass Manager 的介绍

Pass Manager 的主要用途是调度 Pass 在各 IR 层级按顺序运行。

Pass 分为 transformation pass 和 analyses pass，它们可以选择运行在 module、function 等各种 scope 下，甚至更加抽象地，比如 call graph 上的强连接组件（`SCC: strongly connected component`）或者 loop 上。

调度可以很简单，比如直接按顺序运行 pass list，或者按遇到的每一个 function 来调用。同时调度也可能很复杂，比如 SCC 在 call graph 中的顺序必须正确。

Pass Manager 还负责管理 analyses pass 的分析结果，比如说支配树（dominator tree）。为了更好的提高性能，分析结果可能会在 pass 之间共享，因为 pass 之间常会有依赖性，毕竟重复计算相同的结果开销太大。所以 Pass Manager 还需要缓存分析结果。当然，如果中间还经过了 transformation pass，还可能涉及到重新计算结果（之前的分析结果过期了）。

Pass Manager 支持添加一些测试 pass 来测试整个 pass list。但更简单的是使用预先构建好的 pass pipeline，比如使用 `clang -O2` 来运行 O2 优化下的所有 passes。

## New Pass Manager 的介绍

LLVM 在几年前推出了一套新的 Pass Manager，所以目前有两套不同的 Pass Manager 共存：`legacy pass manager` 和 `new pass manager`。

legacy pass manager 在结构上，会丢失一些好的优化机会，尤其是在 `inliner` 中提取分析结果。比如内联函数希望从 callee 那里拿到一些 profile 信息，特别是对于延迟内联，想要在 inliner 拿到一些 warpper function。legacy pass manager 不支持在 CGSCC pass 中提取任意函数的分析信息（CGSCC 就是 call graph strongly connected component）。pass manager 会确保我们自底向上地遍历 SCC，从而可以在从 caller 中拿到更精确地信息来让 callee 的优化更充分。 LLVM 的 inliner 是一个 CGSCC pass，因为他是一个自底向上遍历的 inliner 实现。以这个例子可以说明，legacy pass manager 在提升一些优化时的能力不足。

目前， new pass manager 还只适用于 LLVM IR 上的中端 pass pipeline。后端的 codegen pass pipeline 还依然使用 legacy pass manager，主要原因是后端 pass 是基于 MIR 的，没有很多人有精力去给后端的 MIR 框架适配 new pass manager，况且还有那么多后端需要自己适配。另外，后端 pass 中几乎没有过程间优化 pass，所以使用 new pass manager 也并不会带来什么性能提升。

## 设计

在 legacy pass manager 中，每个 pass 都会预先声明它需要保留的分析信息，如果这些分析并没有在缓存或者缓存已失效，那么 pass manager 需要将这些分析作为 pass 来提前调度。提前声明的方式会带来不必要的 boilerplate（即一些重复冗余但又不可缺少的代码——译注），并且对于一个 pass，它也并不是在任何情况下都会使用所有的分析信息。

在 new pass manager 中，使用了另一种完全不同的方法，它将分析 pass 和常规 pass 完全分离开来。其中，所有的分析 pass 都由一个独立的 analysis manager 来管理（计算运行、缓存信息、决定失效）。普通 pass 可以向 analysis manager 请求分析信息，这包括惰性计算分析。为了能向普通 pass 通知哪些分析信息是有效的，analysis manager 可以向 pass 返回它目前获知的信息。pass manager 告诉 analysis manager 来处理失效的缓存信息。这种方式可以减少 boilerplate，能更清晰的区分普通 pass 和分析 pass。

因为 legacy pass manager 将分析工作也当做 pass 来调度，所以我们无法有效的为任意函数进行分析。对于函数级别的分析 pass，它能获得的信息只能是最后一次分析 pass 运行时对当前函数的信息。我们可以为其他函数手动创建新的分析代码，但它们的分析结果不会被缓存在任何地方，从而导致很多的冗余工作和编译成本开销。由于在 new pass manager 中，分析 pass 都统一由 analysis manager 来管理，所以 analysis manager 可以负责管理任意函数的任意信息。

为了支持 CGSCC 分析，我们需要一个索引来缓存分析结果。对于像函数和循环 block 这种代码，我们有持续性的数据结构作为索引。然而，legacy 的 CGSCC pass manager 只能存储内存中当前 SCC 中的函数，不能拿到一个持续性的 call graph 数据结构作为索引来缓存分析结果。所以我们需要将整个 graph 放在内存中作为索引。另外，如果我们使用这个 graph 作为索引，这还需要能时刻确保数据是有效的（避免有 pass 改变了数据结构，但没有更新分析结果）。为了避免过多的冗余操作来重新反复的生成大量但松散的 graph，我们就需要增量更新 graph。这就是在 new pass manager 中为什么 CGSCC 设计复杂的原因。

在一个 SCC 内部，一次 transform 操作可能会破坏 call graph cycle 导致切分 SCC。legacy CGSCC 实现中的一个问题是，它简单的将一个 SCC 中所有的 functions 都存放在当前 SCC 中的一个 array 中，然后按顺序遍历所有的 functions。比如下述代码中，一个 SCC 中有 2 个 functions：

```cpp
void foo() {
  bar();
}
void bar() {
  if (false) {
    foo();
  }
}
```

我们会首先 visit foo 函数，然后 visit bar 函数，然后删除其中的 dead call。最后会 transform 成：

```cpp
void foo() {
  bar();
}
void bar() {}
```

我们现在其实希望重新访问一次 foo 函数，因为我们有了更多的信息（调整后 foo 函数成为一个独立的 SCC）。legacy pass manager 的 CGSCC 只会移动到 call graph 的下一个部分。在 new pass manager 中，设计了增量式的 call graph 更新机制，如果一个 SCC 被切分，我们会确保自底向上地重新 visit 新切分的 SCC。这种机制可能会重复的 visit function，但这也给 pass 一个机会来发现更多潜在地更详细的信息。

当在 legacy pass manager 中新增一个 pass 时，不同 pass 类型之间的嵌套是隐式的。比如，在一个 module 级别的 pass 之后增加一个 function 级别的 pass，会在连续的 function pass list 之外隐式的增加一个 function pass manager。理论上说这样没问题，虽然看起来有点困惑。 一些 pipeline 可能希望在运行一个 CGSCC pass 时能独立的运行一个 function pass，而不是嵌套在 CGSCC 的 pass manager 中。new pass manager 中，它通过限制只允许相同类型的 pass 包含在同一个 pass manager 中的方式，将这种嵌套变得更加明显。比如，想在一个 function pass 中增加一个 loop pass，这个 loop pass 必须使用 loop-to-function 的 adaptor 来包装，将其转换为一个 function pass。 new pass manager 中的嵌套顺序是：module (→ CGSCC) → function →loop， CGSCC 嵌套是可选的。增加一个 CGSCC 嵌套其实是为了简化问题，但这带来的构建 call graph 的开销和额外的支持嵌套 function pass 的代码，反而也使得它有点复杂，所以它成为一个 optional 的部分。

legacy pass manager 的实现依赖于许多的全局标记和注册函数。这是由宏生成函数和变量来初始化 pass 的。而且 legacy pass manager 的用户需要确保调用一个函数来初始化这些 pass。但我们有时希望通过一些方法让 pass manager 意识到我们有些 pass 是用于测试目的的。在 new pass manager 中，这个问题的解决方法是通过将所有 pass 的定义传递给 pass manager builder，然后内部使用一个 pass ID 和 pass 构建函数的 mapping 来依次创建 pipeline 和新增 pass，这个过程中会解析文本的描述信息作为指导。 pass manager builder 的用户可以添加注册解析回调函数的插件来控制自定义的 out-of-tree pass。虽然这会产生全局函数，但并不会带来 mutable 的全局状态，因为每个 pass manager builder 都可以解析 pass pipeline，而不需要访问全局注册函数。其他可选功能，比如调试 pass manager 的运行，也是通过这种构建函数的方式，而不是通过全局标记。

最后，对于 LLVM pass 并行运行的呼声很高。虽然 pass manager 的结果并不是这个需求的唯一阻碍，但 legacy pass manager 也确实有不少阻碍并行运行的问题需要解决。比如在 call graph 级别，只有 sibling SCC 可以并行执行。按需创建 SCC 的方式让它很难找到 sibling SCC。new pass manager 是通过计算全局 call graph 的方式来运行的，所以可以方便的找出 sibling SCC，从而可以并行化 SCC pass。一些 pass 只会使用缓存的分析信息，所以并行化可能导致非确定性的问题，因为一个 module 分析 pass 并不一定会依赖其他并行的 pipeline 的需求而存在。 new pass manager 只允许 function 级别的 pass 访问缓存的 module 分析信息，但不允许运行它们。这样做的缺点是需要保证在运行低级别 pass 之前要先运行高级别的 pass，比如需要确保 GlobalsAA pass 必须优先于一个 function pass 执行。

## 设置 new pass manager 为默认 pass manager

LLVM 的一些主要用户已经几年前就默认使用 new pass manager 了，在上游的努力开发下，目前 new pass manager 已经支持所有的用例。比如，好久前，所有的 Clang 用例就可以在 new pass manager 上运行了。然而，目前还有大量的 LLVM 的测试依然运行在 legacy pass manager 上。opt 工具，它是一个用于测试 pass 的软件，可以使用一些方法来运行 pass 到 legacy pass manager：

```bash
# run in legacy pass manager
opt -instcombine

# run in new pass manager opt -passes=instcombine  
```

因为目前还有大量的 LLVM 的测试用例仍然使用 legacy pass manager，所以直接将默认改成 new pass manager 会带来大量用例无法通过的情况（虽然手动运行已经验证大多用例可以通过）。

为了能让用例通过 new pass manager，我们可以手动运行两次，一次运行 legacy pass manager，一次运行 new pass manager，或者也可以自动将运行命令做调整（不需要手动去修改命令）：

```bash
# automatically translate legacy syntax to new syntax
opt -enable-new-pm
```

使用这个选项，我们可以探索两种 pass manager 的差异。仍然再次强调，本地打开这个功能，可能会让很多用例无法通过（因为它们还不支持 new pass manager）。目前只是将能在 new pass manager 上更有意义运行的用例做了移植，而对那些无关紧要的用例，仍然放到了 legacy pass manager 上运行。

一些使用 `-enable-new-pm` 无法覆盖的问题：
- 如果函数标记为 `optnone` 属性，这可能并不会跳过所有的可选 pass。在现有的 pass 检测框架下（即运行 pass 之前和之后会调用回调，允许跳过 pass），这种实现是最简单的。然而，一些 pass 必须要运行来保证整体的正确性，所以我们仍然根据需要保留了一些必要的 pass。
    
- Opt-bisect 在 new pass manager 中不被支持。它曾被用来分辨在 pipeline 中的哪个 pass 会导致编译错误，从而可以跳过这个 pass。在现在的 pass 检测框架下，也可以很方便的实现这个功能，所以它总被标记为必要的 pass。
    
- 大量目标相关的测试会失败。经过检查，一些期望在一些 pipeline（比如 O2）下运行的 pass 没有被运行。这是因为一些后端会向默认 pipeline 中增加一些自定义的 pass，而其中一些 pass 对于正确性是必须的，比如 lower 目标相关的 intrinsics。legacy pass manager 提供了一种方法可以向默认 pipeline 中注入 pass，即通过 `TargetMachine::adjustPassManager()` 来实现。在 new pass manager 中使用了一种等价的机制来实现将目标相关 pass 引入默认 pipeline 中。这不一定是个很麻烦的问题，因为目前 new pass manager 的主要用户是 x86 架构，而这个架构下并没有使用这个 legacy pass manager 的特性。
    
- 一些 coroutine 的用例在 CGSCC 框架上运行失败。原因是在 new pass manager CGSCC 框架下不支持将已有函数的部分提取到其他函数（又称为 outlining）。曾经有一些 hack 的处理来解决一些错误的 workaround，但却没有正确的更新 call graph，也没有处理好来自新的 outline function 的递归。最后，我们找到一种方法来适配当前的 CGSCC 框架，保持 call graph 的正确性，尽管这必须要适应特定于 coroutine 的 call graph 转换。
## 提高

出于性能考虑，很多项目和公司多年前都已经在使用 new pass manager 了。另外，Chrome 最近开始使用 PGO 和 ThinLTO 来加速 Chrome 运行，两者都带来了不错的性能改善。将 new pass manager 设置为默认打开后，Chrome 很快也进行了更新，目前可以在 Linux 和 Windows 系统上运行 Speedometer 2.0 达到 3-4% 的性能提升，减少 8-9MB 空间占用。更好的使用 profile 信息以及更好的处理大文件 ThinLTO 的 call graph 可能会带来这些改进。

然而，一些小应用并不会因为切换到 new pass manager 带来多大的益处，因为 new pass manager 带来的改进更倾向于会对大型代码仓库产生影响。

除了面向用户的提升外，通过标准化使用其中一个 pass manager 改进代码，它也能帮助 LLVM 代码更健壮。虽然我们不能立即移除 legacy pass manager，但已经不建议使用它，尤其是在优化 pipeline 中。然后将来，我们也可能会移除一些和 legacy pass manager 相关的优化 pipeline。

## 下一步计划

开始着手移除使用 legacy pass manager 的优化 pipeline，我们先要确保在 new pass manager 中都能有配套的替代。目前已知的模块：bugpoint，LLVM C API，GPU divergency analysis。

前边提到，后端 codegen pipeline 仍然工作在 legacy pass manager。虽然已经有一些后端切换到了 new pass manager，但离实用仍然有一段距离。这是改善 LLVM 代码很好的切入点，感兴趣可以与 llvm-dev 沟通。