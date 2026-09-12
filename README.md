# 知乎助手

基于 Electron + TypeScript + React 构建的知乎内容下载工具，支持将知乎回答、文章、想法等导出为 EPUB、HTML、Markdown 和 PDF 格式。

[![GitHub stars](https://img.shields.io/github/stars/SiwuXue/zhihuhelp)](https://github.com/SiwuXue/zhihuhelp)
[![License](https://img.shields.io/github/license/SiwuXue/zhihuhelp)](https://github.com/SiwuXue/zhihuhelp)

## 功能特点

- 支持多种知乎内容下载：回答、文章、想法、专栏、收藏夹、话题精华等
- 多种导出格式：EPUB、HTML、Markdown、PDF
- Markdown 支持 LaTeX 数学公式渲染
- 图片质量可选：高清、原图、无图
- 自动分卷：每 200 条内容自动分卷

## 支持的导出格式

| 格式 | 说明 |
|------|------|
| EPUB | 电子书格式，可用多看阅读或 Edge 浏览器打开 |
| HTML | 网页版答案列表，支持单页和多页模式 |
| Markdown | 支持 LaTeX 数学公式渲染 |
| PDF | A4 格式 PDF 文档 |

## 输出目录

```
知乎助手输出的电子书/
├── epub/    # EPUB 电子书
├── html/    # 网页版内容
├── pdf/     # PDF 文档
└── markdown/ # Markdown 文件
```

## 支持的任务类型

| 网址类型 | 说明 | 示例 |
|----------|------|------|
| 用户主页 | 用户的全部回答/文章/想法/赞同内容 | `http://www.zhihu.com/people/xxx` |
| 专栏 | 专栏所有文章 | `http://zhuanlan.zhihu.com/xxx` |
| 文章 | 单篇文章 | `https://zhuanlan.zhihu.com/p/xxx` |
| 话题 | 话题精华回答 | `http://www.zhihu.com/topic/xxx` |
| 问题 | 问题及所有回答 | `https://www.zhihu.com/question/xxx` |
| 回答 | 单个回答 | `https://www.zhihu.com/question/xxx/answer/xxx` |
| 想法 | 单条想法 | `https://www.zhihu.com/pin/xxx` |
| 收藏夹 | 收藏夹内容 | `http://www.zhihu.com/collection/xxx` |

## 开发

本地调试需要两个终端，按顺序启动：

```bash
# 1. 编译主进程（src/ -> dist/，tsc 编译 + 复制非 TS 资源）
npm run build

# 2. 终端 A：启动前端 Vite dev server（长驻，默认监听 8080）
npm run startgui

# 3. 终端 B：启动 Electron（长驻，会以 --zhihuhelp-debug 模式运行）
npm start
```

> 说明：
> - `npm run startgui` 必须保持运行，Electron 启动时会自动探测 8080-8089 范围内正在运行的 Vite 服务并加载前端页面，因此请先启动前端、再启动 Electron。
> - 若未启动前端（探测范围内没有 Vite 服务），窗口会白屏，属预期行为。
> - 仅打包正式版时执行 `npm run buildgui`（构建前端产物到 `client/dist`），开发模式不需要。

## 技术栈

- Electron 43
- React 18 + Vite + Ant Design
- TypeScript 5.9
- dayjs
- Electron printToPDF（PDF 生成）
- Sharp（图片处理与 LaTeX 公式渲染）

## 许可证

[MIT License](https://github.com/SiwuXue/zhihuhelp/blob/master/LICENSE)

---

基于 [知乎助手](https://github.com/SiwuXue/zhihuhelp) 开发
