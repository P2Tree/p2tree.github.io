---
title: LLVM风格的RTTI
date: 2023-08-14 14:47:40
tags:
  - CPP
  - LLVM
index_img: /img/20230814/index.jpg
banner_img: /img/20230814/index.jpg
categories: 软件开发
---
## 开头叨叨

众所周知，LLVM project 没有开启 C++ 的 RTTI 特性。一个主要的原因是 LLVM project 认为 C++ RTTI 特性的实现需要使用到虚函数表，对性能并不友好。LLVM 自己实现了一种类似 RTTI 的行为。我们在开发 LLVM 代码时，尤其是需要自己搭建自定义的数据结构时，可能会想用到 RTTI，此时，学习在 LLVM 风格下如何创建类似的 API，就显得尤为重要。

## 什么是 RTTI

难度：⭐

RTTI 是运行时类型识别，全称 Runtime Type Identification，网上有很多介绍这个的资料，属于 C++ 程序员必须要熟悉的内容。

它的主要目的是为程序运行时提供一种对对象类型的获取、操作的方式。

对应到 C++ API 上，有三个 API 会用到 RTTI：

- dynamic_cast，用来将一个指向基类的指针转换为一个指向派生类的指针，如果转换失败，会返回 nullptr
- typeid，用来返回对象类型的值
- type_info，也就是 typeid 的返回类型，用来存储描述类型的信息

如果不使用这三个 API，关闭 RTTI 不会影响代码行为。

需要注意的是，RTTI 只能用于包含了虚函数的类，也就是需要虚函数表来提供负责转换类型和提取真实类型的信息。

## LLVM 的 RTTI 替代方案

> 参考自：[LLVM Programmer’s Manual — LLVM 18.0.0git documentation](https://www.llvm.org/docs/ProgrammersManual.html#important-and-useful-llvm-apis)

难度：⭐

回到主题，LLVM project 构建中，默认把 RTTI 关闭了，也就是使能了 `-fno-rtti` 编译选项。

LLVM 设计了另外一种方式来实现 RTTI，这种做法可以更高效且灵活的完成如继承结构向下类型转换和获取类型并判定的功能。

LLVM 提供了以下 API：

- `dyn_cast`，作为 dynamic_cast 的替代，用来检查一个特定类型的对象，并将其转换为指定的派生类型。如果转换是非法的，会返回 nullptr。这个 API 不能用于引用（dynamic_cast 可以用于引用，非法转换会返回 bad_cast 异常）
- `isa`，类似于 java 的 instanceof，用来判定一个对象是否是某个类型。返回 bool 类型，可以判断指针或引用类型
- `cast`，和 dyn_cast 类型一样，但可以既接受指针又接受引用类型，之所以能接受引用类型，是由于它在非法转换时，会发生 assertion 失败。所以，这需要在使用前预先确认 cast 不会失败才行，也就是通常要和 isa 配合使用。

另外，还有 `dyn_cast_or_null`，`isa_and_nonnull` 和 `cast_or_null` 等扩展接口，它们是对应的能接受 nullptr 作为参数的 API。需要注意，dyn_cast_or_null 和 cast_or_null 接口已经在新版 LLVM 中被标记为 deprecated，用来替代它们的 API 是 cast_if_present，有关于这些接口的使用和实现，可以参考 `include/llvm/Support/Casting.h` 文件。

我们在平时编码时，很容易遇到这些应用场景，比如当拿到一个 MI 指令时，需要通过判断这个指令是哪种类型，来决定要采取哪种操作，如：

```cpp
// 获取特定类型指令的 operand type
if (auto *Ld = dyn_cast<LoadInst>(V))
  Ty = cast<PointerType>(Ld->getPointerOperandType())->getElementType();

// 判断一个 operand 是否是 Integer type
if (isa<IntegerType>(V->getType()))
  return true;
```

要尽可能使用这种风格的代码实现，而不是使用 if-else 风格 get 具体 enum kind 的形式。

## 设计自定义类继承结构的 RTTI API

> 参考自：[How to set up LLVM-style RTTI for your class hierarchy — LLVM 18.0.0git documentation](https://llvm.org/docs/HowToSetUpLLVMStyleRTTI.html#how-to-set-up-llvm-style-rtti-for-your-class-hierarchy)

难度：⭐⭐

如果只是使用 API，前边章节的内容已经足够了，但如果是需要设计自己的类型，那么学习 LLVM 如何做到这些，也是很有意义的。由于 LLVM 关闭了 RTTI，所以我们需要手动维护一套类型机制来标记类型信息，即我们不需要依赖虚函数表来实现 RTTI。

假设我们有这样一个类结构：

```cpp
class CustomMCInst {
public:
  CustomMCInst() {}
  virtual MCOperand getDstOperand() = 0;
};
class ALUMCInst : public CustomMCInst {
public:
  MCOperand getDstOperand() override;
};
class LSAMCInst : public CustomMCInst {
public:
  MCOperand getDstOperand() override;
};
```

首先，我们需要 include 头文件：`#include “llvm/Support/Casting.h”`，这个头文件中描述了上述的 API 声明及实现。

然后，在 CustomMCInst 中，需要增加一个用来描述各种 Kind 的 enum，这些 Kind 将用来描述各个派生类的类型（加粗部分为新增代码）：

```cpp
class CustomMCInst {
public:
  CustomMCInst() {}
  **CustomMCInst(InstKind K) : Kind(K) {}**
  virtual MCOperand getDstOperand() = 0;

  **enum InstKind {
    IK_ALU,
    IK_LSA
  };
  InstKind getKind() const { return Kind; }
private:
  const InstKind Kind;**
};
class ALUMCInst : public CustomMCInst {
public:
  MCOperand getDstOperand() override;
};
class LSAMCInst : public CustomMCInst {
public:
  MCOperand getOperand() override;
};
```

这里使用 Kind，而不是 type 或 classes 等名词，是为了和 LLVM 中其他常见的关键词做区分。最好将 Kind 和 getKind() 都保持使用相同的名称。

之后，需要将所有派生自基类的子类型，都设置为对应的 Kind。

```cpp
// ... 省略基类代码

class ALUMCInst : public CustomMCInst {
public:
  **ALUMCInst() : CustomMCInst(IK_ALU) {}**
  MCOperand getDstOperand() override;
};
class LSAMCInst : public CustomMCInst {
public:
  **LSAMCInst() : CustomMCInst(IK_LSA) {}**
  MCOperand getOperand() override;
};
```

最后，还需要实现 LLVM RTTI 的模版接口，用来能够提供给如 dyn_cast 和 isa 来决定类型的调用。实现方式是通过一个静态的成员函数 classof 来作为 dyn_cast 和 isa 的调用接口。

```cpp
// ... 省略基类代码

class ALUMCInst : public CustomMCInst {
public:
  ALUMCInst() : CustomMCInst(IK_ALU) {}
  MCOperand getDstOperand() override;

  **static bool classof(const CustomMCInst *I) {
    return I->getKind() == IK_ALU;
  }**
};
class LSAMCInst : public CustomMCInst {
public:
  LSAMCInst() : CustomMCInst(IK_LSA) {}
  MCOperand getOperand() override;
  
  **static bool classof(const CustomMCInst *I) {
    return I->getKind() == IK_LSA;
  }**
};
```

这里 classof 这个接口，是必须要叫这个名字的，因为在 dyn_cast 和 isa 的实现中，最终是调用了一个类型的 `::classof` 接口。留意到，我们的抽象基类并没有提供 classof 接口，因为这是没有必要的，不必要给不能实现对象的类提供类型。

以上就是完整的实现步骤。当我们具体使用时（调用方），可以：

```cpp
MCOperand getDstOp(CustomMCInst *I) {
  if (auto * IALU = dyn_cast<ALUMCInst>(I)) {
    return IALU->getDstOpernad();
  else if (auto * ILSA = dyn_cast<LSAMCInst>(I)) {
    return ILSA->getOperand();
  else 
    return MCOperand()
}
```

需要注意，所有非抽象类，都应该实现 classof 接口，即使它不是叶子类型。另外，classof 的参数将始终应该是抽象类类型。

进一步扩展一下，我们的 classof 函数实现，并不一定要求一定是 `return i→getKind() == IK_A_KIND`，事实上，任何能够决定类型，且返回 bool 状态的内部实现，都可以用来实现 classof。这些在我们实现更复杂的类继承结构中会考虑用到。

## 深层次继承结构

难度：⭐⭐

上边提到，当一个非抽象类型，并不是叶子类型（也就是它自身还有子类派生），我们也应该提供 classof 接口。这是因为任何非抽象类型都可以成为在运行时需要动态识别和转换类型的入参。

对于这种多层的继承结构，有一些额外的规则：

- 非抽象类型都要提供 classof 接口
- 非叶子类型的 classof 实现，需要将其子类型包含在其中

举例来说，我们对上边的代码做扩展，将 ALU 指令分为 ARITH 指令和 LOGIC 指令：

```cpp
class CustomMCInst {
public:
  CustomMCInst() {}
  CustomMCInst(InstKind K) : Kind(K) {}
  virtual MCOperand getDstOperand() = 0;

  enum InstKind {
    IK_ALU,
    **IK_ARITH,
    IK_LOGIC,**
    IK_LSA
  };
  InstKind getKind() const { return Kind; }
private:
  const InstKind Kind;
};

class ALUMCInst : public CustomMCInst {
public:
  ALUMCInst() : CustomMCInst(IK_ALU) {}
  MCOperand getDstOperand() override;

  static bool classof(const CustomMCInst *I) {
    **return I->getKind() >= IK_ALU && I->getKind() <= IK_LOGIC;**
  }
};
**class ALUArithMCInst : public ALUMCInst {
public:
  ALUArithMCInst() : ALUMCInst(IK_ARITH) {}
  MCOperand getDstOperand() override;

  static bool classof(const CustomMCInst *I) {
    return I->getKind() == IK_ARITH;
  }
};
class ALULogicMCInst : public ALUMCInst {
public:
  ALULogicMCInst() : ALUMCInst(IK_LOGIC) {}
  MCOperand getDstOperand() override;

  static bool classof(const CustomMCInst *I) {
    return I->getKind() == IK_LOGIC;
  }
};**

// ... 省略 LSAMCInst 代码
```

我们扩展了 `ALUMCInst::classof`中的实现，使用范围 enum 来将所有是 ALU 类型及其子类型的 InstKind 都考虑进来。然后，我们实现子类型 ALUArithMCInst 和 ALULogicMCInst 如之前。

这种实现需要留意避免调整 enum 顺序时造成 bug，更常见的做法可能是：

```cpp
static bool ALUMCInst::classof(const CustomMCInst *I) {
  return I->getKind() == IK_ALU || I->getKind() == IK_ARITH || I->getKind() == IK_LOGIC;
}
```

## 潜在的 Bug

难度：⭐⭐

应当仔细做到在这些非叶子类型非抽象类中，classof 总是能囊括所有的子类类型，在整个类继承结构完成之后，应该再次检查 classof 的正确性，以避免潜在 Bug。

LLVM 文档中提到可以借用假的 enum flag 来标记一类 Kind 的结束为止，从而让 classof 的维护没那么容易引入问题。

```cpp
enum CustomMCInst::InstKind {
  IK_ALU,
  IK_ARITH,
  IK_LOGIC,
  **IK_ALU_END,**
  IK_LSA
};

static bool ALUMCInst::classof(const CustomMCInst *I) {
  **return I->getKind() >= IK_ALU && I->getKind() <= IK_ALU_END**; 
}
```

尾区间选择开区间还是闭区间并不重要，毕竟不会有一个类型是假的 IK_ALU_END，当然为了避免意外使用，选择闭区间的出错概率可能低一些。

之后，我们如果想继续扩展 ALU 类指令，就只需要在 `CustomMCInst::InstKind` 中的 IK_ALU 和 IK_ALU_END 之间加入新类型即可，而不需要再次调整 `ALUMCInst::classof` 的实现。

## 开放的类继承结构

难度：⭐⭐⭐

前边描述实现 LLVM RTTI 的这套方法，依赖一个大前提，即我们需要在实现整个代码前，已经设计好了完整的类结构。

但如果因为业务需要，我们无法在设计完成时确定类继承结构，即我们的类结构是开放形式时，应该怎么实现 LLVM RTTI 呢，LLVM 文档中为我们简单介绍了一下它提供的一种新的机制：ExtensibleRTTI。

开放的继承结构，以本文例子来说，就是我们设计了整套 CustomMCInst 的类结构，但依然需要在将来由其他用户对这个类结构做扩展，而其他用户无法帮我们继续维护之前的 InstKind 和 classof 实现。

这种新机制和前文的方案完全无关，可以在需要时再进一步了解。

LLVM 提供了两个类：`RTTIRoot` 和 `RTTIExtends`，前者用来实现 RTTI 检查，后者提供了一种机制，使当前类型能够继承自 RTTIRoot，它接受两个模版参数，分别是当前类型和 RTTIRoot。

所有自定义类型（抽象类和派生类）都需要继承自 RTTIExtends，真正的继承关系由 RTTIExtends 负责建立。并且，所有自定义类型，都需要提供一个名为 `ID` 的 static char 成员，用来让 RTTIExtends 管理特定类型。

```cpp
class CustomMCInst : **public RTTIExtends<CustomMCInst, RTTIRoot>** {
public:
  CustomMCInst() {}
  virtual MCOperand getDstOperand() = 0;

  **static char ID;**
};

class ALUMCInst : **public RTTIExtends<ALUMCInst, CustomMCInst>** {
public:
  MCOperand getDstOperand() override;

  **static char ID;**
};

char CustomMCInst::ID = 0;
char ALUMCInst::ID = 0;
```

这种实现方案，不再需要手动管理各种 Kind 和 classof，唯一需要的就是将所有类型都设计在 RTTIExtends 之下。

LLVM 文档提到，这种方案只有在开放结构中用，在其他场景下，还是应该使用之前介绍的标准 LLVM RTTI 方式。

## 进阶用法

难度：⭐⭐⭐

`isa/cast/dyn_cast` 这些接口的底层实现是 `CastInfo`，CastInfo 提供了 4 个方法，`isPossible`，`doCast`，`castFailed`，`doCastIfPossible`。这些方法用来对应实现 isa，cast，dyn_cast。

我们可以通过自定义 CastInfo 类型，来对这些 RTTI API 做更细致更灵活的定制。CastInfo 继承自 `CastIsPossible`，后者内部的实现就是我们前边介绍的，利用 classof 来决定类型判断和转换行为。

早前的实现中没有 CastInfo 这一层，这次写文时才看到 LLVM 更新了文档，介绍了这部分内容，简单看了下实现，但目前还没有用到过，感兴趣小伙伴可以到 [How to set up LLVM-style RTTI for your class hierarchy — LLVM 18.0.0git documentation](https://llvm.org/docs/HowToSetUpLLVMStyleRTTI.html#advanced-use-cases) 了解或者看源码 `include/llvm/Support/Casting.h` 学习，其中写了很多注释帮助理解。