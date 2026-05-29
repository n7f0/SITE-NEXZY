const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Mercado Pago opcional
let MercadoPagoConfig, Preference;
try {
  const mp = require('mercadopago');
  MercadoPagoConfig = mp.MercadoPagoConfig;
  Preference = mp.Preference;
  console.log('✅ Mercado Pago SDK carregado');
} catch (e) {
  console.warn('⚠️ Mercado Pago SDK não disponível:', e.message);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeychangeit';

// Configuração de e-mail
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const verificationCodes = new Map();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, code) {
  const mailOptions = {
    from: `"NEXZY" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Código de verificação - NEXZY',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #0a0a0f; color: #fff; border-radius: 16px;">
        <h2 style="color: #fff;">🔐 Verifique seu e-mail</h2>
        <p>Olá,</p>
        <p>Seu código de verificação para criar uma conta na <strong>NEXZY</strong> é:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #1a1a2e; padding: 16px; text-align: center; border-radius: 12px; margin: 20px 0;">${code}</div>
        <p>Este código expira em <strong>10 minutos</strong>.</p>
        <p>Se você não solicitou, ignore este e-mail.</p>
        <hr style="border-color: #333;">
        <p style="font-size: 12px; color: #888;">NEXZY - Sistemas que fazem diferença</p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(__dirname));

// ==================== ROTAS DE AUTENTICAÇÃO ====================

// Enviar código de verificação
app.post('/api/send-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'E-mail já registrado. Faça login.' });
    }
    const code = generateCode();
    const expires = Date.now() + 10 * 60 * 1000;
    verificationCodes.set(email, { code, expires });
    await sendVerificationEmail(email, code);
    res.json({ message: 'Código enviado para seu e-mail.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar e-mail. Verifique as configurações SMTP.' });
  }
});

// Registrar novo usuário (com nickname e código)
app.post('/api/register', async (req, res) => {
  const { email, password, nickname, code } = req.body;
  if (!email || !password || !nickname || !code) {
    return res.status(400).json({ error: 'Preencha e-mail, nickname, senha e código.' });
  }
  const stored = verificationCodes.get(email);
  if (!stored) return res.status(400).json({ error: 'Nenhum código solicitado para este e-mail.' });
  if (stored.code !== code) return res.status(400).json({ error: 'Código inválido.' });
  if (Date.now() > stored.expires) {
    verificationCodes.delete(email);
    return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, email, nickname, created_at',
      [email, hash, nickname]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
    verificationCodes.delete(email);
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'users_nickname_key') return res.status(400).json({ error: 'Nickname já em uso.' });
      if (err.constraint === 'users_email_key') return res.status(400).json({ error: 'E-mail já cadastrado.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });
    const token = jwt.sign({ id: user.id, email: user.email, nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, nickname: user.nickname, created_at: user.created_at } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Middleware de autenticação
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

// Obter dados do usuário logado (inclui nickname e created_at)
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, nickname, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ==================== ROTAS DE CHECKOUT E PEDIDOS ====================

// Finalizar compra (checkout)
app.post('/api/checkout', authenticateToken, async (req, res) => {
  const { items, total } = req.body;
  const userId = req.user.id;

  if (!items || !items.length || !total) {
    return res.status(400).json({ error: 'Dados do pedido incompletos' });
  }

  try {
    // Salva o pedido no banco
    const result = await pool.query(
      'INSERT INTO orders (user_id, items, total, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, JSON.stringify(items), total, 'pending']
    );
    const orderId = result.rows[0].id;

    // Se tiver Mercado Pago configurado, cria preferência
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

// Listar pedidos do usuário
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

// ==================== ROTA PARA ATUALIZAR PERFIL (opcional) ====================
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { nickname } = req.body;
  if (!nickname) return res.status(400).json({ error: 'Nickname obrigatório' });
  try {
    await pool.query('UPDATE users SET nickname = $1 WHERE id = $2', [nickname, req.user.id]);
    const updatedUser = await pool.query('SELECT id, email, nickname, created_at FROM users WHERE id = $1', [req.user.id]);
    const newToken = jwt.sign(
      { id: updatedUser.rows[0].id, email: updatedUser.rows[0].email, nickname: updatedUser.rows[0].nickname },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token: newToken, user: updatedUser.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Nickname já em uso' });
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// ==================== SERVE O SITE ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 NEXZY rodando em http://localhost:${port}`);
});
