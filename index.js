const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// ===== LINE 設定 =====
const LINE_TOKEN = '你的 LINE TOKEN';

// ===== Google Sheets 設定 =====
const SPREADSHEET_ID = '1kp8Kdji875zamSm6UOs1WOPJAM51182WMDmeiZSYSJc';
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// ===== 出價格式 =====
const bidRegex = /^出價\s*([0-9]+)\s*$/;

// ===== 取得 LINE 名稱 =====
async function getUserName(userId) {
  try {
    const res = await axios.get(
      `https://api.line.me/v2/bot/profile/${userId}`,
      { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
    );
    return res.data.displayName;
  } catch (err) {
    console.error('❌ 取得 LINE 名稱失敗', err.message);
    return userId;
  }
}

app.post('/', async (req, res) => {
  const event = req.body.events?.[0];
  if (!event || event.type !== 'message' || !event.message.text) {
    return res.sendStatus(200);
  }

  const match = event.message.text.trim().match(bidRegex);
  if (!match) return res.sendStatus(200);

  const bidAmount = parseInt(match[1], 10);
  const userName = await getUserName(event.source.userId);

  let replyText = '';

  try {
    // 只讀 D1（最高出價）
    const d1Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '工作表1!D1'
    });
    const currentMax = parseInt(d1Res.data.values?.[0]?.[0] || '0', 10);

    if (bidAmount <= currentMax) {
      replyText = '很抱歉，您的出價未高於當前最高出價';
    } else {
      // 登錄 A/B
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
    console.error('❌ Sheets 錯誤', err);
    replyText = '系統發生錯誤，請稍後再試';
  }

  // 回覆 LINE
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: replyText }]
      },
      { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
    );
  } catch (err) {
    console.error('❌ LINE 回覆失敗', err.message);
  }

  res.sendStatus(200);
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
