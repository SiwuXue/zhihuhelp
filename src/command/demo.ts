import Base from '../command/base'

class CommandDemo extends Base {
  public static commandName = 'Command:Demo'
  public static description = 'demo命令'

  async execute() {
    this.log('获取回答列表')
  }
}

export default CommandDemo
