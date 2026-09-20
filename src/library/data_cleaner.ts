import knex from '../library/knex'
import dayjs from 'dayjs'
import * as Date_Format from '../constant/date_format'
import CommonUtil from './util/common'
import Logger from './logger'
import UserSetting from './user_setting'

/**
 * 数据清理器: 删除超过保留时长的旧数据(回答/想法/文章/行为记录/收藏记录)并清理图片缓存
 * 供 Init:Env(任务开始时) 与 设置页(手动/定时清理) 复用
 */
class DataCleaner {
  /**
   * 清理 retainDays 天前的过期数据, retainDays 缺省时读取用户设置
   */
  static async asyncCleanExpiredData(retainDays?: number) {
    let setting = UserSetting.getSetting()
    let finalRetainDays = retainDays ?? setting.dbRetainDays
    let threshold = dayjs().subtract(finalRetainDays, 'day').unix()
    Logger.log(
      `[DataCleaner] 开始清理${finalRetainDays}天前的历史数据, 时间阈值: ${dayjs(threshold * 1000).format(Date_Format.Const_Display_By_Second)}`,
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
        Logger.log(`[DataCleaner] 清理Collection_Record过期数据失败, 错误: ${e}`)
        return 0
      })
    Logger.log(`[DataCleaner] 已清理Collection_Record表 ${deletedCount} 条过期数据`)

    // 定期清理全局图片缓存(imgPool): 按时间+容量双重策略, 图片保留天数读用户设置
    CommonUtil.asyncCleanImgCache(2 * 1024 * 1024 * 1024, setting.imgCacheRetainDays)
    return
  }

  /**
   * 预览按当前保留时长将清理多少条数据(不执行删除), 供设置页展示
   */
  static async asyncGetExpiredPreview(retainDays?: number) {
    let finalRetainDays = retainDays ?? UserSetting.getSetting().dbRetainDays
    let threshold = dayjs().subtract(finalRetainDays, 'day').unix()

    let jsonKeyTableConfigList = [
      { key: 'answer', tableName: `Answer`, jsonKey: `created_time` },
      { key: 'pin', tableName: `Pin`, jsonKey: `created` },
      { key: 'article', tableName: `Article`, jsonKey: `created` },
    ]
    let expiredCount: Record<string, number> = { answer: 0, pin: 0, article: 0 }
    for (let config of jsonKeyTableConfigList) {
      let recordList: any[] = []
      try {
        recordList = await knex.select(`raw_json`).from(config.tableName)
      } catch (e) {
        continue
      }
      let count = 0
      for (let record of recordList) {
        try {
          let rawJson = JSON.parse(record?.raw_json ?? '')
          let recordTime = parseInt(rawJson?.[config.jsonKey] ?? '0', 10)
          if (recordTime > 0 && recordTime < threshold) {
            count += 1
          }
        } catch (e) {
          // 解析失败不计入
        }
      }
      expiredCount[config.key] = count
    }
    return {
      retainDays: finalRetainDays,
      // 时间阈值(秒级时间戳), 早于该时间的数据将被清理
      threshold,
      expiredCount,
    }
  }

  /**
   * 从 raw_json 中解析 jsonKey 时间字段, 删除早于 threshold 的记录
   */
  private static async asyncDeleteExpiredByJsonKey(tableName: string, primaryKey: string, jsonKey: string, threshold: number) {
    let recordList: any[] = []
    try {
      recordList = await knex.select(primaryKey, `raw_json`).from(tableName)
    } catch (e) {
      Logger.log(`[DataCleaner] 读取${tableName}表失败, 跳过清理, 错误: ${e}`)
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
      Logger.log(`[DataCleaner] ${tableName}表无过期数据`)
      return
    }
    // 分批删除, 避免单条 SQL 变量过多(sqlite 变量数量上限约 999)
    for (let i = 0; i < expireIdList.length; i = i + 500) {
      let idList = expireIdList.slice(i, i + 500)
      await knex(tableName)
        .delete()
        .whereIn(primaryKey, idList)
        .catch((e) => {
          Logger.log(`[DataCleaner] 删除${tableName}过期数据失败, 错误: ${e}`)
        })
    }
    Logger.log(`[DataCleaner] 已清理${tableName}表 ${expireIdList.length} 条过期数据`)
    return
  }
}

export default DataCleaner
