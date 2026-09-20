import { Alert, Input, Modal, Typography } from 'antd'
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

    // 弹窗打开时, 重置书名为默认值
    useEffect(() => {
        if (snap.exportModalOpen) {
            setBookname(`知乎数据导出_${dayjs().format('YYYY-MM-DD_HHmm')}`)
        }
    }, [snap.exportModalOpen])

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
        </Modal>
    )
}
