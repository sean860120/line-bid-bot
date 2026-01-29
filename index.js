const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// ===== LINE 設定 =====
const LINE_TOKEN = 'nia/AX0e2XvFzJM+PiC0SZ9JTuHKbUBu6KnDA1wImID+53CGwmc1qDEb+DWYJ1fQeVH/bo8QSeOiguFvNZZYPXUaYJzphLpsO+MfQqQIQLTOQrc/N+cSn+es9KzeRiMrzch9FQhSed8wgu4ASu8pWgdB04t89/1O/w1cDnyilFU=';

// ===== Google Sheets 設定 =====
const SPREADSHEET_ID = '1kp8Kdji875zamSm6UOs1WOPJAM51182WMDmeiZSYSJc';
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// ===== 出價正則 =====
const bidRegex = /^出價\s*([0-9]+)\s*$/;

// ===== 取得用戶名稱 =====
async function getUserName(userId) {
  try {
    const res = await axios.get(
      `https://api.line.me/v2/bot/profile/${userId}`,
      { headers: { 'Authorization': `Bearer ${LINE_TOKEN}` } }
    );
    return res.data.displayName;
  } catch (err) {
    console.error('❌ 取得用戶名稱失敗', err.response?.data || err.message);
    return userId;
  }
}

app.post('/', async (req, res) => {
  const event = req.body.events && req.body.events[0];
  if (!event || !event.replyToken || event.type !== 'message' || !event.message.text) {
    return res.status(200).end();
  }

  const userMessage = event.message.text.trim();
  const match = userMessage.match(bidRegex);
  if (!match) {
    return res.status(200).end();
  }

  const bidAmount = parseInt(match[1], 10);
  const userName = await getUserName(event.source.userId);

  let replyText = '';
  try {

    // =================【新增】F1 時間判斷（唯一新增的功能）=================
    const f1Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '工作表1!F1'
    });

    const f1Raw = f1Res.data.values?.[0]?.[0];

    // F1 沒值 → 不回覆
    if (!f1Raw) {
      return res.status(200).end();
    }

    let f1Time;

    // F1 是數字（Google Sheets 時間序號）
    if (typeof f1Raw === 'number') {
      f1Time = new Date((f1Raw - 25569) * 86400 * 1000);
    } 
    // F1 是字串時間
    else {
      f1Time = new Date(f1Raw.replace(/-/g, '/'));
    }

    const now = new Date();

    // 現在時間 >= F1 → 不回覆
    if (now.getTime() >= f1Time.getTime()) {
      return res.status(200).end();
    }
    // =================【新增結束】=================


    // 1️⃣ 讀取 D1 目前最高出價（以下全部原封不動）
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '工作表1!D1'
    });
    const currentMax = parseInt((getRes.data.values?.[0]?.[0] || '0'), 10);

    if (bidAmount <= currentMax) {
      replyText = '很抱歉，您的出價未高於當前最高出價';
    } else {
      // 高於目前最高出價，登錄 A/B
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!A:B',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[userName, bidAmount]] }
      });

      replyText = `已收到您的出價：${bidAmount} 元`;
    }

  } catch (err) {
    console.error('❌ Google Sheets error:', err);
    replyText = '系統發生錯誤，無法記錄出價';
  }

  // 回覆 LINE（完全沒動）
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: replyText }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_TOKEN}`
        }
      }
    );
  } catch (err) {
    console.error('❌ LINE reply error:', err.response?.data || err.message);
  }

  res.status(200).end();
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
