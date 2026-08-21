import path from 'path'
import fs from 'fs'
import shelljs from 'shelljs'
import puppeteer, { Browser, Page } from 'puppeteer-core'
import sharp from 'sharp'
import logger from '../../../library/logger'
import PathConfig from '../../../config/path'
import CommonUtil from '../../../library/util/common'
import http from '../../../library/http'
import md5 from 'md5'
import url from 'url'
import lodash from 'lodash'
import { PDFDocument } from 'pdf-lib'
import * as Type_TaskConfig from '../../../type/task_config'

const CHROME_EXECUTABLE_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

// 知乎图片 CDN 列表，用于在下载时尝试多个服务器
const Const_Zhihu_Img_Prefix_Reg = /https:\/\/pic\w.zhimg.com/
const Const_Zhihu_Img_CDN_List = [
  'https://pic1.zhimg.com',
  'https://pic2.zhimg.com',
  'https://pic3.zhimg.com',
  'https://pic4.zhimg.com',
  'https://picx.zhimg.com',
]

class PdfGenerator {
  bookname: string = ''
  imageQuilty: Type_TaskConfig.Type_Image_Quilty = 'hd'

  // 普通图片 URL 池：原始 URL -> 本地文件名
  private imgUrlPool: Map<string, string> = new Map()

  // LaTeX 公式图片 URL 池：原始 URL -> { svgFilename, pngFilename }
  private latexImgPool: Map<string, { svgFilename: string; pngFilename: string }> = new Map()

  get pdfCachePath() {
    return path.resolve(PathConfig.htmlCachePath, this.bookname)
  }

  get pdfCacheHtmlPath() {
    return path.resolve(this.pdfCachePath, 'html')
  }

  // PDF 专用的图片缓存目录
  get pdfCacheImgPath() {
    return path.resolve(this.pdfCachePath, 'image')
  }

  get pdfOutputPath() {
    return path.resolve(PathConfig.pdfOutputPath)
  }

  get pdfOutputPathUri() {
    return path.resolve(this.pdfOutputPath, this.bookname + '.pdf')
  }

  // 全局图片缓存目录（与 EPUB 共用，避免重复下载）
  get imgCachePath() {
    return PathConfig.imgCachePath
  }

  constructor(props: { bookname: string; imageQuilty: Type_TaskConfig.Type_Image_Quilty }) {
    this.bookname = props.bookname
    this.imageQuilty = props.imageQuilty
  }

  async init() {
    shelljs.mkdir('-p', this.pdfCachePath)
    shelljs.mkdir('-p', this.pdfCacheHtmlPath)
    shelljs.mkdir('-p', this.pdfCacheImgPath)
    shelljs.mkdir('-p', this.pdfOutputPath)
    // 确保全局图片缓存目录存在
    shelljs.mkdir('-p', this.imgCachePath)
  }

  /**
   * 判断是否为 LaTeX 公式图片 URL
   */
  private isLatexEquationUrl(src: string): boolean {
    return src.includes('/equation?tex=') || src.includes('zhihu.com/equation')
  }

  /**
   * 判断 img 标签是否为 LaTeX 公式图片（通过 class 属性）
   */
  private isLatexImgByClass(imgContent: string): boolean {
    return imgContent.includes('eeimg')
  }

  /**
   * 根据图片 URL 生成本地文件名
   */
  private getImgFilename(src: string, isLatex = false): string {
    try {
      let srcMd5 = md5(src)
      let urlObj = new url.URL(src)
      let pathname = urlObj.pathname
      if (path.extname(pathname) === '') {
        pathname = `${pathname}${isLatex ? '.svg' : '.jpg'}`
      }
      if (pathname.length > 50) {
        pathname = pathname.slice(pathname.length - 50)
      }
      return CommonUtil.encodeFilename(`${srcMd5}_${pathname}`)
    } catch (e) {
      logger.warn(`[PdfGenerator] 解析图片 URL 失败: ${src}`)
      return ''
    }
  }

  /**
   * 清理 HTML，准备进行图片处理
   */
  private cleanHtml(rawHtml: string): string {
    rawHtml = lodash.replace(rawHtml, /<\/br>/g, '')
    rawHtml = lodash.replace(rawHtml, /<br +?>/g, '<br />')
    rawHtml = lodash.replace(rawHtml, /<br>/g, '<br />')
    rawHtml = lodash.replace(rawHtml, /href="\/\/link.zhihu.com'/g, 'href="https://link.zhihu.com')
    // 移除 noscript 标签内的元素
    rawHtml = lodash.replace(rawHtml, /<noscript>[\s\S]*?<\/noscript>/g, '')
    // 移除 data:image base64 图片（避免 HTML 过大）
    rawHtml = lodash.replace(rawHtml, / src="data:image[^"]*"/g, ' ')
    return rawHtml
  }

  /**
   * 处理 HTML 中的图片（包括普通图片和 LaTeX 公式图片）
   */
  private processImagesInHtml(rawHtml: string): string {
    if (this.imageQuilty === 'none') {
      return lodash.replace(rawHtml, /<img[^>]*>/g, '')
    }

    const imgContentList = rawHtml.match(/<img[^>]*>/g)
    if (imgContentList === null) {
      return rawHtml
    }

    const htmlParts = rawHtml.split(/<img[^>]*>/g)
    const processedImgList: string[] = []

    for (let imgContent of imgContentList) {
      let processedImgContent = imgContent

      // 检查是否为 LaTeX 公式图片
      let isLatexImg = this.isLatexImgByClass(imgContent)

      // 提取图片 URL，优先级：data-actualsrc > data-original > src
      let imgSrc = ''
      let matchImgSrc = imgContent.match(/(?<=data-actualsrc=")[^"]+/)
      imgSrc = matchImgSrc?.[0] || ''
      if (imgSrc === '') {
        matchImgSrc = imgContent.match(/(?<=data-original=")[^"]+/)
        imgSrc = matchImgSrc?.[0] || ''
      }
      if (imgSrc === '') {
        matchImgSrc = imgContent.match(/(?<=src=")[^"]+/)
        imgSrc = matchImgSrc?.[0] || ''
      }

      if (imgSrc === '' || imgSrc.startsWith('data:')) {
        processedImgList.push(imgContent)
        continue
      }

      // 如果 URL 是 LaTeX 公式图片，或者 class 包含 eeimg
      if (this.isLatexEquationUrl(imgSrc) || isLatexImg) {
        isLatexImg = true
        let svgFilename = this.getImgFilename(imgSrc, true)
        if (svgFilename === '') {
          processedImgList.push(imgContent)
          continue
        }
        let pngFilename = svgFilename.replace('.svg', '.png')
        this.latexImgPool.set(imgSrc, { svgFilename, pngFilename })

        // 替换 img 标签为本地 PNG 路径
        processedImgContent = lodash.replace(imgContent, / src="[^"]*"/g, ' ')
        processedImgContent = lodash.replace(processedImgContent, / data-actualsrc="[^"]*"/g, ' ')
        processedImgContent = lodash.replace(processedImgContent, / data-original="[^"]*"/g, ' ')
        processedImgContent = lodash.replace(processedImgContent, / data-default-watermark-src="[^"]*"/g, ' ')
        let localFileUri = `file:///${path.resolve(this.pdfCacheImgPath, pngFilename).replace(/\\/g, '/')}`
        processedImgContent = lodash.replace(processedImgContent, /<img /g, `<img src="${localFileUri}" `)
        processedImgList.push(processedImgContent)
        continue
      }

      // 处理普通图片
      let matchImgRawHeight = imgContent.match(/(?<=data-rawheight=")\d+/)
      let imgRawHeight = parseInt(matchImgRawHeight?.[0] || '0')
      let matchImgRawWidth = imgContent.match(/(?<=data-rawwidth=")\d+/)
      let imgRawWidth = parseInt(matchImgRawWidth?.[0] || '0')

      let hasRawImg = imgContent.indexOf(`data-original="`) !== -1
      let imgSrc_raw = lodash.replace(imgSrc, /(?=\w+)_\w+(?!=\.)/g, '_r')
      let imgSrc_hd = lodash.replace(imgSrc, /(?=\w+)_\w+(?!=\.)/g, '_b')

      let finalImgSrc = ''
      if (this.imageQuilty === 'raw') {
        finalImgSrc = imgSrc_raw
      } else {
        let needDisplayRawImg = imgRawWidth !== 0 && imgRawHeight > imgRawWidth * 4
        let isDisplayAsRawImg = hasRawImg && needDisplayRawImg
        if (isDisplayAsRawImg) {
          finalImgSrc = imgSrc_raw
        } else {
          finalImgSrc = imgSrc_hd
        }
      }

      let filename = this.getImgFilename(finalImgSrc)
      if (filename === '') {
        processedImgList.push(imgContent)
        continue
      }

      this.imgUrlPool.set(finalImgSrc, filename)

      processedImgContent = lodash.replace(imgContent, / src="[^"]*"/g, ' ')
      processedImgContent = lodash.replace(processedImgContent, / data-actualsrc="[^"]*"/g, ' ')
      processedImgContent = lodash.replace(processedImgContent, / data-original="[^"]*"/g, ' ')
      processedImgContent = lodash.replace(processedImgContent, / data-default-watermark-src="[^"]*"/g, ' ')
      let localFileUri = `file:///${path.resolve(this.pdfCacheImgPath, filename).replace(/\\/g, '/')}`
      processedImgContent = lodash.replace(processedImgContent, /<img /g, `<img src="${localFileUri}" `)

      processedImgList.push(processedImgContent)
    }

    let result = ''
    for (let i = 0; i < htmlParts.length; i++) {
      result += htmlParts[i]
      if (i < processedImgList.length) {
        result += processedImgList[i]
      }
    }
    return result
  }

  /**
   * 下载单张图片
   */
  private async downloadSingleImage(src: string, cacheUri: string): Promise<boolean> {
    let imgContent: Buffer = Buffer.from('')

    if (src.match(Const_Zhihu_Img_Prefix_Reg) !== null) {
      let rawSrc = src
      for (let prefix of Const_Zhihu_Img_CDN_List) {
        if (imgContent.length === 0) {
          let tryImgSrc = rawSrc.replace(Const_Zhihu_Img_Prefix_Reg, prefix)
          imgContent = await http.downloadImg(tryImgSrc).catch(() => {
            return Buffer.from('')
          })
        }
      }
    } else {
      imgContent = await http.downloadImg(src).catch(() => {
        return Buffer.from('')
      })
    }

    if (imgContent.length === 0) {
      logger.warn(`[PdfGenerator] 下载图片失败: ${src}`)
      return false
    }

    fs.writeFileSync(cacheUri, imgContent)
    return true
  }

  /**
   * 下载所有图片（包括普通图片和 LaTeX 公式图片）
   */
  private async downloadAllImages() {
    // 1. 下载普通图片
    let total = this.imgUrlPool.size
    if (total > 0) {
      logger.log(`[PdfGenerator] 开始下载普通图片，共 ${total} 张`)
      let index = 0
      let successCount = 0

      for (let [imgSrc, filename] of this.imgUrlPool.entries()) {
        index++
        let globalCacheUri = path.resolve(this.imgCachePath, filename)
        let pdfCacheUri = path.resolve(this.pdfCacheImgPath, filename)

        if (fs.existsSync(pdfCacheUri)) {
          successCount++
          continue
        }

        if (fs.existsSync(globalCacheUri)) {
          fs.copyFileSync(globalCacheUri, pdfCacheUri)
          successCount++
          continue
        }

        logger.log(`[PdfGenerator] 下载第 ${index}/${total} 张图片: ${imgSrc}`)
        let success = await this.downloadSingleImage(imgSrc, globalCacheUri)
        if (success) {
          fs.copyFileSync(globalCacheUri, pdfCacheUri)
          successCount++
        }
      }
      logger.log(`[PdfGenerator] 普通图片下载完成，成功 ${successCount}/${total} 张`)
    }

    // 2. 下载 LaTeX 公式图片并转换为 PNG
    let latexTotal = this.latexImgPool.size
    if (latexTotal > 0) {
      logger.log(`[PdfGenerator] 开始下载 LaTeX 公式图片，共 ${latexTotal} 张`)
      let latexIndex = 0
      let latexSuccessCount = 0

      for (let [imgSrc, filenames] of this.latexImgPool.entries()) {
        latexIndex++
        let { svgFilename, pngFilename } = filenames
        let globalSvgUri = path.resolve(this.imgCachePath, svgFilename)
        let globalPngUri = path.resolve(this.imgCachePath, pngFilename)
        let pdfPngUri = path.resolve(this.pdfCacheImgPath, pngFilename)

        // 如果 PDF 目录已有 PNG，跳过
        if (fs.existsSync(pdfPngUri)) {
          latexSuccessCount++
          continue
        }

        // 如果全局缓存有 PNG，直接复制
        if (fs.existsSync(globalPngUri)) {
          fs.copyFileSync(globalPngUri, pdfPngUri)
          latexSuccessCount++
          continue
        }

        // 如果全局缓存有 SVG，转换为 PNG
        if (fs.existsSync(globalSvgUri)) {
          try {
            await sharp(globalSvgUri).png().toFile(globalPngUri)
            fs.copyFileSync(globalPngUri, pdfPngUri)
            latexSuccessCount++
            continue
          } catch (e) {
            logger.warn(`[PdfGenerator] 转换 LaTeX SVG 失败: ${svgFilename}, 错误: ${e}`)
          }
        }

        // 下载 SVG 并转换
        logger.log(`[PdfGenerator] 下载第 ${latexIndex}/${latexTotal} 张 LaTeX 图片: ${imgSrc}`)
        let success = await this.downloadSingleImage(imgSrc, globalSvgUri)
        if (success) {
          try {
            await sharp(globalSvgUri).png().toFile(globalPngUri)
            fs.copyFileSync(globalPngUri, pdfPngUri)
            latexSuccessCount++
          } catch (e) {
            logger.warn(`[PdfGenerator] LaTeX SVG 转 PNG 失败: ${svgFilename}, 错误: ${e}`)
            // 如果转换失败，尝试直接复制 SVG（某些情况下浏览器可能直接显示 SVG）
            fs.copyFileSync(globalSvgUri, pdfPngUri.replace('.png', '.svg'))
          }
        }
      }
      logger.log(`[PdfGenerator] LaTeX 公式图片处理完成，成功 ${latexSuccessCount}/${latexTotal} 张`)
    }
  }

  /**
   * 处理完整 HTML 内容：清理 + 图片替换
   */
  private processHtmlContent(html: string): string {
    let cleanedHtml = this.cleanHtml(html)
    return this.processImagesInHtml(cleanedHtml)
  }

  async convertHtmlToPdf(htmlPath: string, pdfPath: string): Promise<void> {
    let browser: Browser | null = null

    try {
      browser = await puppeteer.launch({
        executablePath: CHROME_EXECUTABLE_PATH,
        headless: true,
        // 0 表示禁用 CDP 协议超时（默认 180 秒），大 PDF 生成时会超过
        protocolTimeout: 0,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--allow-file-access-from-files',
          // 减少内存/崩溃风险（超大单页 HTML 会加载大量图片）
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      })

      let page: Page = await browser.newPage()

      // 设置合适的视口大小
      await page.setViewport({
        width: 794, // A4 宽度 (96dpi)
        height: 1123, // A4 高度 (96dpi)
      })

      // 使用 file:// 协议加载本地 HTML
      await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
        waitUntil: 'load',
        timeout: 0,
      })

      // 额外等待，确保图片渲染完成
      await new Promise((resolve) => setTimeout(resolve, 2000))

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        // 单页 HTML 可能很大，禁用默认的 30 秒超时，避免生成 PDF 时被中断
        timeout: 0,
        // 根据 HTML 中的标题（h1/h2/h3…）生成 PDF 书签/目录
        outline: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '20mm',
          right: '20mm',
        },
      })

      await page.close()
    } catch (error) {
      logger.log(`[PdfGenerator] HTML 转 PDF 失败: ${htmlPath}, 错误: ${error}`)
      throw error
    } finally {
      if (browser) {
        try {
          await browser.close()
        } catch (e) {
          // 忽略关闭浏览器时的清理错误（如 EBUSY 临时 profile 被锁），PDF 已生成
          logger.log(`[PdfGenerator] 关闭浏览器时出错(可忽略): ${e}`)
        }
      }
    }
  }

  async saveHtmlToPdf(html: string, outputPath: string): Promise<void> {
    // 处理 HTML：清理 + 替换图片地址为本地路径
    let processedHtml = this.processHtmlContent(html)

    // 注入图片自适应样式，避免大图超出页面宽度被裁切（只显示左边）
    const responsiveStyle = '<style>img{max-width:100% !important;height:auto !important;}</style>'
    processedHtml = processedHtml.replace(/<\/head>/i, responsiveStyle + '</head>')

    // 下载所有图片（包括 LaTeX 公式图片）
    await this.downloadAllImages()

    // 写入临时 HTML 文件
    let htmlFilePath = path.resolve(this.pdfCachePath, `${this.bookname}_temp.html`)
    fs.writeFileSync(htmlFilePath, processedHtml, 'utf-8')

    // 转换为 PDF
    await this.convertHtmlToPdf(htmlFilePath, outputPath)

    // 清理临时 HTML 文件
    try {
      fs.unlinkSync(htmlFilePath)
    } catch (e) {
      // 忽略删除失败
    }
  }

  /**
   * 一次性启动浏览器，依次将多个 HTML 转为 PDF（避免超大单页 HTML 导致内存崩溃）
   */
  async convertHtmlListToPdf(htmlPathList: string[], pdfPathList: string[]): Promise<void> {
    if (htmlPathList.length !== pdfPathList.length) {
      throw new Error(`[PdfGenerator] htmlPathList 与 pdfPathList 长度不一致`)
    }

    let browser: Browser | null = null
    try {
      browser = await puppeteer.launch({
        executablePath: CHROME_EXECUTABLE_PATH,
        headless: true,
        protocolTimeout: 0,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--allow-file-access-from-files',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      })

      for (let i = 0; i < htmlPathList.length; i++) {
        let page: Page = await browser.newPage()
        try {
          await page.setViewport({ width: 794, height: 1123 })
          await page.goto(`file:///${htmlPathList[i].replace(/\\/g, '/')}`, {
            waitUntil: 'load',
            timeout: 0,
          })
          await new Promise((resolve) => setTimeout(resolve, 1000))
          await page.pdf({
            path: pdfPathList[i],
            format: 'A4',
            printBackground: true,
            timeout: 0,
            outline: true,
            margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
          })
        } finally {
          await page.close()
        }
      }
    } finally {
      if (browser) {
        try {
          await browser.close()
        } catch (e) {
          logger.log(`[PdfGenerator] 关闭浏览器时出错(可忽略): ${e}`)
        }
      }
    }
  }

  /**
   * 用 pdf-lib 合并多个 PDF 为一个 PDF
   */
  async mergePdfs(pdfPathList: string[], outputPath: string): Promise<void> {
    const mergedPdf = await PDFDocument.create()
    for (let pdfPath of pdfPathList) {
      if (!fs.existsSync(pdfPath)) {
        continue
      }
      const srcBytes = fs.readFileSync(pdfPath)
      const srcPdf = await PDFDocument.load(srcBytes)
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
      for (let page of copiedPages) {
        mergedPdf.addPage(page)
      }
    }
    const mergedBytes = await mergedPdf.save()
    fs.writeFileSync(outputPath, mergedBytes)
  }

  /**
   * 分批将 HTML 列表转换为 PDF 并合并为一个文件
   * 解决超大单页 HTML（大量图片）导致 Chrome 内存不足崩溃的问题
   */
  async asyncGeneratePdfByBatches(htmlList: string[], outputPath: string): Promise<void> {
    if (htmlList.length === 0) {
      return
    }

    // 1. 处理每批 HTML（替换图片为 file:// 路径，图片 URL 累积到图片池），并注入图片自适应样式
    const responsiveStyle = '<style>img{max-width:100% !important;height:auto !important;}</style>'
    let processedHtmlList = htmlList.map((html) => {
      let processed = this.processHtmlContent(html)
      return processed.replace(/<\/head>/i, responsiveStyle + '</head>')
    })

    // 2. 一次性下载所有图片
    await this.downloadAllImages()

    // 3. 每批写入临时 HTML 文件
    let tempHtmlPathList: string[] = []
    let tempPdfPathList: string[] = []
    for (let i = 0; i < processedHtmlList.length; i++) {
      let tempHtmlPath = path.resolve(this.pdfCachePath, `${this.bookname}_part_${i}_temp.html`)
      let tempPdfPath = path.resolve(this.pdfCachePath, `${this.bookname}_part_${i}.pdf`)
      fs.writeFileSync(tempHtmlPath, processedHtmlList[i], 'utf-8')
      tempHtmlPathList.push(tempHtmlPath)
      tempPdfPathList.push(tempPdfPath)
    }

    // 4. 分批转换为 PDF
    await this.convertHtmlListToPdf(tempHtmlPathList, tempPdfPathList)

    // 5. 合并为一个 PDF
    await this.mergePdfs(tempPdfPathList, outputPath)

    // 6. 清理临时文件
    for (let p of tempHtmlPathList) {
      try {
        fs.unlinkSync(p)
      } catch (e) {
        // 忽略删除失败
      }
    }
    for (let p of tempPdfPathList) {
      try {
        fs.unlinkSync(p)
      } catch (e) {
        // 忽略删除失败
      }
    }
  }
}

export default PdfGenerator
