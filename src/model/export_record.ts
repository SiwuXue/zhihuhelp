import Base from './base'

type Type_Export_Record = {
  record_type: 'answer' | 'pin' | 'article'
  record_id: string
  format: string
  exported_at: number
}

class ExportRecord extends Base {
  static TABLE_NAME = `Export_Record`
  static TABLE_COLUMN = [`record_type`, `record_id`, `format`, `exported_at`]

  static CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS \`Export_Record\` (
  \`record_type\` varchar(20) NOT NULL,
  \`record_id\` varchar(100) NOT NULL,
  \`format\` varchar(20) NOT NULL,
  \`exported_at\` int(11) NOT NULL,
  PRIMARY KEY (\`record_type\`, \`record_id\`, \`format\`)
)`

  /**
   * 确保导出记录表存在(老用户库升级兜底, 不依赖 Init:Env)
   */
  static async asyncEnsureTable(): Promise<void> {
    await this.rawClient.raw(this.CREATE_TABLE_SQL)
    return
  }

  /**
   * 查询条目的导出记录
   * @returns Map<`${record_type}_${record_id}_${format}`, exported_at>
   */
  static async asyncGetExportedMap(
    recordList: { recordType: string; recordId: string }[],
  ): Promise<Map<string, number>> {
    let exportedMap = new Map<string, number>()
    if (recordList.length === 0) {
      return exportedMap
    }
    // 去重
    let recordIdList = [...new Set(recordList.map((item) => item.recordId))]
    // sqlite3 的 select 变量数上限约为999, 超出会导致查询失败, 因此分批查询
    let batchSize = 500
    for (let index = 0; index < recordIdList.length; index += batchSize) {
      let batchIdList = recordIdList.slice(index, index + batchSize)
      let recordListInDb = await this.db
        .select(this.TABLE_COLUMN)
        .from(this.TABLE_NAME)
        .whereIn('record_id', batchIdList)
        .catch(() => {
          return []
        })
      for (let record of recordListInDb) {
        let key = `${record.record_type}_${record.record_id}_${record.format}`
        exportedMap.set(key, record.exported_at)
      }
    }
    return exportedMap
  }

  /**
   * 记录导出(覆盖同 条目+格式 的旧记录)
   */
  static async asyncReplaceExportRecord(item: {
    recordType: 'answer' | 'pin' | 'article'
    recordId: string
    format: string
    exportedAt: number
  }): Promise<void> {
    let record: Type_Export_Record = {
      record_type: item.recordType,
      record_id: item.recordId,
      format: item.format,
      exported_at: item.exportedAt,
    }
    await this.replaceInto(record, this.TABLE_NAME)
    return
  }
}

export default ExportRecord
