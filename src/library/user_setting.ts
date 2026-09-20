import fs from 'fs'
import path from 'path'
import PathConfig from '../config/path'
import CommonConfig from '../config/common'

export type Type_User_Setting = {
  // 是否开启自动清理(应用运行期间, 每24小时最多执行一次)
  autoCleanEnabled: boolean
  // 数据保留天数: 删除多少天前抓取的旧数据(回答/想法/文章/行为记录等)
  dbRetainDays: number
  // 图片缓存保留天数: 删除多少天未使用的图片文件
  imgCacheRetainDays: number
  // 上次清理时间戳(毫秒), null 表示从未清理过
  lastCleanAt: number | null
}

/**
 * 用户设置持久化: 存储在应用根目录 user_setting.json, 与任务配置(config.json)相互独立
 */
class UserSetting {
  static FILE_URI = path.resolve(PathConfig.rootPath, 'user_setting.json')
  static DEFAULT_SETTING: Type_User_Setting = {
    autoCleanEnabled: false,
    dbRetainDays: CommonConfig.db_retain_days,
    imgCacheRetainDays: CommonConfig.img_cache_retain_days,
    lastCleanAt: null,
  }

  /**
   * 读取用户设置, 文件不存在或解析失败时返回默认值
   */
  static getSetting(): Type_User_Setting {
    try {
      if (fs.existsSync(this.FILE_URI) === false) {
        return { ...this.DEFAULT_SETTING }
      }
      let content = fs.readFileSync(this.FILE_URI).toString()
      let setting = JSON.parse(content)
      return {
        autoCleanEnabled: setting?.autoCleanEnabled === true,
        dbRetainDays: this.normalizeRetainDays(setting?.dbRetainDays),
        imgCacheRetainDays: this.normalizeRetainDays(setting?.imgCacheRetainDays, CommonConfig.img_cache_retain_days),
        lastCleanAt: typeof setting?.lastCleanAt === 'number' ? setting.lastCleanAt : null,
      }
    } catch (e) {
      return { ...this.DEFAULT_SETTING }
    }
  }

  /**
   * 保存用户设置(全量覆盖)
   */
  static saveSetting(setting: Type_User_Setting): void {
    let normalizedSetting: Type_User_Setting = {
      autoCleanEnabled: setting?.autoCleanEnabled === true,
      dbRetainDays: this.normalizeRetainDays(setting?.dbRetainDays),
      imgCacheRetainDays: this.normalizeRetainDays(setting?.imgCacheRetainDays, CommonConfig.img_cache_retain_days),
      lastCleanAt: typeof setting?.lastCleanAt === 'number' ? setting.lastCleanAt : null,
    }
    fs.writeFileSync(this.FILE_URI, JSON.stringify(normalizedSetting, null, 2))
    return
  }

  /**
   * 保留天数合法化: 限定在 1~3650 之间, 非法时回退到 fallback
   */
  static normalizeRetainDays(value: any, fallback: number = CommonConfig.db_retain_days): number {
    let days = parseInt(String(value ?? ''), 10)
    if (isNaN(days) || days < 1) {
      return fallback
    }
    if (days > 3650) {
      return 3650
    }
    return days
  }
}

export default UserSetting
