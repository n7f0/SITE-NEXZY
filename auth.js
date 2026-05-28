// auth.js - Sistema de login e integração com carrinho NEXZY

let currentUser = null;

// Injetar estilos do modal
const style = document.createElement('style');
style.textContent = `
  .modal-login {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(12px);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  }
  .modal-login.active {
    display: flex;
  }
  .modal-login-content {
    background: rgba(10,10,18,0.96);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 24px;
    padding: 2rem;
    width: 90%;
    max-width: 420px;
    color: white;
    font-family: 'Space Grotesk', sans-serif;
  }
  .modal-login-content h3 {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 2rem;
    margin-bottom: 1rem;
    text-align: center;
  }
  .modal-login-content input {
    width: 100%;
    padding: 12px;
    margin: 10px 0;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px;
    color: white;
    font-family: inherit;
  }
  .modal-login-content button {
    width: 100%;
    margin-top: 16px;
    padding: 12px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 40px;
    color: white;
    font-weight: bold;
    cursor: pointer;
    transition: 0.2s;
  }
  .modal-login-content button:hover {
    background: rgba(255,255,255,0.2);
    box-shadow: 0 0 12px rgba(255,255,255,0.2);
  }
  .toggle-auth {
    text-align: center;
    margin-top: 16px;
    font-size: 0.85rem;
    color: rgba(255,255,255,0.6);
    cursor: pointer;
  }
  .toggle-auth:hover {
    color: white;
  }
  .user-menu {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: 20px;
  }
  .user-avatar {
    width: 36px;
    height: 36px;
    background: rgba(255,255,255,0.15);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    cursor: pointer;
  }
  .logout-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.2);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.7rem;
    cursor: pointer;
    color: rgba(255,255,255,0.7);
  }
  .logout-btn:hover {
    background: rgba(255,80,80,0.3);
    border-color: rgba(255,80,80,0.6);
  }
  .login-btn {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.3);
    padding: 6px 14px;
    border-radius: 30px;
    font-size: 0.7rem;
    cursor: pointer;
    color: white;
  }
  .login-btn:hover {
    background: rgba(255,255,255,0.2);
  }
`;
document.head.appendChild(style);

// Criar estrutura do modal
const modalHTML = `
<div id="authModal" class="modal-login">
  <div class="modal-login-content">
    <h3 id="modalTitle">Entrar</h3>
    <input type="email" id="loginEmail" placeholder="Seu email" autocomplete="email">
    <input type="password" id="loginPassword" placeholder="Sua senha" autocomplete="current-password">
    <div id="authError" style="color:#ff8a7a; font-size:0.8rem; margin-top:8px;"></div>
    <button id="submitAuthBtn">Entrar</button>
    <div class="toggle-auth" id="toggleAuthMode">Não tem conta? Criar conta</div>
    <div class="toggle-auth" style="margin-top:8px;" id="closeModalBtn">Fechar</div>
  </div>
</div>
`;
document.body.insertAdjacentHTML('beforeend', modalHTML);

// Injetar botão de login na navbar
function injectLoginButton() {
  const navActions = document.querySelector('.nav-actions');
  if (!navActions || document.getElementById('nexzyUserMenu')) return;

  const userMenu = document.createElement('div');
  userMenu.id = 'nexzyUserMenu';
  userMenu.className = 'user-menu';
  userMenu.innerHTML = `
    <div class="user-avatar" id="userAvatarBtn">
      <i class="fas fa-user"></i>
    </div>
    <span id="userEmailDisplay" style="font-size:0.8rem; display:none;"></span>
    <button class="logout-btn" id="logoutButton" style="display:none;">Sair</button>
    <button class="login-btn" id="openLoginBtn">Entrar</button>
  `;
  navActions.appendChild(userMenu);

  document.getElementById('openLoginBtn')?.addEventListener('click', openModal);
  document.getElementById('logoutButton')?.addEventListener('click', logout);
  document.getElementById('userAvatarBtn')?.addEventListener('click', () => {
    if (currentUser) {
      alert(`👤 Logado como: ${currentUser.email}\n📦 Seu histórico de pedidos está sendo salvo.`);
    } else {
      openModal();
    }
  });
}

function openModal() {
  document.getElementById('authModal').classList.add('active');
  document.getElementById('modalTitle').innerText = 'Entrar';
  document.getElementById('submitAuthBtn').innerText = 'Entrar';
  document.getElementById('toggleAuthMode').innerText = 'Não tem conta? Criar conta';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('authError').innerText = '';
  isLoginMode = true;
}

function closeModal() {
  document.getElementById('authModal').classList.remove('active');
}

let isLoginMode = true;
function toggleMode() {
  isLoginMode = !isLoginMode;
  const title = document.getElementById('modalTitle');
  const btn = document.getElementById('submitAuthBtn');
  const toggleText = document.getElementById('toggleAuthMode');
  if (isLoginMode) {
    title.innerText = 'Entrar';
    btn.innerText = 'Entrar';
    toggleText.innerText = 'Não tem conta? Criar conta';
  } else {
    title.innerText = 'Criar conta';
    btn.innerText = 'Registrar';
    toggleText.innerText = 'Já tem conta? Fazer login';
  }
  document.getElementById('authError').innerText = '';
}

async function handleAuth() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('authError');
  errorDiv.innerText = '';

  if (!email || !password) {
    errorDiv.innerText = 'Preencha email e senha.';
    return;
  }

  const endpoint = isLoginMode ? '/api/login' : '/api/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na autenticação');
    localStorage.setItem('nexzy_token', data.token);
    currentUser = data.user;
    updateUIAfterLogin();
    closeModal();
  } catch (err) {
    errorDiv.innerText = err.message;
  }
}

function updateUIAfterLogin() {
  const loginBtn = document.getElementById('openLoginBtn');
  const logoutBtn = document.getElementById('logoutButton');
  const userEmailSpan = document.getElementById('userEmailDisplay');
  if (loginBtn) loginBtn.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = 'block';
  if (userEmailSpan) {
    userEmailSpan.style.display = 'inline';
    userEmailSpan.innerText = currentUser?.email.split('@')[0] || 'user';
  }
}

function logout() {
  localStorage.removeItem('nexzy_token');
  currentUser = null;
  const loginBtn = document.getElementById('openLoginBtn');
  const logoutBtn = document.getElementById('logoutButton');
  const userEmailSpan = document.getElementById('userEmailDisplay');
  if (loginBtn) loginBtn.style.display = 'block';
  if (logoutBtn) logoutBtn.style.display = 'none';
  if (userEmailSpan) userEmailSpan.style.display = 'none';
}

async function restoreSession() {
  const token = localStorage.getItem('nexzy_token');
  if (!token) return;
  try {
    const res = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      updateUIAfterLogin();
    } else {
      localStorage.removeItem('nexzy_token');
    }
  } catch (err) {
    console.warn('Falha ao restaurar sessão');
  }
}

// Substituir o checkout original para usar autenticação e API
function patchCheckout() {
  const originalCheckoutBtn = document.getElementById('checkoutBtn');
  if (!originalCheckoutBtn) return;
  const newCheckout = originalCheckoutBtn.cloneNode(true);
  originalCheckoutBtn.parentNode.replaceChild(newCheckout, originalCheckoutBtn);
  newCheckout.addEventListener('click', async () => {
    const token = localStorage.getItem('nexzy_token');
    if (!token) {
      alert('🔐 Você precisa estar logado para finalizar a compra. Faça login primeiro.');
      openModal();
      return;
    }
    // Acessa o carrinho global que existe no index.html
    if (typeof window.cart === 'undefined') {
      alert('Erro: carrinho não detectado. Recarregue a página.');
      return;
    }
    const cartItems = window.cart;
    if (!cartItems.length) {
      alert('Sacola vazia.');
      return;
    }
    const itemsForAPI = cartItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price }));
    const total = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items: itemsForAPI, total })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.init_point) {
        // Redireciona para Mercado Pago
        window.location.href = data.init_point;
      } else {
        alert(`✅ Pedido #${data.orderId} registrado! (simulação sem pagamento real)`);
        // Limpa carrinho global
        window.cart = [];
        if (typeof updateCartUI === 'function') updateCartUI();
        if (typeof saveCart === 'function') saveCart();
        if (typeof closeCartFn === 'function') closeCartFn();
      }
    } catch (err) {
      alert('Erro no checkout: ' + err.message);
    }
  });
}

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
  injectLoginButton();
  restoreSession();
  patchCheckout();

  document.getElementById('submitAuthBtn')?.addEventListener('click', handleAuth);
  document.getElementById('toggleAuthMode')?.addEventListener('click', toggleMode);
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('authModal')) closeModal();
  });
});
