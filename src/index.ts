// Modules to control application life and create native browser window
import Electron, { Menu } from 'electron'
import RequestConfig from './config/request'
import PathConfig from './config/path'
import CommonUtil from './library/util/common'
import Logger from './library/logger'
import CommandRegistry from './command/registry'
import * as FrontTools from './library/util/front_tools'
import { setBridgeFunc } from './library/zhihu_encrypt/index'
import * as Type_TaskConfig from './type/task_config'
import MSummary from './model/summary'
import MAnswer from './model/answer'
import MPin from './model/pin'
import MArticle from './model/article'
import MExportRecord from './model/export_record'
import GenerateSelected from './command/generate/selected'
import UserSetting from './library/user_setting'
import DataCleaner from './library/data_cleaner'
import StorageUtil from './library/storage'
import CommonConfig from './config/common'
import dayjs from 'dayjs'
import http from './library/http'
import fs from 'fs'
import path from 'path'
import NodeHttp from 'http'

// 初始化命令注册表
CommandRegistry.init()

let argv = process.argv
let isDebug = argv.includes('--zhihuhelp-debug')
let { app, BrowserWindow, ipcMain, session, shell } = Electron
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: Electron.BrowserWindow
// 用于执行远程通信
let jsRpcWindow: Electron.BrowserWindow

let isRunning = false

const isMacOS = process.platform === 'darwin'

/**
 * 探测前端 Vite dev server 实际监听的端口
 * Vite 默认监听 8080, 端口被占用时会自动改用 8081/8082..., 逐个探测避免主窗口白屏
 */
function asyncGetDevServerUrl(): Promise<string> {
  const portList: number[] = []
  for (let port = 8080; port <= 8089; port++) {
    portList.push(port)
  }
  return new Promise((resolve) => {
    let isResolved = false
    const resolveOnce = (url: string) => {
      if (isResolved) {
        return
      }
      isResolved = true
      resolve(url)
    }
    let portIndex = 0
    const tryNextPort = () => {
      if (isResolved) {
        return
      }
      if (portIndex >= portList.length) {
        // 未探测到 Vite 服务, 回退默认端口(此时前端未启动, 加载会白屏, 属预期行为)
        resolveOnce('http://localhost:8080')
        return
      }
      const port = portList[portIndex++]
      const req = NodeHttp.get(`http://localhost:${port}/`, (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          // Vite dev server 会在首页注入 @vite/client 脚本, 以此确认是前端服务
          if (body.includes('@vite/client')) {
            resolveOnce(`http://localhost:${port}`)
          } else {
            tryNextPort()
          }
        })
        res.on('error', () => tryNextPort())
      })
      req.setTimeout(300, () => {
        req.destroy()
        tryNextPort()
      })
      req.on('error', () => tryNextPort())
    }
    tryNextPort()
  })
}

async function asyncCreateWindow() {
  if (process.platform === 'darwin') {
    const template = [
      {
        label: 'Application',
        submenu: [
          {
            label: 'Quit',
            accelerator: 'Command+Q',
            click: function () {
              app.quit()
            },
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
          { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
        ],
      },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  } else {
    Menu.setApplicationMenu(null)
  }

  const { screen } = Electron
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width,
    height,
    // 自动隐藏菜单栏
    autoHideMenuBar: true,
    // 窗口的默认标题
    title: '知乎助手',
    // 在屏幕中间展示窗口
    center: true,
    // 展示原生窗口栏
    frame: true,
    // 禁用web安全功能 --> 个人软件, 要啥自行车
    webPreferences: {
      // 使用preload.js, 以进行rpc通信
      preload: path.join(__dirname, 'preload.js'),
      // 开启 DevTools.
      devTools: true,
      // 禁用同源策略, 允许加载任何来源的js
      webSecurity: false,
      // 允许 https 页面运行 http url 里的资源
      allowRunningInsecureContent: true,
      // 禁用node支持-从而有效加快页面启动速度
      // nodeIntegration: false,
      // Electron12后, 启用node支持时还需要关闭上下文隔离
      // contextIsolation: false,
      // 启用webview标签
      webviewTag: true,
    },
  })
  // 专门启动一个窗口, 用于通过jsRpc计算签名
  jsRpcWindow = new BrowserWindow({
    enableLargerThanScreen: true,
    width: 760,
    height: 500,
    // 负责渲染的子窗口不需要显示出来, 避免被用户误关闭
    show: isDebug ? true : false,
    // 禁用web安全功能 --> 个人软件, 要啥自行车
    webPreferences: {
      // 开启 DevTools.
      devTools: true,
      // 禁用同源策略, 允许加载任何来源的js
      webSecurity: false,
      // // js-rpc需要
      // contextIsolation: true,
      // 启用webview标签
      webviewTag: true,
      // 启用preload.js, 以进行rpc通信
      preload: path.join(__dirname, 'public', 'js-rpc', 'preload.js'),
    },
  })

  // and load the index.html of the app.
  // and load the index.html of the app.
  if (isDebug) {
    // 本地调试 & 打开控制台
    // mainWindow.loadFile('./client/index.html')
    let devServerUrl = await asyncGetDevServerUrl()
    Logger.log(`加载前端开发服务器: ${devServerUrl}`)
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()

    let jsRpcUri = path.resolve(__dirname, 'public', 'js-rpc', 'index.html')
    if (isMacOS) {
      // mac上载入url时必须明确指明协议, 否则无法载入
      jsRpcUri = "file://" + jsRpcUri
    }
    jsRpcWindow.loadURL(jsRpcUri)
    jsRpcWindow.webContents.openDevTools()
  } else {
    // 线上地址
    // 构建出来后所有文件都位于dist目录中
    // mac上载入url时必须明确指明协议, 否则无法载入
    let webviewUri = path.resolve(__dirname, 'client', 'index.html')
    if (isMacOS) {
      // 针对macos的特殊hack, mac上只有这样mainWindow才能加载html
      mainWindow.loadFile('./dist/client/index.html')
    } else {
      mainWindow.loadFile(webviewUri)
    }

    // mainWindow.webContents.openDevTools()

    let jsRpcUri = path.resolve(__dirname, 'public', 'js-rpc', 'index.html')
    if (isMacOS) {
      // mac上载入url时必须明确指明协议, 否则无法载入
      jsRpcUri = "file://" + jsRpcUri
    }
    jsRpcWindow.loadURL(jsRpcUri)
    // jsRpcWindow.webContents.openDevTools()
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    // @ts-ignore
    mainWindow = null
    // 主窗口关闭时, 子窗口也要跟着关闭, 避免程序退不掉
    jsRpcWindow.close()
    // @ts-ignore
    jsRpcWindow = null
  })

  // 设置ua
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36'
    callback({ cancel: false, requestHeaders: details.requestHeaders })
  })
}

async function asyncUpdateCookie() {
  let cookieContent = ''
  let cookieList = await mainWindow.webContents.session.cookies.get({})
  for (let cookie of cookieList) {
    cookieContent = `${cookie.name}=${cookie.value};${cookieContent}`
  }
  // 将cookie更新到本地配置中
  let config = CommonUtil.getConfig()
  config.requestConfig.cookie = cookieContent
  fs.writeFileSync(PathConfig.configUri, JSON.stringify(config, null, 4))
  Logger.log(`重新载入cookie配置`)
  RequestConfig.reloadTaskConfig()
  return config
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', asyncCreateWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.

})

app.whenReady().then(() => {
  // 打开输出文件夹
  ipcMain.handle('open-output-dir', async () => {
    console.log("PathConfig.outputPath => ", PathConfig.outputPath)
    shell.showItemInFolder(PathConfig.outputPath)
    return
  })

  // 获取任务配置
  ipcMain.handle('get-common-config', () => {
    let config = CommonUtil.getConfig()
    return config
  })

  // 启动任务
  ipcMain.handle('start-customer-task', async (event, { config }: { config: Type_TaskConfig.Type_Task_Config }) => {
    if (isRunning) {
      return '目前尚有任务执行, 请稍后'
    }
    isRunning = true
    try {
      Logger.log('开始工作')

      // 将配置写入本地
      await asyncUpdateCookie()
      let oldConfig = CommonUtil.getConfig()
      config.requestConfig.cookie = oldConfig.requestConfig.cookie
      config.requestConfig.ua = oldConfig.requestConfig.ua
      CommonUtil.saveConfig(config)

      Logger.log(`开始执行任务`)

      // 此后操作均为异步操作, 无需等待

      Logger.log(`初始化运行环境`)
      await CommandRegistry.handle(['Init:Env'])

      Logger.log(`开始抓取数据`)
      await CommandRegistry.handle(['Fetch:Customer'])
      Logger.log(`开始生成电子书`)
      await CommandRegistry.handle(['Generate:Customer'])
      Logger.log(`所有任务执行完毕, 打开电子书文件夹 => `, PathConfig.outputPath)
      // 输出打开文件夹
      shell.showItemInFolder(PathConfig.outputPath)

      return 'success'
    } catch (error) {
      Logger.log('任务执行失败，未完成导出：', error instanceof Error ? error.message : String(error))
      return 'failed'
    } finally {
      isRunning = false
    }
  })


  ipcMain.handle('get-task-default-title', async (event, { taskId, taskType }: { taskType: any, taskId: string }) => {
    await asyncUpdateCookie()

    let title = await FrontTools.asyncGetTaskDefaultTitle(taskType, taskId)
    return title
  })

  /**
   * 获取数据库内的汇总信息
   */
  ipcMain.handle('get-db-summary-info', async () => {
    const summary = await MSummary.asyncGetSummaryInfo()
    return summary
  })

  /**
   * 获取数据库内的条目列表(数据浏览页), 支持分页/类型筛选/关键词搜索
   */
  ipcMain.handle(
    'get-db-record-list',
    async (event, { pageNo = 1, pageSize = 20, recordType = 'all', keyword = '' }) => {
      const supportTypeList = ['answer', 'pin', 'article']
      let targetTypeList = supportTypeList.includes(recordType) ? [recordType] : supportTypeList

      type Type_DbRecordItem = {
        recordType: string
        recordId: string
        title: string
        authorName: string
        sourceTitle: string
        voteupCount: number
        commentCount: number
        imgCount: number
        createdAt: number
      }

      // 统计内容中的图片数量
      let countImg = (content: any) => {
        let str = typeof content === 'string' ? content : JSON.stringify(content ?? '')
        return (str.match(/<img/g) || []).length
      }

      let allItemList: Type_DbRecordItem[] = []
      for (let type of targetTypeList) {
        let rowList = []
        if (type === 'answer') {
          rowList = await MAnswer.db.select(['answer_id', 'raw_json']).from(MAnswer.TABLE_NAME).catch(() => [])
        } else if (type === 'pin') {
          rowList = await MPin.db.select(['pin_id', 'raw_json']).from(MPin.TABLE_NAME).catch(() => [])
        } else {
          rowList = await MArticle.db.select(['article_id', 'raw_json']).from(MArticle.TABLE_NAME).catch(() => [])
        }
        for (let row of rowList) {
          let raw: any = {}
          try {
            raw = JSON.parse(row.raw_json || '{}')
          } catch (e) {
            raw = {}
          }
          if (type === 'answer') {
            allItemList.push({
              recordType: 'answer',
              recordId: row.answer_id,
              title: raw?.question?.title || `回答:${row.answer_id}`,
              authorName: raw?.author?.name || '',
              sourceTitle: raw?.question?.title || '',
              voteupCount: raw?.voteup_count ?? 0,
              commentCount: raw?.comment_count ?? 0,
              imgCount: countImg(raw?.content),
              createdAt: raw?.created_time ?? 0,
            })
          } else if (type === 'pin') {
            allItemList.push({
              recordType: 'pin',
              recordId: row.pin_id,
              title: raw?.excerpt_title || `想法:${row.pin_id}`,
              authorName: raw?.author?.name || '',
              sourceTitle: '想法',
              voteupCount: raw?.like_count ?? 0,
              commentCount: raw?.comment_count ?? 0,
              imgCount: countImg(raw?.content),
              createdAt: raw?.created ?? 0,
            })
          } else {
            allItemList.push({
              recordType: 'article',
              recordId: row.article_id,
              title: raw?.title || `文章:${row.article_id}`,
              authorName: raw?.author?.name || '',
              sourceTitle: raw?.column?.title || raw?.column?.name || '',
              voteupCount: raw?.voteup_count ?? 0,
              commentCount: raw?.comment_count ?? 0,
              imgCount: countImg(raw?.content),
              createdAt: raw?.created ?? 0,
            })
          }
        }
      }

      // 关键词过滤(标题/作者)
      let kw = String(keyword ?? '').trim()
      if (kw) {
        allItemList = allItemList.filter((item) => item.title.includes(kw) || item.authorName.includes(kw))
      }

      // 按创建时间倒序
      allItemList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

      let total = allItemList.length
      let start = (Math.max(1, pageNo) - 1) * pageSize
      let pageItemList = allItemList.slice(start, start + pageSize)

      // 组装导出状态
      let exportedMap = await MExportRecord.asyncGetExportedMap(
        pageItemList.map((item) => ({ recordType: item.recordType, recordId: item.recordId })),
      )
      let formatList = ['epub', 'html', 'markdown', 'pdf']
      let recordList = pageItemList.map((item) => {
        let exportedList = []
        for (let format of formatList) {
          let exportedAt = exportedMap.get(`${item.recordType}_${item.recordId}_${format}`)
          if (exportedAt) {
            exportedList.push({ format, exportedAt })
          }
        }
        return { ...item, exportedList }
      })

      return { total, recordList }
    },
  )

  /**
   * 导出数据浏览页勾选的条目为电子书
   */
  ipcMain.handle(
    'export-db-records',
    async (event, { recordList, formats, bookname = '', force = false }) => {
      if (isRunning) {
        return { status: 'busy', message: '目前尚有任务执行, 请稍后' }
      }
      if (!Array.isArray(recordList) || recordList.length === 0) {
        return { status: 'failed', message: '未选择要导出的条目' }
      }
      if (!Array.isArray(formats) || formats.length === 0) {
        return { status: 'failed', message: '未选择导出格式' }
      }

      isRunning = true
      try {
        // 老用户库升级兜底, 确保导出记录表存在
        await MExportRecord.asyncEnsureTable()

        // 计算(条目x格式)的导出冲突
        let exportedMap = await MExportRecord.asyncGetExportedMap(recordList)
        let conflictList = []
        for (let item of recordList) {
          for (let format of formats) {
            let exportedAt = exportedMap.get(`${item.recordType}_${item.recordId}_${format}`)
            if (exportedAt) {
              conflictList.push({ ...item, format, exportedAt })
            }
          }
        }
        if (conflictList.length > 0 && force === false) {
          return { status: 'needConfirm', conflictList }
        }

        // 复用任务配置中的图片质量与水印设置
        let config = CommonUtil.getConfig()
        let generateConfig = config.generateConfig || ({} as any)
        let finalBookname = String(bookname || '').trim() || `知乎数据导出_${dayjs().format('YYYY-MM-DD_HHmm')}`

        let cmd = new GenerateSelected()
        cmd.initTask({
          recordList,
          formats,
          bookname: finalBookname,
          imageQuilty: generateConfig.imageQuilty,
          watermark: generateConfig.comment || '',
        })
        await cmd.run()

        Logger.log(`选中数据导出完毕, 打开电子书文件夹 => `, PathConfig.outputPath)
        shell.showItemInFolder(PathConfig.outputPath)
        return { status: 'success' }
      } catch (error) {
        Logger.log('选中数据导出失败:', error instanceof Error ? error.message : String(error))
        return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
      } finally {
        isRunning = false
      }
    },
  )

  /**
   * 设置页: 本地存储占用统计
   */
  ipcMain.handle('get-storage-summary', async () => {
    let database = await StorageUtil.asyncGetDatabaseStats()
    let media = StorageUtil.asyncGetMediaStats()
    let output = StorageUtil.asyncGetOutputStats()
    return {
      database,
      media,
      output,
      totalSizeBytes: database.sizeBytes + media.sizeBytes + output.sizeBytes,
    }
  })

  /**
   * 设置页: 清理设置与过期数据预览
   */
  ipcMain.handle('get-clean-status', async () => {
    let setting = UserSetting.getSetting()
    let preview = await DataCleaner.asyncGetExpiredPreview(setting.dbRetainDays)
    return {
      setting,
      // 早于该时间(秒级时间戳)的数据将被清理
      threshold: preview.threshold,
      expiredCount: preview.expiredCount,
    }
  })

  /**
   * 设置页: 保存清理设置
   */
  ipcMain.handle(
    'save-clean-settings',
    async (event, { autoCleanEnabled, dbRetainDays }: { autoCleanEnabled: boolean; dbRetainDays: number }) => {
      let setting = UserSetting.getSetting()
      setting.autoCleanEnabled = autoCleanEnabled === true
      setting.dbRetainDays = UserSetting.normalizeRetainDays(dbRetainDays)
      UserSetting.saveSetting(setting)
      return setting
    },
  )

  /**
   * 设置页: 立即清理过期数据(不可撤销)
   */
  ipcMain.handle('run-clean-now', async () => {
    if (isRunning) {
      return { status: 'busy', message: '目前尚有任务执行, 请稍后' }
    }
    isRunning = true
    try {
      let setting = UserSetting.getSetting()
      await DataCleaner.asyncCleanExpiredData(setting.dbRetainDays)
      setting.lastCleanAt = Date.now()
      UserSetting.saveSetting(setting)
      Logger.log('[设置页] 手动清理执行完毕')
      return { status: 'success' }
    } catch (error) {
      Logger.log('[设置页] 手动清理失败:', error instanceof Error ? error.message : String(error))
      return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
    } finally {
      isRunning = false
    }
  })

  /**
   * 设置页: 打开本地目录
   */
  ipcMain.handle('open-storage-dir', async (event, { target }: { target: 'db' | 'media' | 'output' }) => {
    let dirUri = PathConfig.outputPath
    if (target === 'db') {
      dirUri = CommonConfig.db_uri
    } else if (target === 'media') {
      dirUri = PathConfig.imgCachePath
    }
    shell.showItemInFolder(dirUri)
    return true
  })

  // 清空所有登录信息
  ipcMain.handle('clear-all-session-storage', async () => {
    await session.defaultSession.clearCache()
    await session.defaultSession.clearStorageData()
    await session.defaultSession.clearHostResolverCache()

    return true
  })

  /**
   * 自动清理: 应用运行期间, 每小时检查一次; 距上次清理超过24小时且当前无任务时执行
   */
  const Auto_Clean_Check_Interval_ms = 60 * 60 * 1000
  const Auto_Clean_Min_Gap_ms = 24 * 60 * 60 * 1000
  const asyncTryAutoClean = async () => {
    let setting = UserSetting.getSetting()
    if (setting.autoCleanEnabled === false) {
      return
    }
    let lastCleanAt = setting.lastCleanAt ?? 0
    if (Date.now() - lastCleanAt < Auto_Clean_Min_Gap_ms) {
      return
    }
    if (isRunning) {
      return
    }
    isRunning = true
    try {
      Logger.log(`[AutoClean] 开始执行定时清理(保留${setting.dbRetainDays}天)`)
      await DataCleaner.asyncCleanExpiredData(setting.dbRetainDays)
      setting.lastCleanAt = Date.now()
      UserSetting.saveSetting(setting)
      Logger.log(`[AutoClean] 定时清理执行完毕`)
    } catch (error) {
      Logger.log(`[AutoClean] 定时清理失败:`, error instanceof Error ? error.message : String(error))
    } finally {
      isRunning = false
    }
  }
  // 启动后10秒检查一次(处理上次运行期间到期的清理), 之后每小时检查一次
  setTimeout(() => {
    asyncTryAutoClean()
  }, 10 * 1000)
  setInterval(() => {
    asyncTryAutoClean()
  }, Auto_Clean_Check_Interval_ms)


  /**
   * jsRpc任务管理器
   */
  let taskMap = new Map<
    string,
    {
      method: string
      paramList: any[]
      reslove: (value: any) => void
    }
  >()
  let totalTaskCounter = 0

  async function asyncJsRpcTriggerFunc({ method, paramList }: { method: string; paramList: any[] }) {
    totalTaskCounter++
    let id = `task-${totalTaskCounter}-${Math.random()}`
    let task = new Promise((reslove) => {
      jsRpcWindow.webContents.send(method, paramList, id)
      taskMap.set(id, {
        method,
        paramList,
        reslove: (value: any) => {
          reslove(value)
        },
      })
    })
    if (isDebug) {
      // Logger.log(
      //   `派发js-rpc请求, 任务id: ${id}, ${JSON.stringify(
      //     {
      //       method,
      //       paramList,
      //       id,
      //     },
      //     null,
      //     2,
      //   )}`,
      // )
    }
    let result = await task
    if (isDebug) {
      // Logger.log(`id:${id}的js-rpc请求完成`)
    }
    return result
  }
  // 使用js-rpc获取签名
  setBridgeFunc(asyncJsRpcTriggerFunc)

  // 工具函数, 用于在测试时手工触发js-rpc请求
  // ipcMain.handle('js-rpc-trigger', async (event, { method, paramList }) => {
  //   let result = await asyncJsRpcTriggerFunc({ method, paramList })
  //   return JSON.stringify(result)
  // })

  // 回收js-rpc调用响应值
  ipcMain.handle('js-rpc-response', async (event, { id, value }) => {
    // console.log('receive js-rpc-response => ', { id, value })
    if (taskMap.has(id)) {
      taskMap.get(id)?.reslove(value)
      taskMap.delete(id)
    } else {
      Logger.log(`未找到${id}对应的任务`)
    }

    return true
  })

  ipcMain.handle('zhihu-http-get', async (event, { url, params }: { url: string; params: { [key: string]: any } }) => {
    // 调用知乎的get请求
    // console.log('rawUrl => ', url)
    await asyncUpdateCookie()
    let res = await http
      .get(url, {
        params: params,
      })
      .catch((e) => {
        return {}
      })
    return res
  })
  ipcMain.handle('get-log-content', async (event) => {
    // 确保日志文件存在
    if (!fs.existsSync(PathConfig.runtimeLogUri)) {
      fs.writeFileSync(PathConfig.runtimeLogUri, '')
    }
    // 获取日志内容
    let content = fs.readFileSync(PathConfig.runtimeLogUri, 'utf-8')
    if (!!content === false) {
      // 避免为undefined
      content = ""
    }
    const logList = content?.split("\n") ?? []
    if (logList.length > 5000) {
      // 自动清理日志, 控制在2000条以下
      content = logList.slice(logList.length - 2000).join("\n")
      fs.writeFileSync(PathConfig.runtimeLogUri, content)
    }
    return content
  })
  ipcMain.handle('clear-log-content', async (event) => {
    // 清理日志内容
    fs.writeFileSync(PathConfig.runtimeLogUri, '')
    return ""
  })
  ipcMain.handle('open-devtools', async (event) => {
    // 打开调试面板
    mainWindow.webContents.openDevTools()
    return true
  })
  ipcMain.handle('open-js-rpc-window-devtools', async (event) => {
    // 打开jsRpcWindow调试面板
    jsRpcWindow.show()
    jsRpcWindow.webContents.openDevTools()
    return true
  })


  if (mainWindow === null) {
    console.log("开始创建窗口")
    asyncCreateWindow()
  }
})



// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
