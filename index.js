const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// ===== LINE =====
const LINE_TOKEN = '你的 LINE token';

// ===== Google Sheets =====
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
    return res.data.displayName || userId;
  } catch (err) {
    console.log('取得名稱失敗，使用 userId');
    return userId;
  }
}

// ===== 解析 E1（台灣時間字串）=====
function parseE1(str) {
  // YYYY/MM/DD HH:mm
  const [date, time] = str.split(' ');
  const [y, m, d] = date.split('/').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

// ===== 格式化時間 =====
function formatTime(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

app.post('/', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message' || !event.message.text) {
      return res.sendStatus(200);
    }

    const match = event.message.text.trim().match(bidRegex);
    if (!match) return res.sendStatus(200); // 非出價不回

    // ===== 讀取 E1 =====
    const e1Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '工作表1!E1'
    });
    const e1Raw = e1Res.data.values?.[0]?.[0];
    if (!e1Raw) return res.sendStatus(200); // 沒活動

    const endTime = parseE1(e1Raw);
    const now = new Date();

    if (now >= endTime) return res.sendStatus(200); // 已截止

    // ===== 讀取 D1 =====
    const d1Res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '工作表1!D1'
    });
    const currentMax = parseInt(d1Res.data.values?.[0]?.[0] || '0', 10);
    const bid = parseInt(match[1], 10);

    let replyText = '';

    if (bid <= currentMax) {
      replyText = '很抱歉，您的出價未高於當前最高出價';
    } else {
      const userName = await getUserName(event.source.userId);

      // A/B 新增
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!A:B',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[userName, bid]] }
      });

      // 更新 C1/D1
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: '工作表1!C1:D1',
        valueInputOption: 'RAW',
        requestBody: { values: [[userName, bid]] }
      });

      // ===== 倒數 3 分鐘延長 =====
      const diffMin = (endTime - now) / 60000;
      if (diffMin <= 3) {
        const newEnd = new Date(now.getTime() + 3 * 60000);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: '工作表1!E1',
          valueInputOption: 'RAW',
          requestBody: { values: [[formatTime(newEnd)]] }
        });
      }

      replyText = `已收到您的出價：${bid} 元`;
    }

    // ===== 回覆 LINE =====
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: replyText }]
      },
      { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 8080);
