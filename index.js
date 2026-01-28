const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ====== 你的 Channel Access Token ======
const LINE_TOKEN = 'nia/AX0e2XvFzJM+PiC0SZ9JTuHKbUBu6KnDA1wImID+53CGwmc1qDEb+DWYJ1fQeVH/bo8QSeOiguFvNZZYPXUaYJzphLpsO+MfQqQIQLTOQrc/N+cSn+es9KzeRiMrzch9FQhSed8wgu4ASu8pWgdB04t89/1O/w1cDnyilFU=';

app.post('/', async (req, res) => {
  console.log('=== 收到訊息 ===');
  console.log(JSON.stringify(req.body, null, 2));

  const event = req.body.events && req.body.events[0];

  if (!event || !event.replyToken || event.type !== 'message') {
    console.log('⚠️ 空事件或非 message，忽略');
    return res.status(200).end();
  }

  try {
    const reply = {
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '我確實收到你的訊息了 ✅'
        }
      ]
    };

    const result = await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      reply,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_TOKEN}`
        }
      }
    );

    console.log('✅ LINE reply success:', result.status, result.data);
  } catch (err) {
    console.error('❌ LINE reply error:', err.response?.status, err.response?.data || err.message);
  }

  res.status(200).end();
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});