import { Table, Tag, Typography } from 'antd'
import { ColumnsType } from 'antd/lib/table'
import { useSnapshot } from 'valtio'
import dayjs from 'dayjs'
import * as Consts from '../resource/const/index'
import * as Types from '../resource/type/index'

type Props = {
    store: Types.Status,
    isLoading: boolean,
    onPageChange: () => void,
}

/**
 * 数据条目列表(服务端分页 + 勾选)
 */
export default (props: Props) => {
    let { store } = props
    let snap = useSnapshot(store)

    const columnList: ColumnsType<any> = [
        {
            title: '标题 / 作者',
            ellipsis: true,
            render: (_, record: Types.Db_Record_Item) => {
                return (
                    <div>
                        <Typography.Text strong ellipsis={{ tooltip: record.title }} style={{ maxWidth: 360 }}>
                            {record.title}
                        </Typography.Text>
                        <div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {record.authorName || '-'}
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }} copyable={false}>
                                {record.recordId}
                            </Typography.Text>
                        </div>
                    </div>
                )
            },
        },
        {
            title: '来源',
            dataIndex: 'sourceTitle',
            ellipsis: true,
            render: (value: string, record: Types.Db_Record_Item) => {
                return value || Consts.Const_Record_Type_Label_Map[record.recordType] || '-'
            },
        },
        {
            title: '赞同',
            dataIndex: 'voteupCount',
            width: 80,
            align: 'center',
        },
        {
            title: '评论',
            dataIndex: 'commentCount',
            width: 80,
            align: 'center',
        },
        {
            title: '图片',
            dataIndex: 'imgCount',
            width: 70,
            align: 'center',
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 150,
            render: (value: number) => {
                return value ? dayjs(value * 1000).format('YYYY/MM/DD HH:mm') : '-'
            },
        },
        {
            title: '导出状态',
            dataIndex: 'exportedList',
            width: 220,
            render: (_, record: Types.Db_Record_Item) => {
                if (record.exportedList.length === 0) {
                    return <Tag>未导出</Tag>
                }
                return record.exportedList.map((item) => {
                    return (
                        <Tag key={item.format} color="blue">
                            {Consts.Const_Export_Format_Label_Map[item.format] || item.format}{' '}
                            {dayjs(item.exportedAt * 1000).format('YYYY/MM/DD')}
                        </Tag>
                    )
                })
            },
        },
    ]

    return (
        <Table
            size="middle"
            rowKey={(record) => `${record.recordType}_${record.recordId}`}
            columns={columnList}
            dataSource={snap.recordList as any}
            loading={props.isLoading}
            rowSelection={{
                selectedRowKeys: snap.selectedRowKeys as any,
                onChange: (keyList) => {
                    store.selectedRowKeys = [...keyList] as string[]
                },
            }}
            pagination={{
                current: snap.listQuery.pageNo,
                pageSize: snap.listQuery.pageSize,
                total: snap.total,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条`,
                onChange: (page, pageSize) => {
                    store.listQuery.pageNo = page
                    store.listQuery.pageSize = pageSize
                    props.onPageChange()
                },
            }}
        />
    )
}
