import path from 'path'
import fs from 'fs'
import PathConfig from '../config/path'

function getVersion() {
  let packageJson = fs.readFileSync(PathConfig.packageJsonUri)
  let packageConfig
  try {
    packageConfig = JSON.parse(packageJson.toString())
  } catch (e) {
    packageConfig = {}
  }
  return packageConfig?.['version'] ?? '0.0.0'
}

export default class CommonConfig {
  // 使用serverless实现
  static readonly checkUpgradeUri = 'https://api.yaozeyuan.online/zhihuhelp/version'

  static readonly db_version = '1.0.2'
  static readonly db_uri: string = path.resolve(__dirname, `../../zhihu_v${CommonConfig.db_version}.sqlite`)

  /**
   * 数据库自动清理策略: 每次任务开始时, 删除多少天前抓取的旧数据(回答/想法/文章/行为记录等)
   * 防止 sqlite 数据库无限膨胀; 调大则保留更久, 调小则更省磁盘
   */
  static readonly db_retain_days = 30

  /**
   * 图片缓存(imgPool)清理策略: 删除超过多少天未使用的图片文件
   * 图片为 CDN 静态资源, 删除后可重新下载; 调大可减少重复下载, 调小更省磁盘
   */
  static readonly img_cache_retain_days = 90

  /**
   * 每次停止执行任务时长
   */
  static protect_To_Wait_ms = 1000
  /**
   * 每x次任务, 触发一次执行保护
   */
  static protect_Loop_Count = 10

  /**
   * 请求超时时长(虽然是request相关, 但因为这个配置项在http实例中也有用到, 为避免循环引用, 所以还是放在common里)
   */
  static readonly request_timeout_ms = 20 * 1000

  // 软件版本号
  static version = getVersion()
}
