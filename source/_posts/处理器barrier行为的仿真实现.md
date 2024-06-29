---
title: 处理器 barrier 行为的仿真实现
tags:
  - 体系结构
  - 并发编程
  - 仿真
  - CPP
index_img: /img/20240616/index.jpg
banner_img: /img/20240616/index.jpg
date: 2024-06-16 10:00:00
categories: 软件开发
---

## 开头叨叨

由于编译器指令重排以及 CPU 乱序执行的问题，处理器指令有可能在多线程执行时遇到一些问题，比如数据竞争，死锁，非预期的计算结果等。为了避免这类潜在的问题，引入了 barrier 的概念。编译器会主动插入 barrier 指令来降低直接调整指令调度环节的复杂性，而硬件的非预期行为也只能通过软件强行做同步来避免。

在处理器架构领域，barrier 是一种同步行为，它通常是指令或者指令 modifier，用来对程序流进行同步控制。在多处理器或多线程处理器中，当不同的程序流遇到 barrier 时，会等待其他程序流同时到达这个同步点，然后再执行后边的程序。

这种方式确保了所有的线程或处理器能够在程序的同一个位置重新对齐。

在一些硬件上，这种行为通过指令实现，比如 intel 的 FENCE 指令，ARM 的 DMB/DSB 指令。大多数 barrier 指令都带有对内存操作的同步，也就是在 barrier 之前的读写内存操作必须在 barrier 点完成，以达到内存访存有序的目的，这通常也被称为 memory fence。概念上讲，fence 是 barrier 的一个特例，也就是说 barrier 并不会要求必须实现 fence 的功能，当然这取决于具体硬件。

本文中，我将会介绍一种对 barrier 指令行为的软件仿真实现。出于简化实现的目的，程序中不会实现 memory fence，只会对程序指令流的同步行为做仿真，也就是 instruction barrier。

我也会对应用场景做简化，多线程程序和多处理器程序的 barrier 在程序表现上是一致的，不一致的是 barrier 的指令实现，文章和代码介绍多线程程序下的 barrier 仿真，两者之间很容易互通。

适合看这篇文章的人可能并不多，如果你想进一步了解 barrier 的概念，可以查找其他文章。阅读本文和 demo 程序需要对 C++ 多线程编程有足够的知识，且对汇编程序设计和并行处理器有一些了解。

我在网络上并没有找到介绍 barrier 仿真的中文资料，所以希望写此文和提供可参考的 demo 程序，帮助有需要的朋友。

Demo 程序放在：[P2Tree/barrier: A simulate demo for barrier behaviour in compute architecture (github.com)](https://github.com/P2Tree/barrier/tree/master)，可以直接取用，有问题请反馈我处理。

## 设计用例场景

一个良好的软件工程实践是先梳理需求和应用场景，并编写一些测试用例。我梳理了几种常见的 instruction barrier 的应用场景（以下用汇编伪码介绍），这些场景会作为 UT 出现在代码中：

1. 最普通的模式：

   ```asm
   some_insts
   barrier_sync_all_threads
   some_insts
   ```

   多线程程序多以这种 sync 所有线程的方式调用 barrier，线程程序中没有分支和跳转指令，所以每个线程都会执行到相同的代码。但由于线程调度和指令 latency，barrier 前后的时间会不同。

2. 程序中存在多个 barrier：

   ```asm
   some_insts
   barrier_sync_all_threads_with_ID_0
   some_insts
   barrier_sync_all_threads_with_ID_1
   some_insts
   ```

   硬件并不会只提供一个 barrier，程序的复杂性会要求同时使用多个不同的 barrier。不同的 barrier 的仿真实现可能带来复杂的同步问题。这里额外说一句，barrier 是一种硬件资源，线程程序需要考虑到不要超出资源限制。同一个 barrier 可以在程序的多个指令中被访问，但需要满足适当的用法，否则会出现程序异常、hangup 等问题。

3. 只 wait 部分线程的 barrier：

   ```asm6502
   some_insts
   barrier_sync_partof_threads(count)
   some_insts
   barrier_sync_all_threads
   some_insts
   ```

   除了提供对所有线程做同步的 barrier 外，也可能存在对部分线程做同步的 barrier。可能会有两种形式，第一种形式并不关心要同步哪些线程，只关心同步了多少数量的线程；第二种形式关心同步指定线程 ID 的线程。两种形式看似不同，但在仿真实现上基本类似。Demo 中以第一种形式来实现。同步部分线程指令需要带有额外的操作数来指定同步多少线程（或同步哪些线程），超出同步数量的线程（或没有在指定范围内的线程）会直接忽略这个 barrier。

   在做这个测试时，我们适当增加一下线程程序的复杂性，让 barrier_sync_all 和 barrier_sync_partof 同时出现。

4. 多个部分线程 barrier：

   ```asm6502
   some_insts
   barrier_sync_partof_threads(count)
   some_insts
   barrier_sync_partof_threads(count)
   some_insts
   ```

   这个用例看似和上边类似，但实则不同，实际实现时更复杂。比如两个 barrier 各自都等待 4 个线程，线程 0,1,2,3 在第一个 barrier 暂停，线程 4,5,6,7 会忽略第一个 barrier，而在第二个 barrier 等待。注意到，两个 barrier 指令实际使用了同一个 barrier ID，也就是同一个 barrier 资源。

5. 生产者-消费者模型：

   ```asm6502
   thread_produce:
   barrier_with_produce

   thread_consume:
   barrier_with_consume
   ```

   生产者-消费者模型是一种常见的数据同步设计。一部分线程生产数据，并由另一部分线程消费数据。生产者线程在数据队列满的情况下会暂停生产，消费者线程在数据队列空的情况下会暂停消费，两者通过 barrier 的一种特殊设计来实现同步。

   为了简化硬件细节，我们采用在 barrier 中增加一个计数器来近似硬件表现出的行为（实际硬件的实现可能大相径庭），生产者对计数器累加，而消费者对计数器累减。

   插句题外话，硬件对这种设计的一个常见的应用场景是，硬件有时会让一个线程发射计算指令，但计算结果会交给所有线程去做后处理。

6. 复杂的生产者-消费者模型：

   ```asm
   thread_produce:
   barrier_sync_partof_threads(count)
   some_insts
   barrier_with_produce

   thread_consume:
   barrier_sync_partof_threads(count)
   some_insts
   barrier_with_consume
   ```

   如果之前的 barrier 实现合理，这个混合了普通 barrier 和生产者-消费者 barrier 的程序流应该能够正常工作。而且我这里还需要做个假设，同一个 barrier ID 资源不能同时作为普通 barrier 和生产者-消费者 barrier，否则设计会复杂太多。

以上这些应用场景在我提供的 demo 程序中都能够找到，我没有提供更复杂的测试用例，感觉应该都覆盖到了。

连续多次 barrier 指令的程序流，看似和一次 barrier 指令没区别，只是重复调用仿真指令就可以。但实际并非如此，两次甚至多次 barrier 之间的 barrier 状态有一些细节要处理，多次 barrier 如果使用相同的 barrier ID（同一个资源），需要考虑 barrier 之间的状态更新和重新初始化。另外，C++ 并发编程中，还需要严格留意临界区的处理，即使你能快速实现第一个 case 的仿真，但后边的 case 依然会引入很多复杂的设计。

如果你有时间，可以自己拿去玩一下，只留下 test.cpp，设计一个 Barrier 类，看看如何让这些用例都通过。

## 程序设计介绍

我编写了一个 Barrier 类来实现 barrier 指令的所有细节，通过 barrier.h 来了解类结构。我这里对类中的数据成员做介绍：

- MutexLock 和 Cond，锁和条件变量，不展开，默认读者需要对它们的使用有充分的了解。

- Expect，用来记录要同步的线程数量，对于 barrier_sync_all_threads 来说，就是所有线程，否则就是程序在指令中指定的线程数量。

- Count，一个计数器，参与每一次 barrier 操作。不同线程的相同 PC 下的 barrier 被视为 “同一次” barrier 操作。彻底离开一次 barrier 操作后，这个计数器应该被清零。

- Release，这个参数最初是没有的，而是为了解决复杂用例下的同步问题而引入，它在不同次 barrier 操作中都会累加，并且不会被清零，它用来弥补 Count 被清零时到下一次 barrier 操作之间的临界区。当然这样会带来累加溢出的问题，我们暂时先不考虑。

- Actives 数组，用来支持 barrier_sync_partof_threads 的行为，当一次 barrier 操作已经满足全部线程后，其他延迟抵达的线程将会被忽略。为什么不使用 bool 来标记而是使用了 unsigned，感兴趣可以试一下，线程在连续多次 barrier 操作时，是没法处理一个二元状态的，比如第一次遇到 barrier 操作时将 false 改为 true，紧接着第二次遇到 barrier，true 的状态会让他继续 ignore barrier，这是我们不想看到的行为。

#### constructor

完成对总线程数（Expect）和其他一些辅助成员的初始化。

#### public function

handleBarSync 用来执行一条普通 barrier，通过重载来区分 barrier_sync_all_threads 和 barrier_sync_partof_threads。前者通过 Barrier 对象来获取总线程数，后者会传入额外一个参数指定要 sync 的线程数量。

普通 barrier 指令的行为也就是 wait 行为，内部通过同步变量来实现 wait 和 awake。参数 PC 指出 barrier 指令在指令流中的位置；参数 TID 用来指定线程 ID，硬件指令中不需要作为操作数，但仿真时是必需的；参数 Expect 用于在实现 barrier_sync_partof_threads 时指定要 sync 的线程数量。

```c
void Barrier::handleBarSync(unsigned PC, unsigned TID) {
    wait(this->Expect, PC, TID);
}
void Barrier::handleBarSync(unsigned Expect, unsigned PC, unsigned TID) {
    wait(Expect, PC, TID);
}
```

handleBarProduce 和 handleBarConsume 用来执行一条生产者或消费者 barrier，内部调用了对应的私有函数。

生产者 barrier 的指令只需要指定 Expect 和 PC，原因是我的模型中假设了只有一个线程作为生产者，如果你的场景中需要多个生产者，我想这个 Demo 还需要调整。

```cpp
void Barrier::handleBarProduce(unsigned Expect, unsigned PC) {
    produce(Expect, PC);
}
```

消费者 barrier 的指令不需要 Expect，是因为我的模型中假设所有线程（除了生产者线程）都将作为消费者。

```cpp
void Barrier::handleBarConsume(unsigned PC, unsigned TID) {
    consume(PC, TID);
}
```

#### private function

私有函数 wait、produce 和 consume 是关键代码。

wait 函数用来实现普通的 barrier 行为，一个不考虑各种复杂场景下的最简单实现是：

```cpp
void Barrier::wait(unsigned Expect, unsigned PC, unsigned TID) {
    unique_lock<mutex> Lock(MutexLock);
    Count++;
    if (Count == Expect) {
        Count = 0;
        Cond.notify_all();
    } else {
        Cond.wait(Lock);
    }
}
```

可以停下来想想这样的设计会带来什么问题？

它能实现带有 barrier_sync_all_threads 指令的指令流。但不能实现带有 barrier_sync_partof_threads 的指令流。我可以举个例子来说明，假设共 8 个线程：

```asm6502
some_insts
barrier_sync_partof_threads(4)   # wait 4 threads
```

当其中第 4 个线程的 barrier wait 进入 if 分支后，前 3 个线程在 else 分支中做 Cond.wait，第 4 个线程清零 Count 并会 awake 前 3 个线程。后边 4 个线程会再次进入 Count++ 行为。

直觉性的，我们需要在前边加个判断，判断当前这一次 barrier 操作已结束（后边的线程不要再处理）。如果复用 Count 来做判断，很容易就会发现，代码难以设计，Count 既需要清 0，又需要作为判断后续线程状态的值而不能及时清 0。

如果在最后一个线程再清 0 也不可行，原因是在程序流中存在多条 barrier_sync_partof_threads 时（如用例 4），先前释放的线程（前 4 个线程）进入了第二个（相同 barrier 资源）的 barrier handle，它们也需要操作 Counter，与第一个 barrier 还没跑完的线程（后 4 个线程）争夺 Counter 的访问权。

我们需要一个额外的状态位，这个状态位不能在两次 barrier 操作之间清零（否则就和 Counter 遇到一样的问题），所以我加入了 Release。我们也不能交替使用两个状态（Counter 和 Release），因为我们无法预测指令流中不同的线程会同时执行到几个 barrier 指令（现在例子中是 2 个，但完全可以更多）。

我们还需要一个标记某个线程是否已经到达一次 barrier 操作，使用 “线程没有达到 barrier 操作” 并且 ”barrier 操作已完成“ 的条件来决定哪些线程需要跳过 barrier 操作。前边已经解释了为什么这个标记（Actives）需要是和 Release 一样的 unsigned 类型，而不是 bool，这里不再重复。

Release 变量会在每次 barrier 操作完成时累加一次；Actives 中对应线程的位置会在每次 barrier 操作时累加一次，所以两者是同步的。barrier 操作没完成时，Release 和未执行的线程 Actives 是相同的，barrier 操作完成后，Release 累加一次，已执行的线程 Actives 累加一次，未执行的线程 Actives 和 Release 进行比较，就可以判断当前线程是否要 ignore barrier。

修改后的代码为：

```cpp
void Barrier::wait(unsigned Expect, unsigned PC, unsigned TID) {
    unique_lock<mutex> Lock(MutexLock);
    if (Actives[TID] != Release) {
        Actives[TID]++;
        return;    # ignore barrier
    }
    Count++;
    Actives[TID]++;
    if (Count == Expect) {
        Count = 0;
        Release++;
        Cond.notify_all();  # threads all arrived
    } else {
        Cond.wait(Lock);  # part of threads arrive
    }
}
```

我们再来看看另外两个函数，produce 和 consume。相比于 wait，这两个函数的实现却显得简单多了。作为 produce 的 barrier，并不会有额外行为，它唯一做的事情就是通知 consume barrier 可以 continue 了，而 consume barrier，只需要 wait 等待 produce 通知即可，这与 C++ 的条件变量的等待-唤醒模型基本吻合。

produce 的实现可以直接写出来：

```cpp
void Barrier::produce(unsigned Expect, unsigned PC) {
    unique_lock<mutex> Lock(MutexLock);
    Count = Expect;
    Cond.notify_all();
}
```

produce 需要明确有几个 consumer 来处理数据，所以这里需要每次都设定 Counter。

consume 的实现为：

```cpp
void Barrier::consume(unsigned PC, unsigned TID) {
    unique_lock<mutex> Lock(MutexLock);
    if (Count != 0) {
        Count--;
    } else {
        Cond.wait(Lock);
    }
}
```

不同于 wait 函数，consume 需要对 Counter 做递减，因为 produce 时给它设置了正数的非零值，每个 consume 需要减掉属于自己的那一位。

## 总结

更多的代码细节可以参考我提交的 demo，我要阐述的细节已经完毕。

这个话题来源于我工作中的一部分，我已经剔除了和业务相关的部分，由于要贴近工作需要，所以一些场景设计可能并没有考虑到，从而目前的设计也可能没有很好的普适性。保存这块代码的一个目的，也是在将来能够有需要时，继续完善它。

在设计整个 demo 中，自己遇到了一些问题，也进一步夯实了有关 C++ 并发编程的知识。如果你熟悉 C++20，那么会很快发现这很类似 C++20 里边的 std::barrier 和 std::latch。事实上我在实现这套逻辑的过程中发现了，但由于我的项目没有依赖 C++20 开发，所以没办法直接使用现成的模型。另外，我也没有尝试去使用 boost::barrier，因为它的实现比较单一，而我实际业务场景中有很多需要定制的地方，索性自己实现一套。

如果你愿意参考一下标准实现，我认为是极好的，我 demo 中的 count 对应 boost 库实现中的 m_count，release 对应 m_generation。我也认为其中有很多值得优化的地方，欢迎交流，有空的时候，我会再看看 std::barrier 的实现。

另一方面，并发编程需要处理很多细节，一些极端的异常需要在非常苛刻的环境下才能复现，而且调试也非常困难，本文中列举的示例场景依然只是其中一部分。Demo 中的代码实现比文章中的要复杂一些，因为其中处理了一些并发的小问题，比如应对 wait 的虚假唤醒，感兴趣的朋友可以找网上其他资料了解，有很多文章介绍。

## 外链

本文同步发布在知乎账号下 [https://zhuanlan.zhihu.com/p/703597874](https://zhuanlan.zhihu.com/p/703597874)

