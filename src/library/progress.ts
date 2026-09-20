/**
 * 任务进度广播: 命令执行日志(Base.log)通过此模块推送给 Electron 渲染进程,
 * 供前端(如数据浏览页导出弹窗)实时展示任务进度
 */
type Type_Progress_Listener = (message: string) => void

let progressListener: Type_Progress_Listener | null = null

class ProgressReporter {
  /**
   * 注册进度监听器(index.ts 启动时注册, 转发到 mainWindow.webContents.send)
   */
  static setListener(listener: Type_Progress_Listener | null) {
    progressListener = listener
  }

  /**
   * 推送一条进度消息, 无监听器时静默跳过
   */
  static report(message: string) {
    if (progressListener === null) {
      return
    }
    try {
      progressListener(message)
    } catch (e) {
      // 推送失败不影响任务执行
    }
  }
}

export default ProgressReporter
