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

// Email config
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
    html: `<div>... (seu HTML do email) ...</div>`,
  };
  await transporter.sendMail(mailOptions);
}

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(__dirname));

// Enviar código
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
    res.status(500).json({ error: 'Erro ao enviar e-mail.' });
  }
});

// Registrar com nickname
app.post('/api/register', async (req, res) => {
  const { email, password, nickname, code } = req.body;
  if (!email || !password || !nickname || !code) {
    return res.status(400).json({ error: 'Preencha e-mail, nickname, senha e código.' });
  }
  const stored = verificationCodes.get(email);
  if (!stored) return res.status(400).json({ error: 'Nenhum código solicitado.' });
  if (stored.code !== code) return res.status(400).json({ error: 'Código inválido.' });
  if (Date.now() > stored.expires) {
    verificationCodes.delete(email);
    return res.status(400).json({ error: 'Código expirado.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, email, nickname',
      [email, hash, nickname]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
    verificationCodes.delete(email);
    res.json({ token, user: { id: user.id, email: user.email, nickname: user.nickname } });
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'users_nickname_key') return res.status(400).json({ error: 'Nickname já em uso.' });
      if (err.constraint === 'users_email_key') return res.status(400).json({ error: 'E-mail já cadastrado.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Login (retorna nickname também)
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
    res.json({ token, user: { id: user.id, email: user.email, nickname: user.nickname } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Middleware auth
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

// Rota /api/me retorna dados atualizados do usuário (inclui nickname)
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

// Rota de pedidos (já existente)
app.post('/api/checkout', authenticateToken, async (req, res) => { /* ... */ });
app.get('/api/orders', authenticateToken, async (req, res) => { /* ... */ });

// Rota para atualizar perfil (apenas nickname, por exemplo)
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { nickname } = req.body;
  if (!nickname) return res.status(400).json({ error: 'Nickname obrigatório' });
  try {
    await pool.query('UPDATE users SET nickname = $1 WHERE id = $2', [nickname, req.user.id]);
    const updatedUser = await pool.query('SELECT id, email, nickname FROM users WHERE id = $1', [req.user.id]);
    const newToken = jwt.sign({ id: updatedUser.rows[0].id, email: updatedUser.rows[0].email, nickname: updatedUser.rows[0].nickname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: newToken, user: updatedUser.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Nickname já em uso' });
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// Servir HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 NEXZY rodando em http://localhost:${port}`);
});
