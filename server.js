const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ---------- Mercado Pago (opcional) ----------
let MercadoPagoConfig, Preference;
try {
  const mp = require('mercadopago');
  MercadoPagoConfig = mp.MercadoPagoConfig;
  Preference = mp.Preference;
  console.log('✅ Mercado Pago SDK carregado');
} catch (e) {
  console.warn('⚠️ Mercado Pago SDK não disponível:', e.message);
}

// ---------- Banco de dados ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- JWT ----------
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeychangeit';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ========== ROTAS DE AUTENTICAÇÃO ==========
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email já cadastrado' });
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
}

app.get('/api/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

// ========== CHECKOUT ==========
app.post('/api/checkout', authenticateToken, async (req, res) => {
  const { items, total } = req.body;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'INSERT INTO orders (user_id, items, total, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, JSON.stringify(items), total, 'pending']
    );
    const orderId = result.rows[0].id;

    // Se Mercado Pago estiver configurado, criar preferência
    if (MercadoPagoConfig && Preference && process.env.MERCADOPAGO_ACCESS_TOKEN) {
      const client = new MercadoPagoConfig({
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
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
        external_reference: orderId.toString(),
      };
      const response = await new Preference(client).create({ body: preference });
      return res.json({ init_point: response.init_point, orderId });
    } else {
      // Modo simulação (sem pagamento real)
      return res.json({ message: 'Pedido registrado (simulação)', orderId });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar checkout' });
  }
});

// ========== HISTÓRICO DE PEDIDOS (opcional) ==========
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, items, total, status, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

// ========== SERVE O SITE ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 NEXZY rodando em http://localhost:${port}`);
});
