import { Button, Card, Input, message, Modal, Radio, Space, Tag, Typography } from 'antd'
import { useState, useRef, useEffect } from 'react'
import { createStore } from './state/index'
import { useSnapshot } from 'valtio'
import * as Ahooks from 'ahooks'

import * as Consts from './resource/const/index'
import * as Types from './resource/type/index'
import Toolbar from './component/Toolbar'
import RecordTable from './component/RecordTable'
import ExportModal from './component/ExportModal'

import './index.less'

export default () => {
  let [isLoading, setIsLoading] = useState<boolean>(false)

  // 仅在初始化时通过value创建一次, 后续直接通过useEffect更新store的值
  let refStore = useRef(createStore())
  const store = refStore.current
  let snap = useSnapshot(store)

  // 待导出的目标条目(点击导出按钮时确定)
  let refExportTarget = useRef<Types.Export_Record_Param_Item[]>([])

  // 订阅主进程任务进度推送, 导出中实时展示(最多保留 50 条)
  useEffect(() => {
    // 防御: 前端热更新后主进程未重启时, 旧preload未暴露该接口, 跳过订阅避免白屏
    if (typeof window.electronAPI['on-task-progress'] !== 'function') {
      return
    }
    let unsubscribe = window.electronAPI['on-task-progress']((data: { message: string; timestamp: number }) => {
      if (store.exporting === false) {
        return
      }
      store.progressLog = [...store.progressLog, data].slice(-50)
    })
    return unsubscribe
  }, [])

  const handleRecordFunc = {
    getBaseInfo: async () => {
      let summaryInfo = await window.electronAPI['get-db-summary-info']()
      store.baseInfo.count = summaryInfo
    },
    getRecordList: async () => {
      setIsLoading(true)
      try {
        let res = await window.electronAPI['get-db-record-list']({
          pageNo: store.listQuery.pageNo,
          pageSize: store.listQuery.pageSize,
          recordType: store.listQuery.recordType,
          keyword: store.listQuery.keyword,
        })
        store.recordList = res?.recordList ?? []
        store.total = res?.total ?? 0
        // 清理已不在当前结果中的勾选
        let validKeySet = new Set(store.recordList.map((item) => `${item.recordType}_${item.recordId}`))
        store.selectedRowKeys = store.selectedRowKeys.filter((key) => validKeySet.has(key))
      } catch (e: any) {
        message.error(`获取数据列表失败:${e?.message ?? e}`)
      } finally {
        setIsLoading(false)
      }
    },
    refresh: () => {
      handleRecordFunc.getBaseInfo()
      handleRecordFunc.getRecordList()
    },
    onFilterChange: () => {
      store.listQuery.pageNo = 1
      handleRecordFunc.getRecordList()
    },
    onSearch: (keyword: string) => {
      store.listQuery.keyword = keyword
      handleRecordFunc.onFilterChange()
    },
    clearSelection: () => {
      store.selectedRowKeys = []
    },
    /**
     * 确定导出目标条目: 已勾选时导出勾选条目, 否则导出当前筛选条件下的全部条目
     */
    getExportTargetList: async (): Promise<Types.Export_Record_Param_Item[]> => {
      if (store.selectedRowKeys.length > 0) {
        let keySet = new Set(store.selectedRowKeys)
        return store.recordList
          .filter((item) => keySet.has(`${item.recordType}_${item.recordId}`))
          .map((item) => ({ recordType: item.recordType, recordId: item.recordId }))
      }
      // 未勾选时, 拉取当前筛选条件下的全部条目
      let res = await window.electronAPI['get-db-record-list']({
        pageNo: 1,
        pageSize: Math.max(1, store.total),
        recordType: store.listQuery.recordType,
        keyword: store.listQuery.keyword,
      })
      return (res?.recordList ?? []).map((item: Types.Db_Record_Item) => ({
        recordType: item.recordType,
        recordId: item.recordId,
      }))
    },
    onExportClick: async () => {
      let targetList = await handleRecordFunc.getExportTargetList()
      if (targetList.length === 0) {
        message.warning('没有可导出的条目')
        return
      }
      refExportTarget.current = targetList
      store.exportModalOpen = true
    },
    doExport: async (bookname: string, force: boolean) => {
      let targetList = refExportTarget.current
      if (targetList.length === 0) {
        message.warning('没有可导出的条目')
        return
      }
      store.exporting = true
      store.progressLog = []
      try {
        let res: Types.Export_Res = await window.electronAPI['export-db-records']({
          recordList: targetList,
          formats: [...store.exportFormats],
          bookname,
          force,
        })
        if (res.status === 'needConfirm') {
          let conflictCount = res.conflictList?.length ?? 0
          Modal.confirm({
            title: '重新导出确认',
            content: `${conflictCount} 条内容已在所选格式下导出过, 是否重新导出? 重新导出将覆盖生成新的文件。`,
            okText: '重新导出',
            cancelText: '取消',
            onOk: () => {
              return handleRecordFunc.doExport(bookname, true)
            },
          })
          return
        }
        if (res.status === 'success') {
          message.success('导出成功, 已打开电子书所在文件夹')
          store.exportModalOpen = false
          handleRecordFunc.getRecordList()
        } else if (res.status === 'busy') {
          message.warning(res.message || '目前尚有任务执行, 请稍后')
        } else {
          message.error(res.message || `导出失败:${res.status}`)
        }
      } catch (e: any) {
        message.error(`导出失败:${e?.message ?? e}`)
      } finally {
        store.exporting = false
      }
    },
    onExportOk: ({ bookname }: { bookname: string }) => {
      handleRecordFunc.doExport(bookname, false)
    },
    onExportCancel: () => {
      if (store.exporting) {
        message.info('正在导出中, 请等待导出完成')
        return
      }
      store.exportModalOpen = false
    },
  }

  // 初始化时获取数据库数据
  Ahooks.useAsyncEffect(handleRecordFunc.refresh, [])

  let targetCount = snap.selectedRowKeys.length > 0 ? snap.selectedRowKeys.length : snap.total

  return (
    <div className="db_explorer_dawqxf">
      <div className="page_header">
        <Typography.Text type="secondary">保存在你的设备上</Typography.Text>
        <div className="page_title_row">
          <Typography.Title level={3} style={{ margin: 0 }}>
            数据浏览
          </Typography.Title>
          <Tag>回答 {snap.baseInfo.count.answer}</Tag>
          <Tag>想法 {snap.baseInfo.count.pin}</Tag>
          <Tag>文章 {snap.baseInfo.count.article}</Tag>
        </div>
        <Typography.Text type="secondary">
          浏览所有已保存的回答、想法与文章, 勾选后导出为电子书; 不勾选时按当前筛选条件导出。
        </Typography.Text>
      </div>

      <Card
        title="全部本地数据"
        style={{ width: '100%' }}
        extra={
          <Toolbar store={store} onExportClick={handleRecordFunc.onExportClick} onRefresh={handleRecordFunc.refresh} />
        }
      >
        <div className="filter_row">
          <Space>
            <Radio.Group
              value={snap.listQuery.recordType}
              onChange={(e) => {
                store.listQuery.recordType = e.target.value
                handleRecordFunc.onFilterChange()
              }}
              options={[
                { value: Consts.Const_Record_Type_All, label: '全部' },
                { value: Consts.Const_Record_Type_Answer, label: '回答' },
                { value: Consts.Const_Record_Type_Pin, label: '想法' },
                { value: Consts.Const_Record_Type_Article, label: '文章' },
              ]}
              optionType="button"
              buttonStyle="solid"
            />
            <Input.Search
              placeholder="搜索标题 / 作者"
              allowClear
              style={{ width: 240 }}
              onSearch={handleRecordFunc.onSearch}
            />
          </Space>
          <Space>
            <Typography.Text type="secondary">
              {snap.selectedRowKeys.length} 条已选 · 共 {snap.total} 条
            </Typography.Text>
            {snap.selectedRowKeys.length > 0 ? (
              <Button type="link" size="small" onClick={handleRecordFunc.clearSelection}>
                清空选择
              </Button>
            ) : null}
          </Space>
        </div>

        <RecordTable store={store} isLoading={isLoading} onPageChange={handleRecordFunc.getRecordList} />
      </Card>

      <ExportModal
        store={store}
        targetCount={targetCount}
        onOk={handleRecordFunc.onExportOk}
        onCancel={handleRecordFunc.onExportCancel}
      />
    </div>
  )
}
