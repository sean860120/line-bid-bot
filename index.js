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

app.post('/', async (req, res) => {
  const event = req.body.events && req.body.events[0];
  if (!event || !event.replyToken || event.type !== 'message' || !event.message.text) {
    return res.status(200).end();
  }

  const userMessage = event.message.text.trim();
  const userId = event.source.userId;
  const match = userMessage.match(bidRegex);
  let replyText = '';

  if (match) {
    const bidAmount = parseInt(match[1], 10);
    replyText = `已收到你的出價：${bidAmount} 元`;

    try {
      // 取得 A/B 欄
      const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!A:B'
      });
      const rows = getRes.data.values || [];

      // 檢查是否已有用戶紀錄
      let found = false;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === userId) {
          rows[i][1] = bidAmount;
          found = true;
          break;
        }
      }
      if (!found) {
        rows.push([userId, bidAmount]);
      }

      // 更新 A/B 欄
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!A:B',
        valueInputOption: 'RAW',
        requestBody: { values: rows }
      });

      // 計算最高出價
      const maxBid = rows.reduce((max, r) => Math.max(max, parseInt(r[1] || 0, 10)), 0);

      // 更新 C1
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!C1',
        valueInputOption: 'RAW',
        requestBody: { values: [[maxBid]] }
      });

    } catch (err) {
      console.error('❌ Google Sheets error:', err);
      replyText = '系統發生錯誤，無法記錄出價';
    }

  } else {
    replyText = '請輸入正確格式：出價 <金額>';
  }

  // 回覆 LINE
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      { replyToken: event.replyToken, messages: [{ type: 'text', text: replyText }] },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` } }
    );
  } catch (err) {
    console.error('❌ LINE reply error:', err.response ? err.response.data : err.message);
  }

  res.status(200).end();
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
