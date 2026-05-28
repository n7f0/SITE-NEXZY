const express = require('express');
const path = require('path');
let MercadoPagoConfig, Preference;
try {
  const mp = require('mercadopago');
  MercadoPagoConfig = mp.MercadoPagoConfig;
  Preference = mp.Preference;
  console.log('Mercado Pago SDK carregado');
} catch (e) {
  console.warn('Mercado Pago SDK não disponível:', e.message);
}

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Rota para criar preferência (se SDK disponível)
app.post('/create-preference', async (req, res) => {
  if (!MercadoPagoConfig || !Preference) {
    return res.status(501).json({ error: 'Mercado Pago não configurado' });
  }
  try {
    const { items } = req.body;
    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'test_token',
    });
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

// Rota padrão
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Site NEXZY rodando em http://localhost:${port}`);
});
