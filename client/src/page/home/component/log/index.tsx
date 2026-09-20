import { Button, List, Typography, Card, Row, Divider, Space, Col, Checkbox, message } from 'antd'
import { useState, useContext, useEffect } from 'react'
import VirtualList from 'rc-virtual-list'
import * as Ahooks from 'ahooks'

import './index.less'

type Type_Log_Item = {
  lineNo: number
  content: string
}

export default () => {
  const [isAutoFresh, setIsAutoFresh] = useState<boolean>(true)
  const [logList, setLogList] = useState<Type_Log_Item[]>([])
  const [taskStatus, setTaskStatus] = useState<{ isRunning: boolean; isPaused: boolean }>({
    isRunning: false,
    isPaused: false,
  })
  const ContainerHeight = 768
  const asyncFetchLogList = async () => {
    let content = await window.electronAPI['get-log-content']()
    // console.log('content', content)
    // 暴力避免content为空字符串
    if (typeof content?.split !== 'function') {
      content = ''
    }
    const rawLogList = content?.split('\n') ?? []
    const logList: Type_Log_Item[] = []
    let counter = 0
    for (let item of rawLogList) {
      counter++
      logList.push({
        lineNo: counter,
        content: item,
      })
    }
    setLogList(logList)
    let containerEle = document.querySelector('.rc-virtual-list-holder')
    if (containerEle?.scrollTop !== undefined) {
      containerEle.scrollTop = containerEle.scrollHeight ?? 1000000000
    }
  }
  const asyncClearLogList = async () => {
    await window.electronAPI['clear-log-content']()
    await asyncFetchLogList()
  }
  // 每2秒同步任务执行状态(是否在跑/是否已暂停), 用于渲染暂停/继续按钮
  Ahooks.useInterval(async () => {
    try {
      // 防御: 前端热更新后主进程未重启时接口不存在, 跳过以避免报错
      if (typeof window.electronAPI['get-task-status'] !== 'function') {
        return
      }
      let status = await window.electronAPI['get-task-status']()
      setTaskStatus({ isRunning: status.isRunning === true, isPaused: status.isPaused === true })
    } catch (e) {
      // 状态获取失败不影响日志刷新
    }
  }, 2 * 1000)

  // 暂停/继续任务
  const asyncTogglePause = async () => {
    if (typeof window.electronAPI['pause-task'] !== 'function') {
      message.warning('当前应用是旧版本主进程, 请等任务结束后重启应用(npm run start)再使用暂停功能')
      return
    }
    let status = taskStatus.isPaused
      ? await window.electronAPI['resume-task']()
      : await window.electronAPI['pause-task']()
    setTaskStatus((prev) => ({ ...prev, isPaused: status?.isPaused === true }))
  }

  Ahooks.useInterval(async () => {
    if (isAutoFresh) {
      // 若自动刷新, 则每2秒刷新一次
      await asyncFetchLogList()
    }
  }, 2 * 1000)

  Ahooks.useAsyncEffect(async () => {
    await asyncFetchLogList()
  }, [])

  return (
    <div className="log-panel-4d80654">
      <Card>
        <List>
          <VirtualList data={logList} height={ContainerHeight} itemHeight={20} itemKey="lineNo">
            {(item: Type_Log_Item) => (
              <List.Item key={item.lineNo}>
                <pre>{item.content}</pre>
              </List.Item>
            )}
          </VirtualList>
        </List>
      </Card>
      <div className="action-bar">
        <Row>
          <Col>
            <Checkbox
              checked={isAutoFresh}
              onChange={(e) => {
                setIsAutoFresh(e.target.checked)
              }}
            >
              自动刷新
            </Checkbox>
          </Col>
          <Col offset={6}>
            {taskStatus.isRunning ? (
              taskStatus.isPaused ? (
                <Button type="primary" onClick={asyncTogglePause}>
                  继续任务
                </Button>
              ) : (
                <Button type="default" danger onClick={asyncTogglePause}>
                  暂停任务
                </Button>
              )
            ) : null}
            {taskStatus.isRunning ? <Divider type="vertical"></Divider> : null}
            <Button onClick={asyncFetchLogList}>刷新日志</Button>
            <Divider type="vertical"></Divider>
            <Button
              type="primary"
              htmlType="button"
              onClick={async () => {
                await window.electronAPI['open-output-dir']()
              }}
            >
              打开电子书输出目录
            </Button>
            <Divider type="vertical"></Divider>
            <Button danger onClick={asyncClearLogList}>
              清空日志
            </Button>
          </Col>
        </Row>
      </div>
    </div>
  )
}
