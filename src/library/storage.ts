import fs from 'fs'
import path from 'path'
import knex from './knex'
import PathConfig from '../config/path'
import CommonConfig from '../config/common'

export type Type_Dir_Stats = {
  // 目录是否存在
  exists: boolean
  // 总大小(字节)
  sizeBytes: number
  // 文件数量
  fileCount: number
}

/**
 * 本地存储占用统计: 数据库/图片缓存/导出结果
 */
class StorageUtil {
  /**
   * 递归统计目录大小与文件数
   */
  static asyncGetDirStats(dirUri: string): Type_Dir_Stats {
    let stats: Type_Dir_Stats = { exists: false, sizeBytes: 0, fileCount: 0 }
    if (fs.existsSync(dirUri) === false) {
      return stats
    }
    let dirStat = fs.statSync(dirUri)
    if (dirStat.isFile()) {
      return { exists: true, sizeBytes: dirStat.size, fileCount: 1 }
    }
    stats.exists = true
    this.walkDir(dirUri, stats)
    return stats
  }

  private static walkDir(dirUri: string, stats: Type_Dir_Stats) {
    let itemList: fs.Dirent[]
    try {
      itemList = fs.readdirSync(dirUri, { withFileTypes: true })
    } catch (e) {
      return
    }
    for (let item of itemList) {
      let itemUri = path.resolve(dirUri, item.name)
      if (item.isDirectory()) {
        this.walkDir(itemUri, stats)
      } else if (item.isFile()) {
        try {
          stats.sizeBytes += fs.statSync(itemUri).size
          stats.fileCount += 1
        } catch (e) {
          // 文件被占用等场景跳过
        }
      }
    }
  }

  /**
   * 数据库占用: 文件大小 + 各内容表条目数
   */
  static async asyncGetDatabaseStats() {
    let dbStats: Type_Dir_Stats = { exists: false, sizeBytes: 0, fileCount: 0 }
    try {
      if (fs.existsSync(CommonConfig.db_uri)) {
        let stat = fs.statSync(CommonConfig.db_uri)
        dbStats = { exists: true, sizeBytes: stat.size, fileCount: 1 }
      }
    } catch (e) {
      // 数据库文件不存在时返回空统计
    }

    // 统计各内容表条目数
    let countMap = { answer: 0, pin: 0, article: 0 }
    let tableConfigList = [
      { key: 'answer', tableName: 'Answer', primaryKey: 'answer_id' },
      { key: 'pin', tableName: 'Pin', primaryKey: 'pin_id' },
      { key: 'article', tableName: 'Article', primaryKey: 'article_id' },
    ] as const
    for (let config of tableConfigList) {
      try {
        let rowList = (await knex.countDistinct(`${config.primaryKey} as count`).from(config.tableName)) as any
        countMap[config.key] = rowList?.[0]?.count ?? 0
      } catch (e) {
        // 表不存在时计为 0
      }
    }

    return {
      ...dbStats,
      ...countMap,
    }
  }

  /**
   * 图片缓存(imgPool)占用
   */
  static asyncGetMediaStats() {
    return this.asyncGetDirStats(PathConfig.imgCachePath)
  }

  /**
   * 导出结果占用
   */
  static asyncGetOutputStats() {
    return this.asyncGetDirStats(PathConfig.outputPath)
  }
}

export default StorageUtil
