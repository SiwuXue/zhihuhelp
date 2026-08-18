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

walk(srcRoot)
console.log('Asset copy done')
