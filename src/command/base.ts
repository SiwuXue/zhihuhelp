import lodash from 'lodash'
import logger from '../library/logger'

/**
 * 轻量级命令基类，替代 @adonisjs/ace 的 BaseCommand
 * 提供命令注册、日志输出和错误处理能力
 */
abstract class Base {
  public static commandName: string = 'Command:Base'
  public static description: string = '命令基类, 无实际功能'

  /**
   * 在最外层进行一次封装, 方便获得报错信息
   */
  async run(): Promise<void> {
    this.log('command start')
    await this.execute().catch((e) => {
      this.log('catch error')
      this.log(e.stack)
    })
    this.log('command finish')
  }

  /**
   * 子类实现具体逻辑
   */
  async execute(): Promise<any> { }

  /**
   * 简易logger
   */
  async log(...argumentList: any[]): Promise<void> {
    let message = ''
    for (const rawMessage of argumentList) {
      if (lodash.isString(rawMessage) === false) {
        message = message + JSON.stringify(rawMessage)
      } else {
        message = message + rawMessage
      }
    }
    logger.log(`[${this.constructor.name}] ` + message)
  }

  /**
   * 简易logger
   */
  async warn(...argumentList: any[]): Promise<void> {
    let message = ''
    for (const rawMessage of argumentList) {
      if (lodash.isString(rawMessage) === false) {
        message = message + JSON.stringify(rawMessage)
      } else {
        message = message + rawMessage
      }
    }
    logger.warn(`[${this.constructor.name}] ` + message)
  }
}

export default Base
