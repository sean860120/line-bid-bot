import express from 'express'
import { Client } from '@line/bot-sdk'
import { google } from 'googleapis'

/* ===== LINE 設定 ===== */
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
}
const client = new Client(config)

/* ===== Google Sheets 設定 ===== */
const SPREADSHEET_ID = '1kp8Kdji875zamSm6UOs1WOPJAM51182WMDmeiZSYSJc'
const SHEET_NAME = '工作表1'

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

/* ===== 工具函式 ===== */
function nowTW() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
}

function parseBid(text) {
  const match = text.match(/^出價\s*(\d+)$/)
  return match ? Number(match[1]) : null
}

/* ===== Server ===== */
const app = express()

app.post('/webhook', express.json(), async (req, res) => {
  try {
    const event = req.body.events?.[0]
    if (!event || event.type !== 'message' || event.message.type !== 'text') {
      return res.sendStatus(200)
    }

    const bidAmount = parseBid(event.message.text)
    if (!bidAmount) return res.sendStatus(200)

    /* === 讀取試算表 === */
    const sheet = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:E`
    })

    const rows = sheet.data.values || []

    const e1 = rows[0]?.[4]
    if (!e1) return res.sendStatus(200) // 沒有活動

    let endTime = new Date(e1 + '+08:00')
    const now = nowTW()

    if (now >= endTime) return res.sendStatus(200) // 已截止

    const currentHighest = Number(rows[0]?.[3] || 0)

    if (bidAmount <= currentHighest) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '很抱歉，您的出價未高於當前最高出價。'
      })
      return res.sendStatus(200)
    }

    /* === 取得使用者名稱 === */
    let displayName = event.source.userId
    try {
      const profile = await client.getProfile(event.source.userId)
      displayName = profile.displayName
    } catch {}

    /* === 新增資料 === */
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:B`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[displayName, bidAmount]]
      }
    })

    /* === 更新最高價 === */
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!C1:D1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[displayName, bidAmount]]
      }
    })

    /* === 延長時間判斷 === */
    const diffMs = endTime - now
    if (diffMs <= 3 * 60 * 1000) {
      const newEnd = new Date(now.getTime() + 3 * 60 * 1000)
      const yyyy = newEnd.getFullYear()
      const mm = String(newEnd.getMonth() + 1).padStart(2, '0')
      const dd = String(newEnd.getDate()).padStart(2, '0')
      const hh = String(newEnd.getHours()).padStart(2, '0')
      const min = String(newEnd.getMinutes()).padStart(2, '0')

      const newTimeStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!E1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newTimeStr]]
        }
      })
    }

    /* === 回覆成功 === */
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `已收到您的出價：${bidAmount} 元`
    })

    res.sendStatus(200)
  } catch (err) {
    console.error(err)
    res.sendStatus(200)
  }
})

app.get('/', (_, res) => res.send('OK'))

app.listen(process.env.PORT || 3000)
