import TypeTaskConfig from '../../type/task_config'
import * as Const_TaskConfig from '../../constant/task_config'
import PathConfig from '../../config/path'
import MAnswer from '../../model/answer'
import MArticle from '../../model/article'
import MPin from '../../model/pin'
import MExportRecord from '../../model/export_record'
import CommonUtil from '../../library/util/common'
import shelljs from 'shelljs'
import dayjs from 'dayjs'

import * as Package from './resource/library/package'
import GenerateCustomer from './customer'

type Type_Selected_Record_Item = {
  recordType: 'answer' | 'pin' | 'article'
  recordId: string
}

type Type_Selected_Task_Param = {
  // 要导出的条目列表
  recordList: Type_Selected_Record_Item[]
  // 导出格式列表, 值为 Const_TaskConfig.Const_Export_Format_*
  formats: string[]
  // 书名
  bookname: string
  imageQuilty: TypeTaskConfig.Type_Image_Quilty
  watermark: string
}

/**
 * 导出用户在数据浏览页勾选的条目为电子书
 * 继承自 GenerateCustomer, 复用其 generateEpub/generateMarkdown/generatePdf 能力
 */
class GenerateSelected extends GenerateCustomer {
  public static commandName = 'Generate:Selected'
  public static description = `导出用户勾选的数据条目为电子书`

  private taskParam!: Type_Selected_Task_Param

  initTask(param: Type_Selected_Task_Param) {
    this.taskParam = param
  }

  async execute(): Promise<any> {
    let { recordList, formats, bookname, imageQuilty, watermark } = this.taskParam
    try {
      this.log(`开始导出选中数据, 共${recordList.length}条, 格式:${formats.join(',')}`)

      // 按类型分组
      let answerIdList = recordList.filter((item) => item.recordType === 'answer').map((item) => item.recordId)
      let pinIdList = recordList.filter((item) => item.recordType === 'pin').map((item) => item.recordId)
      let articleIdList = recordList.filter((item) => item.recordType === 'article').map((item) => item.recordId)

      // 从数据库批量取数, 构造页面列表
      let pageList: Package.Type_Page_Item[] = []
      let failedCount = 0

      if (answerIdList.length) {
        this.log(`读取回答 ${answerIdList.length} 条`)
        let answerList = await MAnswer.asyncGetAnswerList(answerIdList)
        failedCount += answerIdList.length - answerList.length
        for (let item of answerList) {
          try {
            let page = new Package.Page_Question({
              baseInfo: item.question,
            })
            page.add({
              actionAt: 0,
              record: item,
            })
            pageList.push(page)
          } catch (e) {
            failedCount += 1
            this.log(`跳过无法解析的回答:${item?.id}`)
          }
        }
      }

      if (pinIdList.length) {
        this.log(`读取想法 ${pinIdList.length} 条`)
        let pinList = await MPin.asyncGetPinList(pinIdList)
        failedCount += pinIdList.length - pinList.length
        for (let item of pinList) {
          try {
            let page = new Package.Page_Pin()
            page.add({
              actionAt: 0,
              record: item,
            })
            pageList.push(page)
          } catch (e) {
            failedCount += 1
            this.log(`跳过无法解析的想法:${item?.id}`)
          }
        }
      }

      if (articleIdList.length) {
        this.log(`读取文章 ${articleIdList.length} 条`)
        let articleList = await MArticle.asyncGetArticleList(articleIdList)
        failedCount += articleIdList.length - articleList.length
        for (let item of articleList) {
          try {
            let page = new Package.Page_Article()
            page.add({
              actionAt: 0,
              record: item,
            })
            pageList.push(page)
          } catch (e) {
            failedCount += 1
            this.log(`跳过无法解析的文章:${item?.id}`)
          }
        }
      }

      if (failedCount > 0) {
        this.warn(`有${failedCount}条数据在数据库中不存在或已损坏, 已跳过`)
      }

      if (pageList.length === 0) {
        this.log(`选中条目均无有效内容, 取消导出`)
        return
      }

      // 合并为一本电子书, 不分卷
      let mixUnit = new Package.Unit_混合类型({ pageList })
      // 按创建时间倒序排列
      mixUnit.sortPageList({
        orderWith: Const_TaskConfig.Const_Order_With_创建时间,
        orderBy: Const_TaskConfig.Const_Order_By_Desc,
      })
      let epubColumn = new Package.Ebook_Column({
        bookname,
        unitList: [mixUnit],
      })

      // 按格式生成
      let needGenerateEpub = formats.includes(Const_TaskConfig.Const_Export_Format_EPUB)
      let needGenerateHtml = formats.includes(Const_TaskConfig.Const_Export_Format_HTML)

      if (needGenerateEpub || needGenerateHtml) {
        await this.generateEpub({
          epubColumn,
          imageQuilty,
          needGenerateEpub,
          needGenerateHtml,
          watermark,
        })
      }

      if (formats.includes(Const_TaskConfig.Const_Export_Format_Markdown)) {
        await this.generateMarkdown({
          epubColumn,
          imageQuilty,
          watermark,
        })
      }

      if (formats.includes(Const_TaskConfig.Const_Export_Format_PDF)) {
        await this.generatePdf({
          epubColumn,
          imageQuilty,
          watermark,
        })
      }

      this.log(`电子书:${bookname}输出完毕`)

      // 记录导出时间, 按(条目, 格式)记录
      let exportedAt = dayjs().unix()
      for (let item of recordList) {
        for (let format of formats) {
          await MExportRecord.asyncReplaceExportRecord({
            recordType: item.recordType,
            recordId: item.recordId,
            format,
            exportedAt,
          }).catch((e) => {
            this.warn(`记录导出状态失败:${item.recordType}_${item.recordId}_${format}`)
          })
        }
      }
      this.log(`选中数据导出完毕`)
    } finally {
      // 无论生成成功还是中途异常, 都执行清理, 防止临时/图片缓存长期占用磁盘
      this.log(`开始清理中间缓存目录`)
      shelljs.rm('-rf', PathConfig.htmlCachePath)
      shelljs.rm('-rf', PathConfig.epubCachePath)
      this.log(`中间缓存目录清理完毕`)
      CommonUtil.asyncCleanImgCache()
    }
  }
}

export default GenerateSelected
