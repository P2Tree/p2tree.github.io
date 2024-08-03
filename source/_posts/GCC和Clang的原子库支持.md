---
title: GCC 和 Clang 的原子库支持
date: 2021-11-29 09:29:59
tags:
  - 编译器
  - CPP
categories: 软件开发
index_img: /img/20211129/index_small.png
banner_img: /img/20211129/index.png
---
> 本文首先介绍了标准库和运行时库在 GCC 和 clang 上的关系和区别。之后介绍各自编译器软件中对原子库的支持情况。 本文讨论的 GCC 的版本是 7.5.0，clang 的版本是 12.0.0。 本文提到的 GCC 和 clang 分别是对应的编译器系统，并不是 gcc/Clang 编译器前端或编译器驱动软件。

## 概念

### 标准 C 库

libc 是 Linux 下最早支持的标准 C 库。

后来逐步被 glibc 取代，glibc 是 GNU 版本的标准 C 库，是现在最流行的标准 C 库，在主流 Linux 操作系统中都是预装的。

glibc 实现了 Linux 系统中最底层的 API 库，主要是对系统调用的封装，比如 fopen。同时也提供了一些通用的数据类型和操作，如 string，malloc，signal 等。

除此之外，还有一些小众 C 库，比如用于嵌入式环境的 eglibc，还有轻量级的 glib 等。这些库在 Linux 系统中不是预装的。

### 标准 C++ 库

标准 C++ 库主要有两个，libc++ 和 libstdc++，看似名字相同，libstdc++ 是 gcc 编译器系统中的标准 C++ 库，libc++ 是 clang 编译器特别重写的标准 C++ 库，clang 重写的 libc++ 库比 libstdc++ 更充实，但两者不能兼容。

有趣的是，在大多数以 GCC 主导的操作系统中，clang 默认使用的是 gcc 的标准 C++ 库来编译程序，也就是 libstdc++，如果需要使用 libc++，要额外在编译参数中设置。这可能是处于兼容性的考虑。

libstdc++ 是和 gcc 绑定安装的，但 glibc 和 gcc 却没有绑定安装，这是因为 glibc 过于底层，在不同硬件上不能通用，所以绑定安装可能会导致危险的问题，而 libstdc++ 就显得没那么底层了。

### 运行时库

runtime 有三层意思，在不同语境下指的是不同的：

1. 指程序在运行中，即程序运行时生命周期。比如：” C++ 的运行时错误比编译时错误更隐蔽且难以 debug“；

2. 指运行时库，也就是本节提到的概念。比如：”C++ 程序的编译需要一些运行时库的支持“；

3. 指运行时系统，或运行时环境。比如：”Node.js 是 JavaScript 的一个运行时环境“；

通俗来讲，运行时库提供的函数和功能是为了满足程序运行的所有辅助功能，也就是说，用户逻辑程序代码之外的程序，都可以看作运行时库。当然，狭义的说，只有支撑软件运行的基础功能所组成的软件库，被称作运行时库。

比如，在 C 运行时库中，有负责字符串的 string 库，负责内存管理的 stdlib 库，负责输入输出的 stdio 库等。

### 运行时库和标准库的区别

运行时库包含标准库。

标准库是程序语言要求的基础功能集合，通常它是独立于不同硬件的，因为语言需要保证一定的可移植性，所以编程语言定出来的库规范，一定是能具有通用性的；但运行时库是需要保障软件在硬件上正常运行的，依据不同的硬件，运行时库的实现可能不同。运行时库对标准库做了扩展，支持软件能够在系统上正常运行。

所以，查看标准库规范应该到 C 标准委员会或 C++ 标准委员会的网站上查询，而查看运行时库，需要到对应编译器的手册或运行时库自己的手册中查询。

### GCC 和 clang 的运行时库

GCC 的运行时库是 libgcc_s，clang 的运行时库是 runtime-rt。如上一节提到的，clang 在大多数 GCC 主导的操作系统中默认使用 GCC 的标准库，同时它也默认使用 GCC 的运行时库。如果需要切换使用 clang 的标准库，那么要额外指定使用 clang 的 runtime-rt 才可以。这需要在编译时给定一些配置参数。当然，你也可以选择把两个版本的运行时库都链接到程序中，但这样通常是冗余和浪费的。

GCC 的运行时库相比 clang 的 runtime-rt，会缺少一些 LLVM 依赖的接口实现。
## 原子操作

原子操作通常都是硬件强依赖的，所以通常都需要编译器的运行时库来提供支持。

以下以 `atomic_fetch_add` 为例，其他接口可能有更多约束和设计，出于突出重点的考虑不作提及，可参考手册。

### C++ 标准（C++11）对原子操作的规定

头文件在`<atomic>`

```cpp
template<class T>
T std::atomic_fetch_add(std::atomic<T>* obj, typename std::atomic<T>::difference_type arg) noexcept;
template<class T>
T std::atomic_fetch_add(volatile std::atomic<T>* obj, typename std::atomic<T>::difference_type arg) noexcept;
template<class T>
T std::atomic_fetch_add_explicit(std::atomic<T>* obj, typename std::atomic<T>::difference_type arg, std::memory_order order) noexcept;
template<class T>
T std::atomic_fetch_add_explicit(volatile volatile std::atomic<T>* obj, typename std::atomic<T>::difference_type arg, std::memory_order order) noexcept;
```

注意，这里的标准是模板泛型实现对不同长度数据类型的支持。`atomic_fetch_add` 是 `atomic_fetch_add_explicit` 的宏替换，它会展开为 `atomic_fetch_add_explicit(obj, arg, memory_order_seq_cst)` ，这种 memory_order 是默认的常用类型。

`obj` 是指定要修改的值，`arg` 是要 add 上去的值，返回值是 add 之前 `obj` 指向的值。

### GCC 对原子操作的支持

GCC 的运行时库，libgcc_s 中，并没有提供一套原子操作的实现，它将其实现在 libstdc++ 中，即 GCC libatomic 库。当使用 libgcc_s 时，对原子操作的处理，会调用 GCC libatomic 的实现来完成。

在提标准库函数之前，先解释下 GCC 提供的 builtin 接口。

在 GCC 的原子操作的头文件 `<stdatomic.h>` 中，对 C++ 标准接口做了宏替换（注意是 GCC 的头文件，clang 有同名但内容不同的另一个头文件）：

```cpp
#define atomic_fetch_add(PTR, VAL) __atomic_fetch_add ((PTR), (VAL), __ATOMIC_SEQ_CST)
#define atomic_fetch_add_explicit(PTR, VAL, MO) __atomic_fetch_add ((PTR), (VAL), (MO))
```

这样，就可以把 C++ 标准 与 GCC 中的实现对应起来了。能看到，C++ 标准中规定的函数名称前没有两个下划线，而 GCC 中为了表示区分，会添加两个下划线（clang 中也同理，下节展示）。

GCC 中提供的 builtin 接口是：

```cpp
type __atomic_fetch_add (type *ptr, type val, int model)
```

builtin 接口是泛型的，因为编译器在编译期间能够获取变量的类型。因为是 builtin 函数，所以使用这个接口不需要依赖 GCC 的标准库或运行时库。

在 GCC 的标准库中，另外提供了一些接口函数，对于 fetch_add 是指定数据长度的接口，即：

```cpp
I1  __atomic_fetch_add_1  (I1 *mem, I1 val, int model)
I2  __atomic_fetch_add_2  (I2 *mem, I2 val, int model)
I4  __atomic_fetch_add_4  (I4 *mem, I4 val, int model)
I8  __atomic_fetch_add_8  (I8 *mem, I8 val, int model)
I16 __atomic_fetch_add_16 (I16 *mem, I16 val, int model)
```

对应对象长度的类型，在不同的硬件平台下可能有所不同，所以以符号来代替。使用这些接口时，必须给链接器指定标准库，如果出现链接错误，可以手动指定 `-latomic` 选项。

### clang 对原子操作的支持

clang 的原子操作是在运行时库 compiler-rt 中支持的。源代码位于 compiler-rt 中的 atomic.c 文件中。

在 clang 中，它首先会检查系统路径下是否已经有一套原子库的实现，如果有的话，就会使用系统的原子库实现。比如在 Linux 系统中，clang 的这种查询，可能会找到系统默认 gcc 编译器的标准库中的 atomic 实现；如果没有找到系统的 libatomic，则会生成编译器的 builtin 函数调用，即 `__c11_atomic_fetch_add` 系列函数。这在 clang 的 `<stdatomic.h>` 中能查找到细节：

```cpp
#if __STDC_HOSTED__ && __has_include_next(<stdatomic.h>)
#include_next <stdatomic.h>
#else
//...
#define atomic_fetch_add(object, operand) __c11_atomic_fetch_add(object, operand, __ATOMIC_SEQ_CST)
#define atomic_fetch_add_explicit __c11_atomic_fetch_add
//...
#endif
```


生成 builtin 函数的目的，是为了提供给编译器后端去做一些更底层的指令替换，从而提高原子操作的可靠性。

这个细节很重要，如果你的系统中有 GCC 的原子库实现，你在代码中想使用 clang 的原子库实现，就会发现应用不了。

除了上文代码提到的 `__c11_atomic_fetch_add` 函数之外，clang 还提供了其他几个版本的 builtin 函数， 文档中的说明是：

> Note that Clang additionally provides GCC-compatible __atomic_* builtins and OpenCL 2.0 __opencl_atomic_* builtins

即也提供和 GCC 兼容的 `__atomic_fetch_add` 接口和与 OpenCL 兼容的 `__opencl_atomic_fetch_add` 接口，可以在 Builtins.def 文件中查找到定义的细节，在 CGAtomic.cpp 文件中，builtin 函数被选择成 LLVM 指令 `llvm::AtomicRMWInst::Add`。

clang 提供的运行时库中对原子操作的接口与 GCC 的标准库中提供的函数基本类似。在 compiler-rt 中的 atomic.c 文件中可以查看到，clang 的运行时库对原子操作的实现是：

```cpp
#define ATOMIC_RMW(n, lockfree, type, opname, op)
  type __atomic_fetch_##opname##_##n(type *ptr, type val, int model) {
      if (lockfree(ptr))
          return __c11_atomic_fetch_##opname((_Atomic(type) *)ptr, val, model);
      Lock *l = lock_for_pointer(ptr);
      lock(l);
      type tmp = *ptr;
      *ptr = tmp op val;
      unlock(l);
      return tmp;
  }
```

显然，它提供的接口中，会判断如果 lockfree 机制没有使能的话，仍然生成 `__c11` 系列函数；否则，会使用 lock 来完成原子操作，其他非算数逻辑运算的实现更复杂一些，但原理类似。

对应支持的数据长度会依赖于硬件对原子操作的限制。这里很明显这样做的目的是为了兼容 GCC 的指定数据长度的原子操作接口。但从源文件中能看到，当你需要调用这个接口时，需要提前对其进行一次声明，避免未找到函数声明的错误。可以参考 atomic_test.c 这个测试文件了解应用细节。

值得一提的是，如果想通过 clang 来调用 libgcc_s 运行时，需要使用原子操作时，clang 并不能够自动的查找到 GCC libatomic 库，而是需要手动指定链接器参数 `-latomic` 来配置。

还有一个特别要说明的是，无论是 GCC 的原子库，还是 clang 的原子库，都必须要求所有输入输出数据的数据长度要保持一致，第一个参数是指针类型，也需要要求指针类型指向的数据类型长度保持一致，否则会出现编译错误。

### 其他说明

本文没有提到 GCC 旧版本的 `__sync__` 开头的原子操作，旧版本没有 memory model 的参数配置。clang 中对该接口也有支持。

本文没有提到如何处理原子操作的一些细节，比如 lock-free 机制和硬件原子指令，没有提到对 static 和 volatile 对象的原子操作，没有提到 atomic memory order 等参数细节。

### Reference

- [https://www.zhihu.com/question/20607178](https://www.zhihu.com/question/20607178)，有关于运行时库的文章；

- [https://www.cplusplus.com/reference/atomic/atomic_fetch_add/](https://www.cplusplus.com/reference/atomic/atomic_fetch_add/)，C++ 标准库的规定；

- [https://gcc.gnu.org/onlinedocs/gcc/_005f_005fatomic-Builtins.html](https://gcc.gnu.org/onlinedocs/gcc/_005f_005fatomic-Builtins.html)，GCC 提供的 builtin 接口；

- [https://gcc.gnu.org/wiki/Atomic/GCCMM/LIbrary](https://gcc.gnu.org/wiki/Atomic/GCCMM/LIbrary)，GCC 标准库中提供的接口；

- [https://compiler-rt.llvm.org/](https://compiler-rt.llvm.org/)，clang 运行时库 compiler-rt 的说明；

- [https://clang.llvm.org/docs/LanguageExtensions.html#c11-atomic-builtins](https://clang.llvm.org/docs/LanguageExtensions.html#c11-atomic-builtins)，提到了 clang 中支持的 builtin 接口；

- [https://releases.llvm.org/8.0.1/docs/Atomics.html#libcalls-atomic](https://releases.llvm.org/8.0.1/docs/Atomics.html#libcalls-atomic)，提到了 clang 的运行时库中提供的接口；

---
{% note info %}
本文同步发布在知乎账号下：[GCC 和 Clang 的原子库支持 (zhihu.com)](https://zhuanlan.zhihu.com/p/437343936)
{% endnote %}