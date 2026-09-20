import { Modal, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { ExclamationCircleFilled } from '@ant-design/icons'

import './index.less'

// 关于弹窗展示的链接信息(项目主页/作者博客/爱发电赞助)
const Link_List = [
  {
    label: '项目主页',
    uri: 'https://github.com/SiwuXue/zhihuhelp',
    note: '源码、更新日志与问题反馈',
  },
  {
    label: '作者博客',
    uri: 'https://wuyiuou.top',
    note: '开发笔记与工具分享',
  },
  {
    label: '爱发电赞助',
    uri: 'https://afdian.com/a/siwuxie66',
    note: '支持这个小工具继续更新',
  },
]

export default (props: { open: boolean; onClose: () => void }) => {
  let { open, onClose } = props
  let [version, setVersion] = useState<string>('')

  // 弹窗打开时加载应用版本号
  useEffect(() => {
    if (open === false) {
      return
    }
    window.electronAPI['get-app-version']().then((v: string) => {
      setVersion(v)
    })
  }, [open])

  // 用系统默认浏览器打开外部链接
  let asyncOpenLink = async (uri: string) => {
    if (typeof window.electronAPI['open-external'] !== 'function') {
      message.warning('当前应用是旧版本主进程, 请重启应用(npm run start)后使用该功能')
      return
    }
    try {
      let success = await window.electronAPI['open-external']({ uri })
      if (success === false) {
        message.error('无法打开链接, 请手动复制到浏览器')
      }
    } catch (e: any) {
      message.error(`无法打开链接:${e?.message ?? e}, 请手动复制到浏览器`)
    }
  }

  return (
    <Modal
      title="关于 知乎助手"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose={false}
    >
      <div className="about_component">
        <div className="about_summary">
          <strong>知乎助手 {version}</strong>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            把知乎内容收藏到本地的小工具。抓取、浏览与导出都在你自己的电脑上完成, 数据不上传。
          </Typography.Paragraph>
        </div>
        <ul className="about_links">
          {Link_List.map((link) => (
            <li key={link.uri}>
              <button className="about_link" onClick={() => asyncOpenLink(link.uri)}>
                <span className="about_link_main">
                  <span className="about_link_label">{link.label}</span>
                  <span className="about_link_url">{link.uri}</span>
                </span>
                <span className="about_link_note">{link.note}</span>
                <span className="about_link_icon">↗</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="about_hint">
          <ExclamationCircleFilled style={{ marginRight: 6 }} />
          链接会用系统默认浏览器打开。本工具仅供个人备份使用, 请遵守平台规则与相关法律法规。
        </div>
      </div>
    </Modal>
  )
}
