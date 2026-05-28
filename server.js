const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve todos os arquivos estáticos da pasta atual
app.use(express.static(__dirname));

// Redireciona todas as rotas para o index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Site rodando na porta ${port}`);
});
