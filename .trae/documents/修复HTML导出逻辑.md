# 修复 HTML 导出逻辑

## 概述

用户勾选了「仅 EPUB」导出，但输出目录里仍然出现了 HTML 文件。根因是 HTML 导出没有按勾选项判断，而是作为 EPUB 生成的「副产物」被无条件输出。

本次修复目标（用户已确认「完整修复 HTML 导出逻辑」）：

1. 勾选「仅 EPUB」时，不再输出 HTML。
2. 勾选「仅 HTML」时，能够正常输出 HTML（当前完全无输出，属于既有 bug）。
3. 勾选「HTML + EPUB」时，两者都输出。

同时回答用户关于日志的疑问：删除操作是真实执行的（详见「现状分析」第 1 点）。

## 现状分析

### 1. 日志里的「删除」是真的删除，不是只打印

[epub_generator.ts](file:///e:/Dsektop/项目资源/zhihuhelp/src/command/generate/library/epub_generator.ts) 的 `initStaticRecource()`（第 175-201 行）里，每一条 `删除旧...` 日志后面都紧跟 `shelljs.rm('-rf', ...)`：

- `删除旧epub输出资源目录:...\epub\西风卷帘....epub` → `shelljs.rm('-rf', this.epubOutputPathUri)`，真实删除旧 `.epub` 文件（`shelljs.rm -rf` 对文件、目录都生效）。
- `删除旧html输出目录:...\html\西风卷帘...` → `shelljs.rm('-rf', this.htmlOutputPathUri)`，真实删除旧 HTML 输出目录。

之所以用户「明明只勾选了 EPUB，却还能看到 HTML 输出」，是因为删完之后，`asyncGenerateEpub()` 第 530-532 行又**无条件**把 HTML 缓存目录复制回了输出目录：

```ts
this.log(`复制网页`)
shelljs.cp('-r', path.resolve(this.htmlCachePath), path.resolve(this.htmlOutputPath))
```

所以是「先删、再重新生成」，而不是「只打印日志」。

### 2. HTML 是 EPUB 生成的副产物

- 后端常量已存在 `Const_Export_Format_HTML = 'html'`（[task_config.ts](file:///e:/Dsektop/项目资源/zhihuhelp/src/constant/task_config.ts) 第 55 行），前端也有对应 HTML 复选框（[index.tsx](file:///e:/Dsektop/项目资源/zhihuhelp/client/src/page/home/component/customer_task/index.tsx) 第 375 行）。
- 但 [customer.ts](file:///e:/Dsektop/项目资源/zhihuhelp/src/command/generate/customer.ts) 的导出分发逻辑（第 100-130 行）只判断了 `EPUB`、`Markdown`、`PDF` 三种格式，**从未判断 `HTML`**。
- HTML 输出完全由 `EpubGenerator` 在生成 EPUB 时顺带完成（第 530-532 行）。
- 因此出现两个 bug：
  - 只勾 EPUB → 也会输出 HTML。
  - 只勾 HTML（不勾 EPUB）→ `generateEpub()` 根本不会被调用，导致 HTML 完全无输出。

### 3. EPUB 与 HTML 的依赖关系

EPUB 本质上是用 HTML 内容打包出来的（[epub/index.ts](file:///e:/Dsektop/项目资源/zhihuhelp/src/library/epub/index.ts)）：

- `EpubGenerator` 先把内容写成 HTML 文件到 `htmlCachePath`（`addHtml` / `addIndexHtml` / `generateSinglePageHtml`）。
- 再通过 `Epub` 对象的 `addHtml` / `addCss` / `addImage` 等，把这些 HTML/CSS/图片复制进 EPUB 的 `OEBPS` 结构里。
- 最后 `asyncGenerateEpub()` 生成 `.epub` 并复制到输出目录，同时把 HTML 缓存复制到 HTML 输出目录。

关键结论：**HTML 内容的生成（写缓存）是 EPUB 和 HTML 两者共用的**；只有「打 EPUB 包」和「复制 HTML 到输出目录」这两个动作是各自独立的。

## 修改方案

思路：让 `EpubGenerator` 知道本次需要输出哪些格式，用两个布尔值 `needGenerateEpub` / `needGenerateHtml` 控制：

- HTML 内容生成、图片下载、图片/静态资源复制 → 两者都需要的公共步骤，始终执行。
- `new Epub(...)` 及所有 `this.epub.addXxx(...)` 调用 → 仅在 `needGenerateEpub` 时执行。
- EPUB 打包 + 复制 `.epub` 到输出 → 仅在 `needGenerateEpub` 时执行。
- HTML 缓存复制到输出目录 → 仅在 `needGenerateHtml` 时执行。

### 文件 1：`src/command/generate/library/epub_generator.ts`

1. **字段改为可选 + 新增标志位**（第 105-110 行附近）：

```ts
class EpubGenerator {
  bookname = ''
  epub?: Epub
  imageQuilty: Type_TaskConfig.Type_Image_Quilty = 'hd'
  needGenerateEpub: boolean = true
  needGenerateHtml: boolean = false
  ...
}
```

2. **构造函数增加参数**（第 164-172 行）：

```ts
constructor({
  bookname,
  imageQuilty,
  needGenerateEpub = true,
  needGenerateHtml = false,
}: {
  bookname: string
  imageQuilty: Type_TaskConfig.Type_Image_Quilty
  needGenerateEpub?: boolean
  needGenerateHtml?: boolean
}) {
  this.bookname = bookname
  this.imageQuilty = imageQuilty
  this.needGenerateEpub = needGenerateEpub
  this.needGenerateHtml = needGenerateHtml
  this.initStaticRecource()
  // 仅在需要生成 EPUB 时才创建 Epub 打包对象
  if (this.needGenerateEpub) {
    this.epub = new Epub(bookname, this.epubCachePath)
  }
}
```

3. **`initStaticRecource()` 条件化创建目录**（第 175-201 行）：

- 删除逻辑保持不变（清理残留，无害）。
- HTML 缓存目录（`htmlCachePath` 及其子目录）始终创建（生成 EPUB 或 HTML 都需要）。
- EPUB 缓存目录 / EPUB 输出目录仅在 `needGenerateEpub` 时创建。
- HTML 输出目录仅在 `needGenerateHtml` 时创建。

示意：

```ts
private initStaticRecource() {
  this.log(`删除旧目录`)
  shelljs.rm('-rf', this.epubCachePath)
  shelljs.rm('-rf', this.epubOutputPathUri)
  shelljs.rm('-rf', this.htmlCachePath)
  shelljs.rm('-rf', this.htmlOutputPathUri)

  // HTML 缓存目录（生成 EPUB/HTML 共用）
  shelljs.mkdir('-p', this.htmlCachePath)
  shelljs.mkdir('-p', this.htmlCacheSingleHtmlPath)
  shelljs.mkdir('-p', this.htmlCacheHtmlPath)
  shelljs.mkdir('-p', this.htmlCacheCssPath)
  shelljs.mkdir('-p', this.htmlCacheImgPath)

  if (this.needGenerateEpub) {
    shelljs.mkdir('-p', this.epubCachePath)
    shelljs.mkdir('-p', this.epubOutputPath)
  }
  if (this.needGenerateHtml) {
    shelljs.mkdir('-p', this.htmlOutputPath)
  }
  this.log(`电子书:${this.bookname}对应文件夹创建完毕`)
}
```

4. **给所有 `this.epub.*` 调用加保护**（因为 `epub` 现在可能为 `undefined`）：

- `addHtml` 第 331 行：`if (this.epub) this.epub.addHtml(title, htmlUri)`
- `addIndexHtml` 第 356 行：`if (this.epub) this.epub.addIndexHtml(title, htmlUri)`
- `copyImgToCache` 第 477 行：`if (this.epub) this.epub.addImage(imgToUri)`
- `copyStaticResource` 第 488 行：`if (this.epub) this.epub.addCss(copyToUri)`
- `copyStaticResource` 第 495 行：`if (this.epub) this.epub.addImage(copyToUri)`
- `copyStaticResource` 第 502 行：`if (this.epub) this.epub.addCoverImage(coverCopyToUri)`

5. **`asyncGenerateEpub()` 拆分输出阶段**（第 505-533 行）：

保持前面「下载图片 → 复制图片 → 复制静态资源」不变，将最后的两个输出动作分别用标志位包裹：

```ts
if (this.needGenerateEpub && this.epub) {
  this.log(`生成电子书`)
  await this.epub.asyncGenerate()
  this.log(`电子书生成完毕`)

  this.log(`复制epub电子书`)
  fs.copyFileSync(
    path.resolve(this.epubCachePath, this.bookname + '.epub'),
    path.resolve(this.epubOutputPath, this.bookname + '.epub'),
  )
  this.log(`epub电子书复制完毕`)
}

if (this.needGenerateHtml) {
  this.log(`复制网页`)
  shelljs.cp('-r', path.resolve(this.htmlCachePath), path.resolve(this.htmlOutputPath))
  this.log(`网页复制完毕`)
}
```

### 文件 2：`src/command/generate/customer.ts`

1. **修改导出分发逻辑**（第 100-130 行），把 EPUB 和 HTML 合并判断（因为二者共用 `generateEpub` 的内容生成）：

```ts
for (let epubColumn of epubColumnList) {
  let bookname = epubColumn.bookname
  let exportFormat = generateConfig.exportFormat || Const_TaskConfig.Const_Default_Export_Format_List
  this.log(`输出电子书:${bookname}, 格式:${exportFormat.join(',')}`)

  let needGenerateEpub = exportFormat.includes(Const_TaskConfig.Const_Export_Format_EPUB)
  let needGenerateHtml = exportFormat.includes(Const_TaskConfig.Const_Export_Format_HTML)

  // 生成 EPUB / HTML（二者共用同一套 HTML 内容生成流程）
  if (needGenerateEpub || needGenerateHtml) {
    await this.generateEpub({
      epubColumn,
      imageQuilty,
      needGenerateEpub,
      needGenerateHtml,
    })
  }

  // 生成 Markdown
  if (exportFormat.includes(Const_TaskConfig.Const_Export_Format_Markdown)) {
    await this.generateMarkdown({ epubColumn, imageQuilty })
  }

  // 生成 PDF
  if (exportFormat.includes(Const_TaskConfig.Const_Export_Format_PDF)) {
    await this.generatePdf({ epubColumn, imageQuilty })
  }

  this.log(`电子书:${bookname}输出完毕`)
}
```

2. **修改 `generateEpub` 方法签名与实现**（第 1113-1174 行），把标志位透传给 `EpubGenerator`：

```ts
async generateEpub({
  imageQuilty,
  epubColumn,
  needGenerateEpub = true,
  needGenerateHtml = false,
}: {
  imageQuilty: TypeTaskConfig.Type_Image_Quilty
  epubColumn: Package.Ebook_Column
  needGenerateEpub?: boolean
  needGenerateHtml?: boolean
}) {
  let epubGenerator = new EpubGenerator({
    bookname: epubColumn.bookname,
    imageQuilty,
    needGenerateEpub,
    needGenerateHtml,
  })
  // ... 其余内容生成逻辑保持不变 ...
  await epubGenerator.asyncGenerateEpub()
  this.log(`自定义电子书${epubColumn.bookname}生成完毕`)
}
```

## 假设与决策

- **不改动前端**：前端已经有独立的 EPUB/HTML 复选框，`exportFormat` 会正确传入，无需改动 UI。
- **不改动 `Epub` 库**：EPUB 打包逻辑本身正确，只在外层控制是否调用。
- **保留 `asyncGenerateEpub` 方法名**：虽然现在它同时承担 EPUB 和 HTML 输出，但为控制改动范围，暂不重命名。
- **默认值保持向后兼容**：`needGenerateEpub` 默认 `true`、`needGenerateHtml` 默认 `false`，避免影响 `EpubGenerator` 的其他潜在调用方（当前仅 `customer.ts` 一处调用）。
- **`execute()` 末尾的缓存清理（第 133-139 行）保持不变**：它删除的是 `htmlCachePath` / `epubCachePath`（缓存），不会误删 HTML 输出目录（`htmlOutputPath`）。

## 验证步骤

1. 编译主进程：`npm run build`（或 `npm run watch`）。
2. 场景 A：只勾选 EPUB → 运行后 `知乎助手输出的电子书\epub\` 有 `.epub`，`知乎助手输出的电子书\html\` 下无对应书文件夹。
3. 场景 B：只勾选 HTML → 运行后 `知乎助手输出的电子书\html\<书名>\` 有内容（含 `html/`、`css/`、`image/`、`单文件版/`），且 `epub\` 下无对应 `.epub`。
4. 场景 C：同时勾选 EPUB + HTML → 两者都输出。
5. 场景 D：只勾选 Markdown / PDF → 输出对应格式，且不再产生 HTML/EPUB 输出。
6. 检查日志：勾选「仅 EPUB」时，不应再出现「复制网页」「网页复制完毕」日志；勾选「仅 HTML」时，不应再出现「生成电子书」「复制epub电子书」日志。
