/**
 * 复制非TS/JS资源文件到dist目录
 * tsc 只处理 .ts/.tsx/.js 文件, 其他资源文件需手动复制
 */
const fs = require('fs')
const path = require('path')

const srcRoot = path.resolve('src')
const distRoot = path.resolve('dist')

// 需要复制的资源文件扩展名
const assetExtensions = ['.html', '.css', '.sql', '.json']

function walk(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      walk(fullPath)
    } else if (assetExtensions.includes(path.extname(item.name))) {
      copyFile(fullPath)
    }
  }
}

function copyFile(filePath) {
  const relPath = path.relative(srcRoot, filePath)
  const destPath = path.join(distRoot, relPath)
  const destDir = path.dirname(destPath)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }
  fs.copyFileSync(filePath, destPath)
  console.log(`Copied: src/${relPath}`)
}

/**
 * 整目录复制(保留目录结构), 用于复制 tsc 和扩展名白名单无法覆盖的静态资源目录
 * 例如 EPUB 规范要求的 mimetype(无扩展名) 和 container.xml(.xml)
 */
function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    return
  }
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }
  for (const item of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, item.name)
    const destPath = path.join(destDir, item.name)
    if (item.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
      console.log(`Copied: src/${path.relative(srcRoot, srcPath)}`)
    }
  }
}

walk(srcRoot)

// EPUB 生成器依赖的静态资源(mimetype/container.xml/duokan-extension.xml)
copyDir(
  path.join(srcRoot, 'library', 'epub', 'resource'),
  path.join(distRoot, 'library', 'epub', 'resource'),
)
console.log('Asset copy done')
