const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve arquivos estáticos da pasta atual
app.use(express.static(__dirname));

// Rota principal: envia o index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Para qualquer outra rota (ex: /produtos), também envia o index.html (para rotas do frontend)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Site NEXZY rodando em http://localhost:${port}`);
});
