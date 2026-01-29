const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// ===== LINE =====
const LINE_TOKEN = '你的 LINE Channel Access Token';

// ===== Google Sheets =====
const SPREADSHEET_ID = '1kp8Kdji875zamSm6UOs1WOPJAM51182WMDmeiZSYSJc';
const SHEET_NAME = '工作表1';

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ===== 出價格式 =====
// 出價500 / 出價 500 / 出價    500
const bidRegex = /^出價\s*([0-9]+)\s*$/;

// ===== 取得 LINE 顯示名稱 =====
async function getUserName(userId) {
  try {
    const res = await axios.get(
      `https://api.line.me/v2/bot/profile/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
        },
      }
    );
    return res.data.displayName || userId;
  } catch (err) {
    console.log('取得 LINE 名稱失敗，改用 userId');
    return userId;
  }
}

app.post('/', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message' || !event.message.text) {
      return res.sendStatus(200);
    }

    const text = event.message.text.trim();
    const match = text.match(bidRegex);

    // 非出價格式 → 完全不回
    if (!match) return res.sendStatus(200);

    const bid = parseInt(match[1], 10);

    // ===== 讀目前最高出價（由試算表算好，例如 D1）=====
    const maxRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!D1`,
    });

    const currentMax = parseInt(
      maxRes.data.values?.[0]?.[0] || '0',
      10
    );

    // ===== 出價不夠高 =====
    if (bid <= currentMax) {
      await axios.post(
        'https://api.line.me/v2/bot/message/reply',
        {
          replyToken: event.replyToken,
          messages: [
            {
              type: 'text',
              text: '很抱歉，您的出價未高於當前最高出價。',
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${LINE_TOKEN}`,
          },
        }
      );
      return res.sendStatus(200);
    }

    // ===== 有效出價 =====
    const userName = await getUserName(event.source.userId);

    // 寫入 A/B（姓名 / 出價）
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:B`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[userName, bid]],
      },
    });

    // 回覆成功
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: `已收到您的出價：${bid} 元`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
        },
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('錯誤：', err);
    res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 8080, () => {
  console.log('Cloud Run service started');
});
