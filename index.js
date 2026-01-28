const express = require('express');
const app = express();
app.use(express.json());

// 最簡單 LINE webhook 回 200
app.post('/', (req, res) => {
  console.log('收到訊息：', req.body);
  res.status(200).send('OK');
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server running on port ${port}`));