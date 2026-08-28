const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/test", (req, res) => {
  res.json({
    message: "Chupapi Munyayo wehhh Sheshhhh World ewww okay di nga, seryoso chupis ka sakin"
  });
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});