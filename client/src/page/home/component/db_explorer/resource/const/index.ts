import * as Types from '../type'

// 条目类型筛选值
export const Const_Record_Type_All = 'all' as const
export const Const_Record_Type_Answer = 'answer' as const
export const Const_Record_Type_Pin = 'pin' as const
export const Const_Record_Type_Article = 'article' as const

/**
 * 条目类型中文名
 */
export const Const_Record_Type_Label_Map: Record<string, string> = {
    [Const_Record_Type_Answer]: '回答',
    [Const_Record_Type_Pin]: '想法',
    [Const_Record_Type_Article]: '文章',
}

/**
 * 导出格式中文名
 */
export const Const_Export_Format_Label_Map: Record<string, string> = {
    epub: 'EPUB',
    html: 'HTML',
    markdown: 'Markdown',
    pdf: 'PDF',
}

/**
 * 分页大小
 */
export const Const_Page_Size = 20

export const Default_Status: Types.Status = {
    forceUpdate: 0,
    listQuery: {
        pageNo: 1,
        pageSize: Const_Page_Size,
        recordType: Const_Record_Type_All,
        keyword: '',
    },
    total: 0,
    recordList: [],
    selectedRowKeys: [],
    exportFormats: ['epub'],
    exportModalOpen: false,
    exporting: false,
    baseInfo: {
        count: {
            answer: 0,
            article: 0,
            pin: 0,
            author: 0,
            question: 0,
            collection: 0,
            column: 0,
            topic: 0,
        },
    },
}
