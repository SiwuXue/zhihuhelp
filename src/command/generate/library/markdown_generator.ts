import fs from 'fs'
import path from 'path'
import shelljs from 'shelljs'
import TurndownService from 'turndown'
import PathConfig from '~/src/config/path'
import logger from '~/src/library/logger'
import lodash from 'lodash'
import * as Type_TaskConfig from '~/src/type/task_config'
import http from '~/src/library/http'
import md5 from 'md5'
import url from 'url'
import CommonUtil from '~/src/library/util/common'

const Const_Zhihu_Img_Prefix_Reg = /https:\/\/pic\w.zhimg.com/
const Const_Zhihu_Img_CDN_List = [
    'https://pic1.zhimg.com',
    'https://pic2.zhimg.com',
    'https://pic3.zhimg.com',
    'https://pic4.zhimg.com',
    'https://picx.zhimg.com',
]

/**
 * Markdown 生成器
 * 将 HTML 内容转换为 Markdown 格式
 */
class MarkdownGenerator {
    bookname = ''
    imageQuilty: Type_TaskConfig.Type_Image_Quilty = 'hd'

    // 存储从 HTML 中提取的图片 URL
    private imgUrlList: string[] = []

    get markdownCachePath() {
        return path.resolve(PathConfig.cachePath, 'markdown', this.bookname)
    }

    get markdownOutputPath() {
        return path.resolve(PathConfig.outputPath, 'markdown')
    }

    get markdownOutputPathUri() {
        return path.resolve(this.markdownOutputPath, this.bookname)
    }

    get imageOutputPath() {
        return path.resolve(this.markdownOutputPathUri, 'images')
    }

    get imageCachePath() {
        return path.resolve(PathConfig.imgCachePath)
    }

    private turndownService: TurndownService

    constructor({ bookname, imageQuilty }: { bookname: string; imageQuilty: Type_TaskConfig.Type_Image_Quilty }) {
        this.bookname = bookname
        this.imageQuilty = imageQuilty
        this.initStaticResource()
        this.turndownService = this.createTurndownService()
    }

    /**
     * 初始化静态资源目录
     */
    private initStaticResource() {
        // 删除旧目录
        shelljs.rm('-rf', this.markdownCachePath)
        shelljs.rm('-rf', this.markdownOutputPathUri)

        // 创建新目录
        shelljs.mkdir('-p', this.markdownCachePath)
        shelljs.mkdir('-p', this.markdownOutputPath)
        shelljs.mkdir('-p', this.markdownOutputPathUri)
        shelljs.mkdir('-p', this.imageOutputPath)
    }

    /**
     * 检查是否为 LaTeX 公式图片 URL
     */
    private isLatexEquationUrl(url: string): boolean {
        return url.includes('/equation?tex=') || url.includes('zhihu.com/equation')
    }

    /**
     * 从 LaTeX 公式图片 URL 中提取公式文本
     */
    private extractLatexFromUrl(imgUrl: string): string {
        try {
            const urlObj = new url.URL(imgUrl)
            const tex = urlObj.searchParams.get('tex')
            if (tex) {
                // URL 解码
                return decodeURIComponent(tex)
            }
        } catch (e) {
            // 解析失败，返回空
        }
        return ''
    }

    /**
     * 从 HTML 中提取图片 URL（排除 LaTeX 公式图片）
     */
    private extractImageUrls(html: string): string[] {
        const urls: string[] = []
        // 匹配各种图片属性
        const patterns = [
            /data-actualsrc="([^"]+)"/g,
            /data-original="([^"]+)"/g,
            /src="(https?:[^"]+)"/g,
        ]

        for (const pattern of patterns) {
            let match
            while ((match = pattern.exec(html)) !== null) {
                const imgUrl = match[1]
                // 过滤掉 data:image 和 LaTeX 公式图片
                if (imgUrl && !imgUrl.startsWith('data:image') && !urls.includes(imgUrl)) {
                    // 跳过 LaTeX 公式图片（将单独处理为 Markdown 公式）
                    if (this.isLatexEquationUrl(imgUrl)) {
                        continue
                    }
                    // 接受所有 http/https 图片 URL
                    if (imgUrl.startsWith('http')) {
                        urls.push(imgUrl)
                    }
                }
            }
        }
        return urls
    }

    /**
     * 从 Markdown 内容中提取图片引用（用于找出遗漏的图片）
     */
    private extractImageRefsFromMarkdown(markdown: string): string[] {
        const refs: string[] = []
        // 匹配 Markdown 图片语法: ![alt](./images/filename.jpg)
        const pattern = /!\[.*?\]\(\.\/images\/([^)]+)\)/g
        let match
        while ((match = pattern.exec(markdown)) !== null) {
            refs.push(match[1])
        }
        return refs
    }

    /**
     * 获取图片文件名
     */
    private getImageFilename(src: string): string {
        try {
            const srcMd5 = md5(src)
            const urlObj = new url.URL(src)
            let pathname = urlObj.pathname
            if (path.extname(pathname) === '') {
                pathname = `${pathname}.jpg`
            }
            if (pathname.length > 50) {
                pathname = pathname.slice(pathname.length - 50)
            }
            return CommonUtil.encodeFilename(`${srcMd5}_${pathname}`)
        } catch (e) {
            logger.warn(`[MarkdownGenerator] 解析图片 URL 失败: ${src}`)
            return ''
        }
    }

    /**
     * 下载单张图片
     */
    private async downloadSingleImage(src: string, cacheUri: string): Promise<void> {
        let imgContent: Buffer = Buffer.from('')

        // 知乎图片 CDN 不稳定，需要尝试多个服务器
        if (src.match(Const_Zhihu_Img_Prefix_Reg) !== null) {
            const rawSrc = src
            for (const prefix of Const_Zhihu_Img_CDN_List) {
                if (imgContent.length === 0) {
                    const tryImgSrc = rawSrc.replace(Const_Zhihu_Img_Prefix_Reg, prefix)
                    imgContent = await http.downloadImg(tryImgSrc).catch(() => {
                        return Buffer.from('')
                    })
                }
            }
        } else {
            // 非知乎图片直接下载
            imgContent = await http.downloadImg(src).catch(() => {
                return Buffer.from('')
            })
        }

        if (imgContent.length === 0) {
            logger.warn(`[MarkdownGenerator] 下载图片失败: ${src}`)
            return
        }

        fs.writeFileSync(cacheUri, imgContent)
    }

    /**
     * 下载所有图片
     */
    private async downloadImages() {
        logger.log(`[MarkdownGenerator] 开始下载图片，共 ${this.imgUrlList.length} 张`)

        for (let i = 0; i < this.imgUrlList.length; i++) {
            const imgUrl = this.imgUrlList[i]
            const filename = this.getImageFilename(imgUrl)

            if (!filename) continue

            const cacheUri = path.resolve(this.imageCachePath, filename)
            const outputUri = path.resolve(this.imageOutputPath, filename)

            // 检查缓存中是否已有该图片
            if (fs.existsSync(cacheUri)) {
                logger.log(`[MarkdownGenerator] 第 ${i + 1}/${this.imgUrlList.length} 张图片已存在缓存，直接复制`)
                fs.copyFileSync(cacheUri, outputUri)
                continue
            }

            // 下载图片
            logger.log(`[MarkdownGenerator] 下载第 ${i + 1}/${this.imgUrlList.length} 张图片: ${imgUrl}`)
            await this.downloadSingleImage(imgUrl, cacheUri)

            // 复制到输出目录
            if (fs.existsSync(cacheUri)) {
                fs.copyFileSync(cacheUri, outputUri)
            }
        }

        logger.log(`[MarkdownGenerator] 图片下载完成`)
    }

    /**
     * 创建 Turndown 服务实例
     */
    private createTurndownService(): TurndownService {
        const turndown = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            strongDelimiter: '**',
            emDelimiter: '*',
        })

        // 自定义规则：处理知乎公式
        turndown.addRule('math', {
            filter: (node: any) => {
                return node.nodeName === 'IMG' && node.classList && node.classList.contains('eeimg')
            },
            replacement: (content: string, node: any) => {
                const alt = node.getAttribute('alt') || ''
                // 如果是行内公式，使用 $...$
                // 如果是块级公式，使用 $$...$$
                const parentNodeName = node.parentNode?.nodeName || ''
                if (parentNodeName === 'P') {
                    return `$$${alt}$$`
                }
                return `$${alt}$`
            },
        })

        // 自定义规则：处理代码块
        turndown.addRule('codeBlock', {
            filter: (node: any) => {
                return node.nodeName === 'PRE' && node.querySelector && node.querySelector('code') !== null
            },
            replacement: (content: string, node: any) => {
                const codeNode = node.querySelector('code')
                const classAttr = codeNode?.getAttribute('class') || ''
                const language = classAttr.replace('language-', '')
                const code = codeNode?.textContent || ''
                return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`
            },
        })

        // 自定义规则：处理图片
        turndown.addRule('image', {
            filter: 'img',
            replacement: (content: string, node: any) => {
                const src = node.getAttribute('src') || ''
                const alt = node.getAttribute('alt') || ''

                // 跳过 LaTeX 公式图片（已在上面的规则中处理）
                if (node.classList && node.classList.contains('eeimg')) {
                    return ''
                }

                // 处理知乎公式图片（URL 中包含 /equation?tex=）
                if (this.isLatexEquationUrl(src)) {
                    const latex = this.extractLatexFromUrl(src)
                    if (latex) {
                        // 根据父元素判断是行内公式还是块级公式
                        const parentNodeName = node.parentNode?.nodeName || ''
                        if (parentNodeName === 'P' || parentNodeName === 'DIV') {
                            return `$$${latex}$$`
                        }
                        return `$${latex}$`
                    }
                }

                // 提取文件名
                const filename = this.getImageFilename(src)
                if (!filename) {
                    return `![${alt}](${src})`
                }
                // 转换为相对路径
                return `![${alt}](./images/${filename})`
            },
        })

        // 自定义规则：处理链接
        turndown.addRule('link', {
            filter: 'a',
            replacement: (content: string, node: any) => {
                const href = node.getAttribute('href') || ''
                return `[${content}](${href})`
            },
        })

        return turndown
    }

    /**
     * 清理 HTML，准备转换
     */
    private cleanHtml(html: string): string {
        // 移除 noscript 标签
        html = lodash.replace(html, /<noscript>[\s\S]*?<\/noscript>/g, '')
        // 修复自闭合标签
        html = lodash.replace(html, /<\/br>/g, '')
        html = lodash.replace(html, /<br +?>/g, '<br />')
        html = lodash.replace(html, /<br>/g, '<br />')
        // 修复跳转链接
        html = lodash.replace(html, /href="\/\/link.zhihu.com/g, 'href="https://link.zhihu.com')
        return html
    }

    /**
     * 将 HTML 转换为 Markdown
     */
    convertHtmlToMarkdown(html: string, title: string): string {
        // 清理 HTML
        const cleanedHtml = this.cleanHtml(html)

        // 提取图片 URL
        const imageUrls = this.extractImageUrls(cleanedHtml)
        this.imgUrlList.push(...imageUrls.filter(url => !this.imgUrlList.includes(url)))

        // 转换为 Markdown
        let markdown = this.turndownService.turndown(cleanedHtml)

        // 添加标题
        markdown = `# ${title}\n\n${markdown}`

        // 后处理：修复公式格式
        markdown = this.fixMathFormulas(markdown)

        return markdown
    }

    /**
     * 修复公式格式
     */
    private fixMathFormulas(markdown: string): string {
        // 修复行内公式
        markdown = markdown.replace(/\$\$([^\n]+?)\$\$/g, (match, formula) => {
            // 如果公式中没有换行，使用单行公式
            if (!formula.includes('\\')) {
                return `$${formula}$`
            }
            return match
        })

        // 修复多余的空行
        markdown = markdown.replace(/\n{3,}/g, '\n\n')

        return markdown
    }

    /**
     * 保存 Markdown 文件
     */
    saveMarkdownFile(filename: string, content: string) {
        const filePath = path.resolve(this.markdownOutputPathUri, `${filename}.md`)
        fs.writeFileSync(filePath, content, 'utf-8')
        logger.log(`[MarkdownGenerator] 已保存: ${filePath}`)
    }

    /**
     * 复制图片到输出目录
     */
    copyImages(imageSourcePath: string) {
        if (imageSourcePath && fs.existsSync(imageSourcePath)) {
            const files = fs.readdirSync(imageSourcePath)
            for (const file of files) {
                const srcPath = path.resolve(imageSourcePath, file)
                const destPath = path.resolve(this.imageOutputPath, file)
                fs.copyFileSync(srcPath, destPath)
            }
            logger.log(`[MarkdownGenerator] 已复制 ${files.length} 张图片`)
        }
    }

    /**
     * 生成 Markdown 文件
     * @param pages 页面列表
     * @param imageSourcePath 图片来源路径（HTML 生成的图片缓存目录）
     */
    async generateMarkdown(
        pages: Array<{
            filename: string
            title: string
            html: string
        }>,
        imageSourcePath: string
    ) {
        logger.log(`[MarkdownGenerator] 开始生成 Markdown，共 ${pages.length} 个页面`)
        logger.log(`[MarkdownGenerator] 图片来源路径: ${imageSourcePath || '(空)'}`)
        logger.log(`[MarkdownGenerator] 图片输出路径: ${this.imageOutputPath}`)

        // 复制外部来源的图片（如果有）
        this.copyImages(imageSourcePath)

        // 重置图片列表
        this.imgUrlList = []

        // 先提取所有页面中的图片 URL
        for (const page of pages) {
            const cleanedHtml = this.cleanHtml(page.html)
            const imageUrls = this.extractImageUrls(cleanedHtml)
            for (const imgUrl of imageUrls) {
                if (!this.imgUrlList.includes(imgUrl)) {
                    this.imgUrlList.push(imgUrl)
                }
            }
        }

        logger.log(`[MarkdownGenerator] 从 HTML 中提取到 ${this.imgUrlList.length} 张图片 URL`)

        // 下载图片
        await this.downloadImages()

        // 检查图片输出目录
        if (fs.existsSync(this.imageOutputPath)) {
            const files = fs.readdirSync(this.imageOutputPath)
            logger.log(`[MarkdownGenerator] 图片输出目录中存在 ${files.length} 个文件: ${files.join(', ')}`)
        } else {
            logger.log(`[MarkdownGenerator] 图片输出目录不存在: ${this.imageOutputPath}`)
        }

        // 转换每个页面
        for (const page of pages) {
            const markdown = this.convertHtmlToMarkdown(page.html, page.title)
            this.saveMarkdownFile(page.filename, markdown)
        }

        logger.log(`[MarkdownGenerator] Markdown 生成完成`)
    }

    /**
     * 生成合并的 Markdown 文件（单文件版）
     */
    async generateMergedMarkdown(
        pages: Array<{
            filename: string
            title: string
            html: string
        }>,
        imageSourcePath: string,
        bookTitle: string
    ) {
        logger.log(`[MarkdownGenerator] 开始生成合并版 Markdown`)

        // 复制外部来源的图片（如果有）
        this.copyImages(imageSourcePath)

        // 合并所有内容
        let mergedContent = `# ${bookTitle}\n\n`

        for (const page of pages) {
            const markdown = this.convertHtmlToMarkdown(page.html, page.title)
            // 移除标题（因为合并版已经有主标题了）
            const contentWithoutTitle = markdown.replace(/^# .+\n\n/, '')
            mergedContent += `## ${page.title}\n\n${contentWithoutTitle}\n\n---\n\n`
        }

        // 保存合并版
        const mergedPath = path.resolve(this.markdownOutputPathUri, `${this.bookname}.md`)
        fs.writeFileSync(mergedPath, mergedContent, 'utf-8')
        logger.log(`[MarkdownGenerator] 合并版 Markdown 已保存: ${mergedPath}`)
    }
}

export default MarkdownGenerator
