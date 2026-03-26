const express = require('express');
const app = express();
console.log("Modules loaded");
app.get('/*', (req, res) => res.send("OK"));
app.listen(4001, () => console.log("Test server on 4001"));
