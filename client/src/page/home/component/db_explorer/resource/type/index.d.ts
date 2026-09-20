import * as Consts from '../const'

/**
 * 条目类型筛选值
 */
export type Record_Type_Filter = typeof Consts.Const_Record_Type_All | typeof Consts.Const_Record_Type_Answer | typeof Consts.Const_Record_Type_Pin | typeof Consts.Const_Record_Type_Article

/**
 * 数据条目类型
 */
export type Record_Type = typeof Consts.Const_Record_Type_Answer | typeof Consts.Const_Record_Type_Pin | typeof Consts.Const_Record_Type_Article

/**
 * 单条导出记录
 */
export type Exported_Item = {
    format: string,
    exportedAt: number,
}

/**
 * 数据库条目(数据浏览页展示用)
 */
export type Db_Record_Item = {
    recordType: Record_Type,
    recordId: string,
    title: string,
    authorName: string,
    sourceTitle: string,
    voteupCount: number,
    commentCount: number,
    imgCount: number,
    createdAt: number,
    exportedList: Exported_Item[],
}

/**
 * 导出请求的条目参数
 */
export type Export_Record_Param_Item = {
    recordType: Record_Type,
    recordId: string,
}

/**
 * export-db-records 接口响应
 */
export type Export_Res = {
    status: 'success' | 'failed' | 'busy' | 'needConfirm',
    message?: string,
    conflictList?: (Export_Record_Param_Item & {
        format: string,
        exportedAt: number,
    })[],
}

export type Status = {
    /**
     * 页面状态信息
     */
    forceUpdate: number,
    /**
     * 任务进度日志(导出中由主进程实时推送)
     */
    progressLog: {
        message: string,
        timestamp: number,
    }[],
    /**
     * 列表查询条件
     */
    listQuery: {
        pageNo: number,
        pageSize: number,
        recordType: Record_Type_Filter,
        keyword: string,
    },
    /**
     * 当前筛选条件下的总条数
     */
    total: number,
    /**
     * 当前页的记录列表
     */
    recordList: Db_Record_Item[],
    /**
     * 勾选的条目(rowKey 列表)
     */
    selectedRowKeys: string[],
    /**
     * 导出格式
     */
    exportFormats: string[],
    /**
     * 导出弹窗是否可见
     */
    exportModalOpen: boolean,
    /**
     * 是否正在导出
     */
    exporting: boolean,
    /**
     * 目前数据库中已有的类别数据
     */
    baseInfo: {
        count: {
            answer: number,
            article: number,
            pin: number,
            collection: number,
            question: number,
            author: number,
            topic: number,
            column: number,
        }
    },
}
