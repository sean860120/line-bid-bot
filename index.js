const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const LINE_TOKEN = 'nia/AX0e2XvFzJM+PiC0SZ9JTuHKbUBu6KnDA1wImID+53CGwmc1qDEb+DWYJ1fQeVH/bo8QSeOiguFvNZZYPXUaYJzphLpsO+MfQqQIQLTOQrc/N+cSn+es9KzeRiMrzch9FQhSed8wgu4ASu8pWgdB04t89/1O/w1cDnyilFU=';

const bidRegex = /^出價\s*([0-9]+)\s*$/;

app.post('/', async (req, res) => {
  console.log('=== 收到訊息 ===');
  console.log(JSON.stringify(req.body, null, 2));

  const event = req.body.events && req.body.events[0];
  if (!event || !event.replyToken || event.type !== 'message' || !event.message.text) {
    console.log('⚠️ 空事件或非文字訊息，忽略');
    return res.status(200).end();
  }

  const userMessage = event.message.text.trim();
  const userId = event.source.userId;
  const match = userMessage.match(bidRegex);

  let replyText = '';

  if (match) {
    const bidAmount = parseInt(match[1], 10);
    console.log(`✅ ${userId} 出價: ${bidAmount}`);
    replyText = `已收到你的出價：${bidAmount} 元`;
  } else {
    console.log(`⚠️ ${userId} 輸入不符合格式`);
    replyText = '請輸入正確格式：出價 <金額>';
  }

  try {
    const result = await axios.post(
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
    console.log('✅ LINE reply success:', result.status, result.data);
  } catch (err) {
    console.error('❌ LINE reply error:', err.response ? err.response.data : err.message);
  }

  res.status(200).end();
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
