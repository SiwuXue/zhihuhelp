import path from 'path'
import fs from 'fs'
import shelljs from 'shelljs'
import puppeteer, { Browser, Page } from 'puppeteer-core'
import logger from '~/src/library/logger'
import PathConfig from '~/src/config/path'
import * as Type_TaskConfig from '~/src/type/task_config'

const ELECTRON_EXECUTABLE_PATH = path.resolve(
  __dirname,
  '../../../../node_modules/.pnpm/electron@23.2.0/node_modules/electron/dist/electron.exe'
)

class PdfGenerator {
  bookname: string = ''
  imageQuilty: Type_TaskConfig.Type_Image_Quilty = 'hd'

  get pdfCachePath() {
    return path.resolve(PathConfig.htmlCachePath, this.bookname)
  }

  get pdfCacheHtmlPath() {
    return path.resolve(this.pdfCachePath, 'html')
  }

  get pdfOutputPath() {
    return path.resolve(PathConfig.epubOutputPath)
  }

  get pdfOutputPathUri() {
    return path.resolve(this.pdfOutputPath, this.bookname + '.pdf')
  }

  constructor(props: { bookname: string; imageQuilty: Type_TaskConfig.Type_Image_Quilty }) {
    this.bookname = props.bookname
    this.imageQuilty = props.imageQuilty
  }

  async init() {
    shelljs.mkdir('-p', this.pdfCachePath)
    shelljs.mkdir('-p', this.pdfCacheHtmlPath)
  }

  async convertHtmlToPdf(htmlPath: string, pdfPath: string): Promise<void> {
    let browser: Browser | null = null

    try {
      browser = await puppeteer.launch({
        executablePath: ELECTRON_EXECUTABLE_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })

      let page: Page = await browser.newPage()

      await page.goto(`file://${htmlPath}`, {
        waitUntil: 'networkidle0',
      })

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '20mm',
          right: '20mm',
        },
      })

      await page.close()
    } catch (error) {
      logger.log(`HTML 转 PDF 失败: ${htmlPath}, 错误: ${error}`)
      throw error
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  }

  async saveHtmlToPdf(html: string, outputPath: string): Promise<void> {
    let htmlFilePath = path.resolve(this.pdfCachePath, `${this.bookname}_temp.html`)
    fs.writeFileSync(htmlFilePath, html, 'utf-8')
    await this.convertHtmlToPdf(htmlFilePath, outputPath)
    fs.unlinkSync(htmlFilePath)
  }
}

export default PdfGenerator
