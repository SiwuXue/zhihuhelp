import { Button, Card, Checkbox, InputNumber, message, Popconfirm, Tag, Typography } from 'antd'
import { useState } from 'react'
import * as Ahooks from 'ahooks'
import dayjs from 'dayjs'

import './index.less'

type Type_Dir_Stats = {
  exists: boolean
  sizeBytes: number
  fileCount: number
}

type Type_Storage_Summary = {
  database: Type_Dir_Stats & { answer: number; pin: number; article: number }
  media: Type_Dir_Stats
  output: Type_Dir_Stats
  totalSizeBytes: number
}

type Type_Clean_Status = {
  setting: {
    autoCleanEnabled: boolean
    dbRetainDays: number
    lastCleanAt: number | null
  }
  // 早于该时间(秒级时间戳)的数据将被清理
  threshold: number
  expiredCount: {
    answer: number
    pin: number
    article: number
  }
}

function formatSize(sizeBytes: number): string {
  if (!sizeBytes || sizeBytes <= 0) {
    return '0 B'
  }
  let kb = sizeBytes / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }
  let mb = kb / 1024
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`
  }
  return `${(mb / 1024).toFixed(2)} GB`
}

function formatTime(timestampMs: number): string {
  return dayjs(timestampMs).format('YYYY/M/D HH:mm:ss')
}

export default () => {
  let [storageSummary, setStorageSummary] = useState<Type_Storage_Summary | null>(null)
  let [cleanStatus, setCleanStatus] = useState<Type_Clean_Status | null>(null)
  let [statsLoading, setStatsLoading] = useState<boolean>(false)
  let [cleaning, setCleaning] = useState<boolean>(false)
  let [autoCleanEnabled, setAutoCleanEnabled] = useState<boolean>(false)
  let [dbRetainDays, setDbRetainDays] = useState<number>(30)
  let [saveState, setSaveState] = useState<'synced' | 'pending' | 'saving'>('synced')

  const handleFunc = {
    getStorageSummary: async () => {
      setStatsLoading(true)
      try {
        let res = await window.electronAPI['get-storage-summary']()
        setStorageSummary(res)
      } catch (e: any) {
        message.error(`获取数据占用失败:${e?.message ?? e}`)
      } finally {
        setStatsLoading(false)
      }
    },
    refreshCleanStatus: async () => {
      try {
        let res = await window.electronAPI['get-clean-status']()
        setCleanStatus(res)
      } catch (e: any) {
        message.error(`获取清理状态失败:${e?.message ?? e}`)
      }
    },
    refresh: () => {
      handleFunc.getStorageSummary()
      handleFunc.refreshCleanStatus()
    },
    // 设置变更后自动保存(防抖), 保存成功后刷新清理预览
    saveSetting: Ahooks.useDebounceFn(
      async (next: { autoCleanEnabled: boolean; dbRetainDays: number }) => {
        setSaveState('saving')
        try {
          let setting = await window.electronAPI['save-clean-settings'](next)
          // 主进程会对非法值做归一化, 同步回表单
          setAutoCleanEnabled(setting.autoCleanEnabled)
          setDbRetainDays(setting.dbRetainDays)
          setSaveState('synced')
          await handleFunc.refreshCleanStatus()
        } catch (e: any) {
          message.error(`保存设置失败:${e?.message ?? e}`)
          setSaveState('pending')
        }
      },
      { wait: 600 },
    ),
    onChangeAutoClean: (checked: boolean) => {
      setAutoCleanEnabled(checked)
      setSaveState('pending')
      handleFunc.saveSetting.run({ autoCleanEnabled: checked, dbRetainDays })
    },
    onChangeRetainDays: (value: number | null) => {
      let nextValue = value ?? 30
      setDbRetainDays(nextValue)
      setSaveState('pending')
      handleFunc.saveSetting.run({ autoCleanEnabled, dbRetainDays: nextValue })
    },
    openDir: async (target: 'db' | 'media' | 'output') => {
      await window.electronAPI['open-storage-dir']({ target })
    },
    runCleanNow: async () => {
      setCleaning(true)
      try {
        let res = await window.electronAPI['run-clean-now']()
        if (res.status === 'success') {
          message.success('清理完成')
          await handleFunc.refreshCleanStatus()
          await handleFunc.getStorageSummary()
        } else if (res.status === 'busy') {
          message.warning(res.message || '目前尚有任务执行, 请稍后')
        } else {
          message.error(res.message || `清理失败:${res.status}`)
        }
      } catch (e: any) {
        message.error(`清理失败:${e?.message ?? e}`)
      } finally {
        setCleaning(false)
      }
    },
  }

  // 初始化: 加载统计数据与清理状态, 并以已保存设置初始化表单
  Ahooks.useAsyncEffect(async () => {
    try {
      let res = await window.electronAPI['get-clean-status']()
      setCleanStatus(res)
      setAutoCleanEnabled(res.setting.autoCleanEnabled)
      setDbRetainDays(res.setting.dbRetainDays)
    } catch (e: any) {
      message.error(`获取清理状态失败:${e?.message ?? e}`)
    }
    handleFunc.getStorageSummary()
  }, [])

  let expiredCount = cleanStatus?.expiredCount ?? { answer: 0, pin: 0, article: 0 }
  let expiredTotal = expiredCount.answer + expiredCount.pin + expiredCount.article
  let thresholdText = cleanStatus?.threshold ? formatTime(cleanStatus.threshold * 1000) : '-'

  let saveStateTextMap = {
    synced: '已同步',
    pending: '编辑中, 稍后自动保存',
    saving: '保存中...',
  }

  return (
    <div className="settings_page_kj2h4f">
      <div className="page_header">
        <div className="page_header_left">
          <Typography.Text type="secondary">保存在你的设备上</Typography.Text>
          <Typography.Title level={3} style={{ margin: '6px 0' }}>
            设置
          </Typography.Title>
          <Typography.Text type="secondary">管理本地数据占用与自动清理规则, 所有配置都会持久保存。</Typography.Text>
        </div>
        <Tag className="total_tag">{formatSize(storageSummary?.totalSizeBytes ?? 0)} 占用</Tag>
      </div>

      <Card
        title={
          <span>
            <span className="card_no">01</span>本地数据占用
          </span>
        }
        extra={
          <Button size="small" loading={statsLoading} onClick={handleFunc.getStorageSummary}>
            重新统计
          </Button>
        }
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 12 }}>
          数据库、媒体文件与导出结果的当前体积
        </Typography.Text>
        <div className="stat_grid">
          <div className="stat_cell">
            <div className="stat_label">数据库</div>
            <div className="stat_value">{formatSize(storageSummary?.database.sizeBytes ?? 0)}</div>
            <div className="stat_sub">
              {storageSummary?.database.answer ?? 0} 篇回答 · {storageSummary?.database.pin ?? 0} 条想法 ·{' '}
              {storageSummary?.database.article ?? 0} 篇文章
            </div>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleFunc.openDir('db')}>
              打开所在文件夹
            </Button>
          </div>
          <div className="stat_cell">
            <div className="stat_label">媒体文件</div>
            <div className="stat_value">{formatSize(storageSummary?.media.sizeBytes ?? 0)}</div>
            <div className="stat_sub">{storageSummary?.media.fileCount ?? 0} 个文件</div>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleFunc.openDir('media')}>
              打开媒体目录
            </Button>
          </div>
          <div className="stat_cell">
            <div className="stat_label">导出结果</div>
            <div className="stat_value">{formatSize(storageSummary?.output.sizeBytes ?? 0)}</div>
            <div className="stat_sub">{storageSummary?.output.fileCount ?? 0} 个文件</div>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleFunc.openDir('output')}>
              打开导出目录
            </Button>
          </div>
          <div className="stat_cell stat_cell_total">
            <div className="stat_label">合计</div>
            <div className="stat_value">{formatSize(storageSummary?.totalSizeBytes ?? 0)}</div>
            <div className="stat_sub">清理时会移除记录与对应媒体文件</div>
          </div>
        </div>
      </Card>

      <Card
        title={
          <span>
            <span className="card_no">02</span>定时清理
          </span>
        }
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 12 }}>
          按周期自动删除超过保留时长的记录
        </Typography.Text>
        <div className="auto_clean_row">
          <Checkbox checked={autoCleanEnabled} onChange={(e) => handleFunc.onChangeAutoClean(e.target.checked)}>
            开启自动清理
          </Checkbox>
          <Typography.Text type="secondary">应用运行期间会在设定时间自动执行</Typography.Text>
        </div>
        <div className="retain_days_block">
          <div className="retain_days_label">数据保留时长(天)</div>
          <InputNumber
            min={1}
            max={3650}
            precision={0}
            value={dbRetainDays}
            style={{ width: 120 }}
            onChange={handleFunc.onChangeRetainDays}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            只保留最近 {dbRetainDays} 天内更新的记录
          </Typography.Text>
        </div>
        <div className="clean_status_block">
          <div className="status_line_main">
            {autoCleanEnabled
              ? '自动清理已开启, 超过保留时长的记录会在应用运行期间自动删除。'
              : '自动清理已关闭, 本地数据会一直保留。'}
          </div>
          <div className="status_line">
            下次清理:{autoCleanEnabled ? '运行期间自动排定' : '未排定'} · 上次清理:
            {cleanStatus?.setting.lastCleanAt ? formatTime(cleanStatus.setting.lastCleanAt) : '尚未清理过'}
          </div>
          <div className="status_line">
            按当前规则, 将有 {expiredCount.answer} 篇回答、{expiredCount.pin} 条想法、{expiredCount.article} 篇文章在{' '}
            {thresholdText} 之前的数据范围内被清理。
          </div>
          <div className="status_line">保存状态:{saveStateTextMap[saveState]}</div>
        </div>
      </Card>

      <Card
        title={
          <span>
            <span className="card_no">03</span>手动清理
          </span>
        }
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 12 }}>
          立即按当前保留时长删除过期数据, 操作不可撤销
        </Typography.Text>
        <div className="manual_clean_row">
          <Popconfirm
            title={`将删除 ${expiredTotal} 条过期记录, 操作不可撤销, 确定继续?`}
            okText="立即清理"
            cancelText="取消"
            onConfirm={handleFunc.runCleanNow}
            disabled={cleaning}
          >
            <Button danger loading={cleaning}>
              立即清理过期数据
            </Button>
          </Popconfirm>
          <Typography.Text type="secondary">
            将删除 {expiredCount.answer} 篇回答、{expiredCount.pin} 条想法、{expiredCount.article} 篇文章与本地媒体文件
          </Typography.Text>
        </div>
      </Card>
    </div>
  )
}
