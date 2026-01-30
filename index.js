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

// ===== Apps Script Web App URL =====
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbz_taMr9CcEy3CYknu3dysnisIwmm1xqDEFrHXYtTTEhb1spkq9EOo7UCxr34cbaXRe/exec';

// ===== 出價正則 =====
const bidRegex = /^出價\s*([0-9]+)\s*元?$/;

// ===== 取得用戶名稱 =====
async function getUserName(userId) {
  try {
    const res = await axios.get(
      `https://api.line.me/v2/bot/profile/${userId}`,
      { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
    );
    return res.data.displayName;
  } catch (err) {
    console.error('❌ 取得用戶名稱失敗', err.response?.data || err.message);
    return userId;
  }
}

// ===== 呼叫 Apps Script 執行 checkF1 =====
async function triggerCheckF1() {
  try {
    await axios.post(
      APPS_SCRIPT_URL,
      { action: 'checkF1' },
      { timeout: 1500 }
    );
  } catch (err) {
    console.error('❌ triggerCheckF1 failed', err.message);
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
    // ===== F1 時間判斷 =====
    const f1Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '工作表1!F1'
    });

    const f1Raw = f1Res.data.values?.[0]?.[0];

    if (!f1Raw) {
      return res.status(200).end();
    }

    const f1Time = new Date(f1Raw.replace(/-/g, '/'));
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);

    if (now.getTime() >= f1Time.getTime()) {
      return res.status(200).end();
    }
    // ===== F1 判斷結束 =====

    // ===== 取得目前最高出價 =====
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '工作表1!D1'
    });
    const currentMax = parseInt((getRes.data.values?.[0]?.[0] || '0'), 10);

    if (bidAmount <= currentMax) {
      replyText = `很抱歉，您未高於最高出價\n目前最高出價為: ${currentMax}元`;
    } else {
      // ===== 寫入 A:B =====
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!A:B',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[userName, bidAmount]] }
      });

      // ===== 新增：通知 Apps Script 立刻 checkF1 =====
      triggerCheckF1(); // 不 await，避免阻塞 LINE 回覆

      replyText = `已收到您的出價：${bidAmount} 元`;
    }

  } catch (err) {
    console.error('❌ Google Sheets error:', err);
    replyText = '系統發生錯誤，無法記錄出價';
  }

  // ===== 回覆 LINE =====
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
          Authorization: `Bearer ${LINE_TOKEN}`
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
