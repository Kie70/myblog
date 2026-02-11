# 博客写作与发布指南

## 博客内容存放位置

所有博客文章统一放在 **`content/posts/`** 文件夹中。在此文件夹内创建的 Markdown 文件会自动出现在博客首页和文章列表中。

## 新建博客的步骤

### 1. 在 `content/posts/` 下创建 `.md` 文件

**重要：文件扩展名必须是 `.md` 或 `.markdown`**，否则 Hugo 无法识别为博客文章。

推荐命名方式：`文章标题-slug.md`（例如：`XJTLU-quiz-reminder.md`）

### 2. 文件必须包含 front matter（前置元数据）

每篇博客开头需要 YAML 格式的元数据，格式如下：

```yaml
---
title: "你的文章标题"
date: 2026-02-12T01:00:00+08:00
draft: false
---

（下面是正文内容，使用 Markdown 语法）
```

- **title**：显示在列表和文章页的标题
- **date**：发布日期，格式为 `YYYY-MM-DDTHH:mm:ss+08:00`
- **draft**：设为 `false` 才会在首页显示；设为 `true` 时仅本地预览可见，不会发布

### 3. 使用 Hugo 快捷命令创建新文章（可选）

```bash
hugo new posts/你的文章标题.md
```

会自动生成带正确 front matter 的模板，但 `draft` 默认为 `true`，发布前需改为 `false`。

## 本地预览

```bash
hugo server -D
```

访问 http://localhost:1313 预览，`-D` 会包含 draft 文章。

## 推送到 GitHub 发布

1. 将新文章保存到 `content/posts/` 并以 `.md` 结尾
2. 确认 front matter 中 `draft: false`
3. 执行 Git 提交与推送：

```bash
git add content/posts/你的文章.md
git commit -m "新增博客：你的文章标题"
git push origin main
```

推送到 GitHub 后，Vercel/Cloudflare Pages 会自动构建并部署，新文章会出现在线上博客中。

## 常见问题

### 文章在首页不显示？

- 检查文件扩展名是否为 `.md` 或 `.markdown`
- 检查 front matter 中 `draft` 是否为 `false`
- 检查 `date` 格式是否正确
