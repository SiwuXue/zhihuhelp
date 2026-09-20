import axios, { AxiosRequestConfig } from 'axios'
import CommonConfig from '../../config/common'
import RequestConfig from '../../config/request'
import logger from '../../library/logger'
import asyncGetZhihuEncrypt from '../../library/zhihu_encrypt/index'
import TaskControl from '../../library/task_control'
import querystring from 'querystring'
import lodash from 'lodash'
import URL from 'url'
import LruCache from "lru-cache"
import md5 from 'md5'

const Const_Headers_x_zse_93 = '101_3_3.0'

// 创建axios实例
const httpInstance = axios.create({
  timeout: CommonConfig.request_timeout_ms,
  // 忽略环境变量中的HTTP_PROXY/HTTPS_PROXY等系统代理, 知乎请求直连
  proxy: false,
  headers: {
    // 加上ua
    'User-Agent': RequestConfig.ua,
    cookie: RequestConfig.cookie,
  },
})

let lruCache = new LruCache({ max: 10000, ttl: 1000 * 3600 })

export function fixedEncodeURIComponent(str: string) {
  // 不需要对*进行转码
  return encodeURIComponent(str).replace(/[!'()]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16)
  })
}

export async function asyncGenerateZhihuExtendsHeader({
  url,
  params,
  cookie = RequestConfig.cookie,
  ua = RequestConfig.ua,
}: {
  /**
   * 任意url, 带不带query参数均可, 函数中会进行统一处理
   */
  url: string
  /**
   * query参数
   */
  params: {
    [key: string]: string
  }
  /**
   * 原始cookie内容, 会自动从中提取d_c0
   */
  cookie: string
  /**
   * 默认ua
   */
  ua: string
}) {
  // 从cookie中提取d_c0
  let cookie_item_list = cookie
    .split(';')
    .map((item: string) => item.trim())
    .filter((item: string) => item.startsWith('d_c0'))
  let raw_d_c0 = cookie_item_list?.[0] || ''
  let cookie_d_c0 = raw_d_c0.split('d_c0=')?.[1] || ''

  // 解析出url中的pathname和query参数
  let rawUrlObj = new URL.URL(url)
  let rawUrlPathname = rawUrlObj.pathname
  let rawUrlQuery: { [key: string]: any } = {}
  for (let key of rawUrlObj.searchParams.keys()) {
    rawUrlQuery[key] = rawUrlObj.searchParams.get(key)
  }

  // 合并params中带的query参数
  if (params) {
    rawUrlQuery = {
      ...rawUrlQuery,
      ...params
    }
  }

  // 生成最终的加密url
  let encrypt_url = rawUrlPathname
  // 补充query参数
  if ([...Object.keys(rawUrlQuery)].length > 0) {
    // 将config中的参数合并到url中, 以进行统一的签名运算
    encrypt_url = `${encrypt_url}?${querystring.stringify(rawUrlQuery, undefined, undefined, {
      encodeURIComponent: fixedEncodeURIComponent,
    })}`
  }

  // 执行加密
  let x_zst_96 = await asyncGetZhihuEncrypt({
    cookie_d_c0: cookie_d_c0,
    url: encrypt_url,
  })
  // 返回最终的header
  return {
    'User-Agent': ua,
    cookie: cookie,
    'x-zse-93': Const_Headers_x_zse_93,
    'x-zse-96': x_zst_96,
  }
}

export default class httpClient {
  static rawInstance = httpInstance
  /**
   * 原始request请求
   * @param params
   * @returns
   */
  static async rawRequest(...params: Parameters<typeof httpInstance.request>) {
    return httpInstance.request(...params)
  }
  /**
   * 封装get方法
   * @param url
   * @param config
   */
  static async get(url: string, config: AxiosRequestConfig = {}) {
    // 暂停检查点: 暂停期间挂起等待, 恢复后继续抓取(断点续传)
    await TaskControl.asyncWaitIfPaused()
    // 知乎有自己的query-encode方法, 因此不能使用axios自带的params合并方法
    // 否则会导致加密失败
    if (config?.params && Object.keys(config?.params ?? {}).length > 0) {
      url = `${url}?${querystring.stringify(config.params, undefined, undefined, {
        encodeURIComponent: fixedEncodeURIComponent
      })}`
      delete config.params
    }

    // 发送知乎请求时, 需要额外附带校验header, 否则报错
    let extendHeader = await asyncGenerateZhihuExtendsHeader({
      url: url,
      // 此时config.params的值已经被合入url, 所以此处不再需要传入param对象
      params: {},
      cookie: RequestConfig.cookie,
      ua: RequestConfig.ua,
    })

    config.headers = {
      ...config.headers,
      ...extendHeader,
    }
    const cacheKey = md5(JSON.stringify({
      url,
      // 重新登录账号后, 缓存作废
      cookie: RequestConfig.cookie,
      ua: RequestConfig.ua,
    }))
    if (lruCache.get(cacheKey) !== undefined) {
      console.log(`命中缓存, 直接返回结果, url=>${url}`)
      return lruCache.get(cacheKey)
    }

    const response = await httpInstance.get(url, config).catch((e) => {
      // 按错误类型分类提示, 避免把网络层问题误报成知乎签名/风控问题
      const errorCode: string = e?.code ?? ''
      const status: number | undefined = e?.response?.status
      // 网络层错误码: 连接被拒/超时/域名解析失败等, 与知乎接口本身无关
      const networkErrorCodeList = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNRESET',
        'EAI_AGAIN',
        'EPIPE',
        'EHOSTUNREACH',
        'ENETUNREACH',
        'ERR_INTERNET_DISCONNECTED',
      ]
      if (networkErrorCodeList.includes(errorCode)) {
        logger.log(
          `网络请求失败(网络层), url=>${url}, 错误码:${errorCode}, 请检查网络连接或代理设置后重试`,
        )
      } else if (status === 403) {
        logger.log(
          `网络请求失败(HTTP ${status}), url=>${url}, 两种可能: 1.知乎更换了接口签名算法, 知乎私信@姚泽源 更新代码 2. 您的账号可能因抓取频繁被知乎认为有风险, 在浏览器中访问知乎首页,输入验证码即可恢复`,
        )
      } else if (status !== undefined && status >= 400) {
        logger.log(`网络请求失败(HTTP ${status}), url=>${url}, 知乎接口返回错误状态码`)
      } else {
        logger.log(`网络请求失败, url=>${url}, 请稍后重试`)
      }
      logger.log(`错误内容=> message:${e.message}, stack=>${e.stack}`)
      return { data: [] }
    })
    const record = response.data || {}

    if (lodash.isEmpty(record) === false) {
      // 若响应值不为空, 则缓存响应结果, 保护知乎服务器
      lruCache.set(cacheKey, record)
    }
    return record
  }

  /**
   * axios封装的arraybuffer由于使用了stream, 重复次数多了之后会出现stream卡死的情况, 且不可恢复
   * 因此改用request封装图片下载请求
   * @param url
   */
  static async downloadImg(url: string): Promise<Buffer> {
    // 暂停检查点: 暂停期间挂起等待, 恢复后继续下载(断点续传)
    await TaskControl.asyncWaitIfPaused()
    // 图片 CDN 为静态资源, 网络抖动时自动重试, 最多 3 次
    const maxRetry = 3
    let lastError: any
    for (let retryIndex = 1; retryIndex <= maxRetry; retryIndex++) {
      try {
        let res = await httpInstance.get(url, {
          // 下载二进制文件时, 这里必须是arraybuffer, 否则会导致下载的文件损坏&无法识别
          responseType: 'arraybuffer',
          timeout: CommonConfig.request_timeout_ms,
        })
        if (Buffer.isBuffer(res.data) && res.data.length > 0) {
          return res.data
        }
        lastError = new Error('图片内容为空')
      } catch (e) {
        lastError = e as any
        if (retryIndex < maxRetry) {
          logger.log(`图片下载失败(第${retryIndex}/${maxRetry}次重试), url=>${url}, message:${(e as any).message}`)
        }
      }
      if (retryIndex < maxRetry) {
        // 重试前短暂等待, 避免集中重试打爆 CDN
        await new Promise((resolve) => setTimeout(resolve, 500 * retryIndex))
      }
    }
    logger.log(`图片下载失败, url=>${url}, message:${lastError?.message}, stack:${lastError?.stack}`)
    return Buffer.from('')
  }
}
