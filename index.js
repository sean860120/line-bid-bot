const express = require("express");
const { google } = require("@googleapis/sheets");
const line = require("@line/bot-sdk");

const app = express();
app.use(express.json());

/* ======================
   LINE 設定
====================== */
const lineClient = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

/* ======================
   Google Sheets 設定
====================== */
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Sheet1"; // ← 如果不是這個名稱記得改

/* ======================
   LINE Webhook
====================== */
app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;
    for (const event of events) {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const text = event.message.text.trim();

      // 只接受「出價 + 金額」
      const match = text.match(/^出價\s*(\d+)$/);
      if (!match) continue;

      const bidAmount = Number(match[1]);
      const userId = event.source.userId;

      /* ===== 取得 LINE 顯示名稱 ===== */
      const profile = await lineClient.getProfile(userId);
      const displayName = profile.displayName;

      /* ===== 讀取目前最高出價（D1）===== */
      const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!D1`
      });

      const currentMax =
        Number(readRes.data.values?.[0]?.[0]) || 0;

      /* ===== 出價判斷 ===== */
      if (bidAmount <= currentMax) {
        await lineClient.replyMessage(event.replyToken, {
          type: "text",
          text: "很抱歉，您的出價未高於當前最高出價。"
        });
        continue;
      }

      /* ===== 寫入試算表 A、B 欄 ===== */
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:B`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[displayName, bidAmount]]
        }
      });

      await lineClient.replyMessage(event.replyToken, {
        type: "text",
        text: `已收到您的出價：${bidAmount} 元。`
      });
    }

    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

/* ======================
   Cloud Run Port
====================== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
