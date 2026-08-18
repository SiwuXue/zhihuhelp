import Base from './base'
import InitEnv from './init_env'
import FetchCustomer from './fetch/customer'
import GenerateCustomer from './generate/customer'

type CommandConstructor = new () => Base

/**
 * 轻量级命令注册表，替代 @adonisjs/core 的 Ignitor + ace
 * 命令通过 commandName 静态属性查找
 */
class CommandRegistry {
  private static commandMap: Map<string, CommandConstructor> = new Map()

  /**
   * 注册命令
   */
  static register(CommandClass: CommandConstructor): void {
    const name = (CommandClass as any).commandName
    if (!name) {
      throw new Error(`命令类 ${CommandClass.name} 缺少 commandName 静态属性`)
    }
    this.commandMap.set(name, CommandClass)
  }

  /**
   * 批量注册
   */
  static registerAll(CommandClasses: CommandConstructor[]): void {
    for (const CommandClass of CommandClasses) {
      this.register(CommandClass)
    }
  }

  /**
   * 按命令名执行
   * 兼容原 ace.handle(['Command:Name']) 调用方式
   */
  static async handle(argv: string[]): Promise<void> {
    const commandName = argv[0]
    const CommandClass = this.commandMap.get(commandName)
    if (!CommandClass) {
      throw new Error(`未找到命令: ${commandName}`)
    }
    const instance = new CommandClass()
    await instance.run()
  }

  /**
   * 初始化：注册所有内置命令
   */
  static init(): void {
    this.registerAll([
      InitEnv,
      FetchCustomer,
      GenerateCustomer,
    ])
  }
}

export default CommandRegistry
