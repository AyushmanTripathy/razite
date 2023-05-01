import express from "express";

const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.send(JSON.stringify({ name: "lol"}));
});

app.listen(port, () => {
  console.log(`test server running on ${port}`);
});
