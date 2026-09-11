import Base from '../command/base'
import knex from '../library/knex'
import fs from 'fs'
import path from 'path'
import http from '../library/http'
import CommonConfig from '../config/common'
import shelljs from 'shelljs'
import PathConfig from '../config/path'
import semver from 'semver'
import dayjs from 'dayjs'
import * as Date_Format from '../constant/date_format'

type Type_Res_Version = {
  downloadUrl: 'http://www.baidu.com' | string
  releaseAt: '2019年2月11日12点08分' | string
  releaseNote: '' | string
  version: '1.0.0' | string
}

class InitEnv extends Base {
  public static commandName = 'Init:Env'
  public static description = '初始化运行环境'

  rebase: boolean = false

  async execute() {
    let isRebase = this.rebase
    console.log('isRebase => ', isRebase)
    this.log(`检查更新`)
    let remoteVersionConfig: Type_Res_Version = await http.rawInstance
      .get(CommonConfig.checkUpgradeUri, {
        params: {
          now: new Date().toISOString(),
        },
      })
      .then(res => {
        return res.data
      })
      .catch((e) => {
        return {
          version: '0.0.0',
        } as any
      })
    // 已经通过Electron拿到了最新知乎cookie并写入了配置文件中, 因此不需要再填写配置文件了
    if (semver.gt(remoteVersionConfig.version, CommonConfig.version)) {
      this.log('有新版本')
      this.log(`请到${remoteVersionConfig.downloadUrl}下载最新版本知乎助手`)
      this.log(`更新日期:${remoteVersionConfig.releaseAt}`)
      this.log(`更新说明:${remoteVersionConfig.releaseNote}`)
      return
    }

    this.log('初始化文件夹')
    for (let uri of PathConfig.allPathList) {
      shelljs.mkdir('-p', uri)
    }
    this.log('文件夹初始化完毕')

    if (isRebase) {
      this.log(`isRebase => ${isRebase}, 重置旧代码`)
      this.log('重建数据库')
      this.log('删除旧数据库')
      shelljs.rm(CommonConfig.db_uri)
      this.log('旧数据库删除完毕')
    }
    this.log('初始化数据库')
    const sqlContent = fs.readFileSync(path.resolve(__dirname, './init.sql')).toString()
    for (let sql of sqlContent.split(';')) {
      // 一次只能执行一行
      sql = sql.trim()
      if (sql.length) {
        await knex.raw(sql)
      }
    }
    this.log('数据库初始化完毕')

    // 自动清理过期数据(建表完成后执行, 确保表存在)
    await this.asyncCleanExpiredData()
  }

  /**
   * 数据库自动清理: 删除 retainDays 天前的旧数据, 防止 sqlite 无限膨胀
   * 抓取会在清理后重新写入最新数据, 因此不影响本次任务
   */
  private async asyncCleanExpiredData(retainDays: number = CommonConfig.db_retain_days) {
    let threshold = dayjs().subtract(retainDays, 'day').unix()
    this.log(
      `开始清理${retainDays}天前的历史数据, 时间阈值: ${dayjs(threshold * 1000).format(Date_Format.Const_Display_By_Second)}`,
    )

    // 内容表: 时间戳存储在 raw_json 的指定字段中
    // Answer 用 created_time, Pin/Article 用 created, Activity 用 created_time(行为发生时间)
    let jsonKeyTableConfigList = [
      { tableName: `Answer`, primaryKey: `answer_id`, jsonKey: `created_time` },
      { tableName: `Pin`, primaryKey: `pin_id`, jsonKey: `created` },
      { tableName: `Article`, primaryKey: `article_id`, jsonKey: `created` },
      { tableName: `Activity`, primaryKey: `id`, jsonKey: `created_time` },
    ]
    for (let config of jsonKeyTableConfigList) {
      await this.asyncDeleteExpiredByJsonKey(config.tableName, config.primaryKey, config.jsonKey, threshold)
    }

    // Collection_Record 的 record_at 是独立时间戳列, 直接按列删除
    let deletedCount = await knex(`Collection_Record`)
      .delete()
      .where(`record_at`, `<`, threshold)
      .catch((e) => {
        this.log(`清理Collection_Record过期数据失败, 错误: ${e}`)
        return 0
      })
    this.log(`已清理Collection_Record表 ${deletedCount} 条过期数据`)
  }

  /**
   * 从 raw_json 中解析 jsonKey 时间字段, 删除早于 threshold 的记录
   */
  private async asyncDeleteExpiredByJsonKey(
    tableName: string,
    primaryKey: string,
    jsonKey: string,
    threshold: number,
  ) {
    let recordList: any[] = []
    try {
      recordList = await knex.select(primaryKey, `raw_json`).from(tableName)
    } catch (e) {
      this.log(`读取${tableName}表失败, 跳过清理, 错误: ${e}`)
      return
    }
    let expireIdList: string[] = []
    for (let record of recordList) {
      let recordTime = 0
      try {
        let rawJson = JSON.parse(record?.raw_json ?? '')
        recordTime = parseInt(rawJson?.[jsonKey] ?? '0', 10)
      } catch (e) {
        // raw_json 解析失败则跳过, 不做删除
        continue
      }
      if (recordTime > 0 && recordTime < threshold) {
        expireIdList.push(`${record?.[primaryKey]}`)
      }
    }
    if (expireIdList.length === 0) {
      this.log(`${tableName}表无过期数据`)
      return
    }
    // 分批删除, 避免单条 SQL 变量过多(sqlite 变量数量上限约 999)
    for (let i = 0; i < expireIdList.length; i = i + 500) {
      let idList = expireIdList.slice(i, i + 500)
      await knex(tableName)
        .delete()
        .whereIn(primaryKey, idList)
        .catch((e) => {
          this.log(`删除${tableName}过期数据失败, 错误: ${e}`)
        })
    }
    this.log(`已清理${tableName}表 ${expireIdList.length} 条过期数据`)
  }
}

export default InitEnv
