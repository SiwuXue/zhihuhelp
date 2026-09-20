/**
 * 任务暂停控制: 提供"暂停/继续"能力, 支持断点续传
 *
 * 原理: 任务执行的各安全点(每次知乎请求前/每本书生成前)调用 asyncWaitIfPaused,
 * 暂停期间任务挂起等待(不终止进程), 点击继续后从挂起点接着执行,
 * 已抓取的数据均已入库, 不会丢失
 */
import logger from './logger'

// 暂停期间轮询等待间隔
const Const_Check_Interval_ms = 500

class TaskControl {
  // 暂停标志
  static isPaused: boolean = false

  static pause() {
    if (this.isPaused === false) {
      this.isPaused = true
      logger.log(`[任务控制] 任务已暂停, 当前进度已保存, 点击"继续任务"后接着执行`)
    }
    return this.getStatus()
  }

  static resume() {
    if (this.isPaused === true) {
      this.isPaused = false
      logger.log(`[任务控制] 任务已恢复执行`)
    }
    return this.getStatus()
  }

  static getStatus() {
    return {
      isPaused: this.isPaused,
    }
  }

  /**
   * 暂停检查点: 任务执行到此处时, 若处于暂停状态则挂起等待, 恢复后继续
   */
  static async asyncWaitIfPaused() {
    while (this.isPaused) {
      await new Promise((resolve) => setTimeout(resolve, Const_Check_Interval_ms))
    }
  }
}

export default TaskControl
