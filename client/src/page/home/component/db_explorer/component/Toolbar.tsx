import { Button, Select, Space } from 'antd'
import { useSnapshot } from 'valtio'
import * as Consts_Task_Config from '~/src/resource/const/task_config'
import * as Consts from '../resource/const/index'
import * as Types from '../resource/type/index'

type Props = {
    store: Types.Status,
    onExportClick: () => void,
    onRefresh: () => void,
}

/**
 * 工具栏: 导出格式选择 + 导出按钮 + 刷新按钮
 */
export default (props: Props) => {
    let { store } = props
    let snap = useSnapshot(store)

    const formatOptionList = [
        { value: Consts_Task_Config.Const_Export_Format_EPUB, label: 'EPUB' },
        { value: Consts_Task_Config.Const_Export_Format_HTML, label: 'HTML' },
        { value: Consts_Task_Config.Const_Export_Format_Markdown, label: 'Markdown' },
        { value: Consts_Task_Config.Const_Export_Format_PDF, label: 'PDF' },
    ]

    let selectedCount = snap.selectedRowKeys.length
    let buttonLabel = selectedCount > 0 ? `导出选中 ${selectedCount} 条` : `导出全部 ${snap.total} 条`
    let isExportDisabled = selectedCount === 0 && snap.total === 0

    return (
        <Space>
            <Select
                mode="multiple"
                style={{ minWidth: 200 }}
                placeholder="选择导出格式"
                value={snap.exportFormats as string[]}
                onChange={(valueList) => {
                    store.exportFormats = valueList
                }}
                options={formatOptionList}
            />
            <Button type="primary" disabled={isExportDisabled} loading={snap.exporting} onClick={props.onExportClick}>
                {buttonLabel}
            </Button>
            <Button onClick={props.onRefresh}>刷新</Button>
        </Space>
    )
}
