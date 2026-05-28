const express = require('express');
const path = require('path');
const { MercadoPagoConfig, Preference } = require('mercadopago');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

// Rota para criar preferência de pagamento
app.post('/create-preference', async (req, res) => {
  try {
    const { items } = req.body;
    const preference = {
      items: items.map(item => ({
        title: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        currency_id: 'BRL',
      })),
      back_urls: {
        success: `${process.env.BASE_URL || 'https://seu-dominio.railway.app'}/sucesso.html`,
        failure: `${process.env.BASE_URL || 'https://seu-dominio.railway.app'}/falha.html`,
        pending: `${process.env.BASE_URL || 'https://seu-dominio.railway.app'}/pendente.html`,
      },
      auto_return: 'approved',
    };
    const response = await new Preference(client).create({ body: preference });
    res.json({ init_point: response.init_point });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar preferência' });
  }
});

// Rota padrão para servir o index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Site NEXZY rodando em http://localhost:${port}`);
});
