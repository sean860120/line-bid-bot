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
    const res = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
    });
    return res.data.displayName;
  } catch (err) {
    console.error('❌ 取得用戶名稱失敗', err.response?.data || err.message);
    return userId; // 失敗就用 userId
  }
}

app.post('/', async (req, res) => {
  const event = req.body.events && req.body.events[0];
  if (!event || !event.replyToken || event.type !== 'message' || !event.message.text) {
    return res.status(200).end();
  }

  const userMessage = event.message.text.trim();
  const userName = await getUserName(event.source.userId); // 使用顯示名稱
  const match = userMessage.match(bidRegex);
  let replyText = '';

  if (match) {
    const bidAmount = parseInt(match[1], 10);
    replyText = `已收到你的出價：${bidAmount} 元`;

    try {
      // 1️⃣ 追加新出價到 A/B 欄
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!A:B',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[userName, bidAmount]] }
      });

      // 2️⃣ 讀取所有出價
      const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!A:B'
      });
      const rows = getRes.data.values || [];

      // 3️⃣ 找出最高出價（相同取最先登記）
      let maxBid = -1;
      let maxUser = '';
      for (const row of rows) {
        const name = row[0];
        const bid = parseInt(row[1] || 0, 10);
        if (bid > maxBid) {
          maxBid = bid;
          maxUser = name;
        }
      }

      // 4️⃣ 更新 C1/D1
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!C1:D1',
        valueInputOption: 'RAW',
        requestBody: { values: [[maxUser, maxBid]] }
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
    console.error('❌ LINE reply error:', err.response?.data || err.message);
  }

  res.status(200).end();
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
