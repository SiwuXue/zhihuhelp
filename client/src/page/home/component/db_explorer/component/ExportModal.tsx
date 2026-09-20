import { Alert, Button, Input, Modal, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { useSnapshot } from 'valtio'
import dayjs from 'dayjs'
import * as Consts from '../resource/const/index'
import * as Types from '../resource/type/index'

type Props = {
    store: Types.Status,
    /**
     * 待导出条目数
     */
    targetCount: number,
    onOk: (param: { bookname: string }) => void,
    onCancel: () => void,
}

/**
 * 导出确认弹窗: 书名输入 + 格式回显
 */
export default (props: Props) => {
    let { store } = props
    let snap = useSnapshot(store)
    let [bookname, setBookname] = useState<string>('')
    let [isPaused, setIsPaused] = useState<boolean>(false)

    // 弹窗打开时, 重置书名为默认值, 并同步当前任务暂停状态
    useEffect(() => {
        if (snap.exportModalOpen) {
            setBookname(`知乎数据导出_${dayjs().format('YYYY-MM-DD_HHmm')}`)
            // 防御: 前端热更新后主进程未重启时接口不存在
            if (typeof window.electronAPI['get-task-status'] === 'function') {
                window.electronAPI['get-task-status']().then((status: { isRunning: boolean; isPaused: boolean }) => {
                    setIsPaused(status?.isPaused === true)
                })
            }
        }
    }, [snap.exportModalOpen])

    // 暂停/继续导出任务
    let asyncTogglePause = async () => {
        if (typeof window.electronAPI['pause-task'] !== 'function') {
            message.warning('当前应用是旧版本主进程, 请等任务结束后重启应用(npm run start)再使用暂停功能')
            return
        }
        try {
            let status = isPaused
                ? await window.electronAPI['resume-task']()
                : await window.electronAPI['pause-task']()
            setIsPaused(status?.isPaused === true)
        } catch (e: any) {
            message.error(`操作失败:${e?.message ?? e}`)
        }
    }

    let formatLabelList = snap.exportFormats.map((format) => Consts.Const_Export_Format_Label_Map[format] || format)

    return (
        <Modal
            title="导出电子书"
            open={snap.exportModalOpen}
            confirmLoading={snap.exporting}
            okText="开始导出"
            cancelText="取消"
            onOk={() => {
                props.onOk({ bookname })
            }}
            onCancel={props.onCancel}
        >
            <Typography.Paragraph type="secondary">
                将勾选/筛选出的 {props.targetCount} 条内容合并为一本电子书, 每条内容为一个章节。
            </Typography.Paragraph>
            <div style={{ marginBottom: 8 }}>书名</div>
            <Input
                value={bookname}
                placeholder="请输入书名"
                onChange={(e) => {
                    setBookname(e.target.value)
                }}
            />
            <div style={{ marginTop: 16, marginBottom: 8 }}>导出格式</div>
            <div>{formatLabelList.join(' / ') || '-'}</div>
            {snap.exporting && snap.progressLog.length > 0 ? (
                <div className="export_progress_block">
                    {snap.progressLog.slice(-8).map((item, idx) => (
                        <div key={`${item.timestamp}-${idx}`} className="export_progress_line">
                            {item.message}
                        </div>
                    ))}
                </div>
            ) : (
                <Alert
                    style={{ marginTop: 16 }}
                    type="info"
                    showIcon
                    message="导出耗时取决于内容量与图片数量, 开始后将在下方实时显示进度。"
                />
            )}
            {snap.exporting ? (
                <div style={{ marginTop: 12 }}>
                    {isPaused ? (
                        <Button type="primary" onClick={asyncTogglePause}>
                            继续导出
                        </Button>
                    ) : (
                        <Button danger onClick={asyncTogglePause}>
                            暂停导出
                        </Button>
                    )}
                    <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                        暂停后可随时继续, 已抓取的进度不会丢失。
                    </Typography.Text>
                </div>
            ) : null}
        </Modal>
    )
}
