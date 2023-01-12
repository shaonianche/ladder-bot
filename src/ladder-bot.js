// @ts-nocheck
/**
     * 获取梯子每日流量并提醒
     * 1. 输入梯子名称、订阅链接，获取梯子订阅数据并返回
     * 2. 构造对象按照规则存储每日使用信息
     * 3. 将使用信息写入本地 json 文件中
     * 4. 根据 json 文件中的数据计算今日使用数据
    */

const https = require('https')
const fs = require('fs')

/**
 * 获取梯子订阅数据  返回：请求时间、请求头中的消息
 * @param {string} url
 */
async function getSubscriptionUserInfo(url) {
  try {
    const response = await new Promise((resolve, reject) => {
      https.request(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300)
          resolve(res)

        else
          reject(new Error(`URL请求错误: ${res.statusCode}`))
      }).end()
    })
    if ('subscription-userinfo' in response.headers) {
      const userInfo = response.headers['subscription-userinfo']
      const responseTime = Date.parse(response.headers.date) // 每次请求的时间戳
      const userSubInfo = formatSubscriptionString(userInfo) // 格式化流量使用数据
      userSubInfo.resTime = responseTime
      return userSubInfo
    }
    else {
      throw new Error('URL中未包含用户订阅数据')
    }
  }
  catch (error) {
    console.error(error.message)
  }
}

/**
 * 格式化订阅数据
 * @param {string} str
 */
function formatSubscriptionString(str) {
  // 使用正则表达式将字符串按照 ; 分割为数组
  const parts = str.split(/;\s*/)
  // 遍历数组，分别解析每个属性的名称和值
  const subscriptionDate = {}
  parts.forEach((part) => {
    // 使用正则表达式将属性按照 = 分割为数组
    const [key, value] = part.split(/=\s*/)
    // 将属性名称和值添加到结果对象中
    subscriptionDate[key] = value
  })
  return subscriptionDate
}

// 将 bytes 转换为 GB
function convertBytesToGB(bytes) {
  return (bytes / 1024 ** 3).toFixed(2)
}

// 格式化时间
function convertAndFormatDate(dateString, format) {
  const date = new Date(dateString)
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }
  switch (format) {
    case 'date':
      delete options.hour
      delete options.minute
      delete options.second
      break
    case 'time':
      delete options.year
      delete options.month
      delete options.day
      break
    default:
  }
  return date.toLocaleString('zh-CN', options)
}

/**
 * 计算当前日期到流量刷新日期时间差
 * @param {number} inputDate
 */
function daysUntilDate(inputDate) {
  if (inputDate < 0 || inputDate > 31)
    return '日期输入错误，必须大于 1 并且小于 31'

  const currentDate = new Date()
  if (currentDate.getDate() < inputDate) { // 输入日期大于当前日期
    const dateDiff = inputDate - currentDate.getDate()
    return dateDiff
  }
  else if (currentDate.getDate() === inputDate) {
    return 0
  }
  else {
    const daysInCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    const dateDiff = daysInCurrentMonth - currentDate.getDate() + inputDate
    return dateDiff
  }
}

function writeObjectToJsonFile(obj) {
  const jsonData = JSON.stringify(obj)
  const currentScriptDir = __dirname
  const fileName = `${currentScriptDir}/${obj.name}.json`
  const retrnUsedTraffic = {
    dayUsedTraffic: 0,
    yesUsedTraffic: 0,
  }

  // 判断文件是否存在
  if (fs.existsSync(fileName)) {
    // 读取文件内容
    const fileData = fs.readFileSync(fileName, 'utf-8')
    // 将文件内容转换为对象
    const data = JSON.parse(fileData)
    // 获取最后一天日期
    const objLastDailyDate = obj.dailyDate[0].today
    const dataLastDailyDate = data.dailyDate.slice(-1)[0].today
    // 如果最后一天日期相同，将新数据合并到原有数据
    if (objLastDailyDate === dataLastDailyDate) {
      // 今日使用流量 = 请求时的使用流量 - 当日第一条数据中的流量数
      obj.dailyDate[0].trafficUsageData[0].usedTraffic = (obj.dailyDate[0].trafficUsageData[0].usedTraffic - data.dailyDate.slice(-1)[0].trafficUsageData[0].usedTraffic).toFixed(2)

      data.dailyDate.slice(-1)[0].trafficUsageData = data.dailyDate.slice(-1)[0].trafficUsageData.concat(obj.dailyDate[0].trafficUsageData)
    }

    else {
      data.dailyDate = data.dailyDate.concat(obj.dailyDate)
      if (Array.isArray(data.dailyDate) && data.dailyDate.length >= 2) {
        retrnUsedTraffic.yesUsedTraffic = (data.dailyDate.slice(-1)[0].trafficUsageData[0].usedTraffic - data.dailyDate.slice(-2, -1)[0].trafficUsageData[0].usedTraffic).toFixed(2)
        return retrnUsedTraffic
      }
      else { return retrnUsedTraffic }
    }

    // 将对象转换为 json 字符串
    const newData = JSON.stringify(data)
    // 将数据写入文件
    fs.writeFileSync(fileName, newData)
    retrnUsedTraffic.dayUsedTraffic = obj.dailyDate[0].trafficUsageData[0].usedTraffic
    return retrnUsedTraffic
  }
  else {
    // 创建文件并写入数据
    fs.writeFileSync(fileName, jsonData)
    return retrnUsedTraffic
  }
}

async function sendMessage(apiKey, chatId, message) {
  // Create the payload for the request
  const payload = JSON.stringify({ chat_id: chatId, text: message })
  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${apiKey}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }
  return new Promise((resolve, reject) => {
    // Make the request to the Telegram API
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200)
        return reject(`Telegram response status code: ${res.statusCode}`)
      res.on('data', (data) => {
        const json = JSON.parse(data)
        if (!json.ok)
          return reject(`Telegram API error: ${json.description}`)
        resolve(json.result)
      })
    })
    req.on('error', err => reject(err))
    req.write(payload)
    req.end()
  })
}

/**
 * @param {string} name
 * @param {string} url
 * @param {string} apiKey
 * @param {string} chatId
 */
async function main(name, url, apiKey, chatId) {
  /**
     * 构造写入 json 文件的数据
     * {
     * 梯子名称：nfcloud
     * 到期时间：2022-05-02
     *    [
     *     请求日期：2022-01-01
     *     当日流量限制：10GB
     *     流量刷新时间：10 天
     *     流量使用情况：{
     *        时间：2022-01-01 10:10:19
     *        已使用流量：100G
     *        }
     *    ]
     * }
    */

  const ladders = {
    name: '',
    expire: '',
    dailyDate: [
      {
        today: '',
        threshold: '',
        refreshTime: Number,
        trafficUsageData: [{
          time: '',
          usedTraffic: '',
        }],
      },
    ],
  }

  getSubscriptionUserInfo(url).then((userSubInfo) => {
    if (userSubInfo) {
      const UnixExpire = userSubInfo.expire * 1000
      const expire = convertAndFormatDate(UnixExpire)
      const updateDay = new Date(UnixExpire).getDate()
      const refreshTime = daysUntilDate(updateDay)
      const today = convertAndFormatDate(userSubInfo.resTime, 'date')
      const time = convertAndFormatDate(userSubInfo.resTime)
      const usedTraffic = convertBytesToGB((userSubInfo.upload - 0) + (userSubInfo.download - 0))
      const threshold = convertBytesToGB(((userSubInfo.total - 0) - (userSubInfo.upload - 0) + (userSubInfo.download - 0)) / refreshTime)
      ladders.name = name
      ladders.expire = expire
      ladders.dailyDate[0].today = today
      ladders.dailyDate[0].threshold = threshold
      // @ts-expect-error
      ladders.dailyDate[0].refreshTime = refreshTime
      ladders.dailyDate[0].trafficUsageData[0].time = time
      ladders.dailyDate[0].trafficUsageData[0].usedTraffic = usedTraffic
      const retrnUsedTraffic = writeObjectToJsonFile(ladders)

      // 返回梯子名称、到期时间、剩余流量、今日流量上限、请求时间、已使用流量
      const message = {
        time: '',
        name: '',
        next: '',

        threshold: '',
        usedTraffic: '',
        yesUsedTraffic: '',
        space: '',

        unUsedTraffic: '',
        refreshTime: '',
        expire: '',

      }
      message.time = `${ladders.dailyDate[0].trafficUsageData[0].time}`
      message.name = `亲爱的 ${ladders.name} 用户`
      message.threshold = `今日流量上限：${ladders.dailyDate[0].threshold} GB`
      message.usedTraffic = `今日已使用流量：${retrnUsedTraffic.dayUsedTraffic} GB`
      message.yesUsedTraffic = `昨日共使用流量：${retrnUsedTraffic.yesUsedTraffic} GB`
      message.unUsedTraffic = `机场剩余流量：${convertBytesToGB((userSubInfo.total - 0) - (userSubInfo.upload - 0) - (userSubInfo.download - 0))} GB`
      message.refreshTime = `下次流量重置：${ladders.dailyDate[0].refreshTime} 天后`
      message.expire = `机场到期时间：${ladders.expire} `

      if (message.usedTraffic === '0') {
        return 0
      }
      else {
        let tgMessage = ''
        for (const key in message)
          tgMessage += (`${message[key]}\n`)

        sendMessage(apiKey, chatId, tgMessage)
          .then((response) => {
            console.log(`Message sent with ID: ${response.message_id}`)
          })
          .catch((error) => {
            console.error(error)
          })
      }
    }
  }).catch((error) => {
    console.error(error)
  })
}

function processInput(arg1, arg2, arg3, arg4) {
  const args = process.argv.slice(2)
  if (args.length < 4 || args.includes('')) {
    console.log('该脚本用于计算机场流量数据，它需要输入以下两个参数：')
    console.log('name: 机场名称')
    console.log('url: 订阅链接')
    console.log('apiKey: telegram api key')
    console.log('chatId: telegram 会话 id')
    return
  }
  const name = arg1
  const url = arg2
  const apiKey = arg3
  const chatId = arg4

  main(name, url, apiKey, chatId)
}

processInput(process.argv[2], process.argv[3], process.argv[4], process.argv[5])
