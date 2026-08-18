import CommandRegistry from './command/registry'

// 初始化命令注册表
CommandRegistry.init()

async function asyncRunner() {
    // 运行环境初始化
    await CommandRegistry.handle(['Init:Env'])
    // 执行用户从命令行传入的任务
    await CommandRegistry.handle(process.argv.slice(2))
}

asyncRunner()
