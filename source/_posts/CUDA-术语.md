---
title: CUDA 术语
date: 2022-08-28 23:16:07
tags:
  - 并发编程
  - 体系结构
  - CUDA
index_img: /img/20220828/index_small.jpg
banner_img: /img/20220828/index.jpg
categories: 软件开发
---
学习 CUDA 最重要的首先是理解 GPU 和 CUDA 中的各种术语，在不同的平台上，相同或类似的概念却有着不同的称呼，典型的就是在 CUDA 和 OpenCL 的系统中叫法之差异，以及和通用体系结构教材中的称呼。GPU 学习曲线陡峭的一个原因就是术语使用上还未完全统一。

## 程序抽象类

|书中使用的一般性名称|非 GPU 术语|NVIDIA 和 CUDA 术语|AMD 和 OpenCL 术语|详细描述（其他术语标粗体）|
|---|---|---|---|---|
|可向量化循环|可向量化循环|网格（Grid）|索引范围（NDRange）|在 GPU 上执行的可向量化循环，由一个或多个可以并行执行的线程块（向量化循环体）组成|
|向量化循环体|（条带挖掘后的）向量化循环体|线程块（Block）|工作组（WorkGroup）|可以在多线程 SIMD 处理器上执行的向量化循环，由一个或多个 SIMD 指令线程构成，可以通过局部存储器通信|
|SIMD 车道操作序列|标量循环的一次迭代|CUDA 线程（Thread）|工作项（WorkItem）|SIMD 指令线程的垂直抽取，对应于一个 SIMD 车道所执行的一个元素。根据遮罩和预测寄存器对结果进行存储|

OpenCL 通常通过 API 函数来得到与任务维度和索引相关的值：

- get_num_groups() ：描述 WorkGroup 的数量，即 Task 的 dimension
- get_local_size() ：描述 WorkItem 的数量，即 WorkGroup 的 dimension
- get_group_id() ：描述 WorkGroup 的索引下标
- get_local_id() ：描述 WorkItem 在当前 WorkGroup 中的索引下标
- get_global_id() ：描述 WorkItem 在 Task 中的索引下标
    
CUDA 通常是提供全局的变量来指定与任务维度和索引相关的值：

- grid_dim ：同 OpenCL get_num_groups()
- block_dim ：同 OpenCL get_local_size()
- block_idx ：同 OpenCL get_group_id()
- thread_idx ：同 OpenCL get_local_id()
- CUDA 获取 CUDA 线程相对于 Task 的全局索引，需要手动计算

NVIDIA 将 CUDA 编程模型定义为 SIMT（单指令多线程），用以与 SIMD 模型做区分。SIMT 优于 SIMD 是因为 SIMT 按线程做分支和控制流的机制与 SIMD 机器不同。

## 机器对象

|书中使用的一般性名称|非 CUDA 术语（旧术语）|NVIDIA 和 CUDA 术语|AMD 和 OpenCL 术语|详细描述（其他术语标粗体）|
|---|---|---|---|---|
|SIMD 指令线程|向量指令线程|Warp|波前（wave）|一种传统线程，但它仅包含在多线程 SIMD 处理器上执行的 SIMD 指令。根据每个元素的遮罩来存储结果|
|SIMD 指令|向量指令|PTX 指令|AMDIL/FSAIL 指令|在多个 SIMD 车道上执行的单一 SIMD 指令|

注意区分 SIMD 指令线程（Warp）和 CUDA 线程。

- Warp 是硬件创建、管理、调度和执行的计算单元，它依赖硬件的并行执行单元来执行运算，也就是 CUDA 线程（车道操作序列），每个 Warp 有自己的 PC。
- CUDA 线程只是硬件实现的最小计算单元，以及会暴露给程序抽象的一个概念（用来划分最小的独立计算数据）。

之所以说是 SIMD 指令，是因为该指令会在同一个 Warp 下的多个 SIMD 车道上执行，其中每一个独立的 SIMD 车道都会处理不同的等量数据单位，满足标准 SIMD 指令的概念。同一个 Warp 下的不同 SIMD 车道一定会执行相同的 SIMD 指令。

每个 SIMD 指令线程（Warp）映射的 CUDA 线程（车道操作序列）数量依不同硬件配置而异，车道数量不一定等同于 SIMD 指令中的数据量（宽度）。比如在 Fermi 架构中，每个拥有 32 宽度的 SIMD 指令线程映射到 16 个物理 CUDA 线程，所以每个 SIMD 指令需要 2 个 cycle 才能完成计算。

## 处理硬件

|书中使用的一般性名称|非 CUDA 术语（旧术语）|NVIDIA 和 CUDA 术语|AMD 和 OpenCL 术语|详细描述（其他术语标粗体）|
|---|---|---|---|---|
|多线程 SIMD 处理器|（多线程）向量处理器|流式多处理器 Stream Multi-processor（SM）|计算单元|多线程 SIMD 处理器执行 SIMD 指令线程，与其他 SIMD 处理器无关|
|线程块调度程序|标量处理器|Giga 线程引擎|超线程分派引擎|将多个线程块（向量化循环体）指定给多线程 SIMD 处理器|
|SIMD 线程调度程序|多线程 CPU 中的线程调度器|Warp 调度程序|工作组调度程序|当 SIMD 指令线程（Warp）做好执行准备之后，用于调度和发射这些线程的硬件；包括一个计分板，用于跟踪 SIMD 线程执行|
|SIMD 车道（lane）|向量车道|线程处理器|处理元素/SIMD 车道|SIMD 车道执行一个 SIMD 指令线程中针对单个元素的操作。根据遮罩存储结果|

多线程 SIMD 处理器可以看作是完整的处理器，也可以说 GPU 是多核的多线程 SIMD 处理器。

GPU 上存在两种不同的调度：

- 线程块调度：将线程块（向量化循环体）分配给多线程 SIMD 处理器；
- SIMD 线程（Warp）调度：由它调度何时、在哪里运行 SIMD 线程；

## 存储器硬件

|书中使用的一般性名称|非 CUDA 术语（旧术语）|NVIDIA 和 CUDA 术语|AMD 和 OpenCL 术语|详细描述（其他术语标粗体）|
|---|---|---|---|---|
|GPU 存储器|主存储器|全局存储器|全局存储器|可供 GPU 中所有多线程 SIMD 处理器访问的 DRAM 存储器|
|专用存储器|栈或线程局部存储（操作系统）|局部存储器|专用存储器|每个 SIMD 车道专用的 DRAM 存储器部分|
|局部存储器/本地存储器|局部存储器|共享存储器|本地存储器/组存储器|一个多线程 SIMD 处理器的快速本地 SRAM，不可供其他 SIMD 处理器使用|
|SIMD 车道寄存器|向量车道寄存器|线程处理器寄存器|寄存器|跨越完整线程块（向量化循环体）分配的单一 SIMD 车道中的寄存器|

层次结构是 全局存储器（Global，所有 SP 可访问）> 局部共享存储器（Shared，单一 SP 内部使用）> 局部存储器（local，单一 SIMD 车道私有）。

局部存储器常用来保存单个 SIMD 车道的栈帧、溢出寄存器和不能放到寄存器中的私有变量。为了提高性能，通常 GPU 会设计缓存来辅助加速数据访问和节省能量。

局部共享存储器通常用来做单个 SIMD 处理器内不同 SIMD 线程之间的数据交互和同步。

SIMD 车道寄存器是车道内的硬件资源，所以从 SIMD 指令处理器（SP）角度看，会拥有极其大量的寄存器数量（Fermi 架构中拥有 32768 个 32 位的寄存器）。

---
{% note info %}
本文同步发布在知乎账号下：[CUDA 术语 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/558728158)
{% endnote %}