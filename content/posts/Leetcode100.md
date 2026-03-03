---
title: "读完了Hello算法书，开始通过专题的形式刷题，100题"
date: 2026-03-03T22:43:01+08:00
draft: false
---

## 资源推荐

- **[Hello 算法](https://www.hello-algo.com/chapter_hello_algo/)** - 作为阅读参考书籍，先了解数据基础
- **[灵茶山爱府算法精讲](https://www.bilibili.com/video/BV1bP411c7oJ?spm_id_from=333.788.videopod.sections&vd_source=cb1e5a39fe2099ec877c0112445499e5)** - 作为每天刷题的参考

> 学习方法：先看视频再刷题，书籍作为基础知识进行补充，交替进行

---

## 刷题进度

![第100道题](/images/leetcode100.png)

---

## 链表专题心得

感觉最近练的太快了，开始用专题的形式刷 LeetCode。这一周虽然把基础算法搞懂了，但是我需要系统性的刷题巩固，这一周是**链表**。

链表主要就是考虑边界条件的问题，比如如何区分 `while node` 和 `while node.next`，一些基础的操作比如反转链表，什么时候使用 dummy node，还有快慢指针。

### 1. node 和 node.next 的选择

对于**增加删除节点**：因为涉及到对于下一个节点的更改，使用 `node.next` 为佳，最终指针指向最后一个节点。

对于**查找遍历**：使用 `node` 更直观简洁，最终指针指向空节点。比如快慢指针，因为快指针走两步，为防止越界，需要 `node and node.next`，起到保护作用。

### 2. 反转链表

我认为一道困难的题目需要拆解成更模块化的内容才容易做，反转链表更像是一个积木，当题目需要的时候把积木搭上去就好了，语法只要稍加理解就完全可以背下来：

```python
pre = None
cur = head
while cur:
    nxt = cur.next
    cur.next = pre
    pre = cur
    cur = nxt
```

### 3. Dummy Node 使用场景

使用的时候需要考察是否会涉及到对 head 节点的修改，如果使用了 dummy node 大部分情况下也需要使用 `while node.next`。

---

