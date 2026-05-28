// auth.js - Sistema de login com nickname e perfil
let currentUser = null;

// Injetar estilos do modal e da página de perfil
const style = document.createElement('style');
style.textContent = `
  .modal-login { ... (mantenha os estilos anteriores) ... }
  /* Estilos para a página de perfil */
  .profile-page {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.9);
    backdrop-filter: blur(12px);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 11000;
  }
  .profile-page.active { display: flex; }
  .profile-container {
    background: rgba(10,10,18,0.96);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 24px;
    padding: 2rem;
    width: 90%;
    max-width: 500px;
    color: white;
    font-family: 'Space Grotesk', sans-serif;
  }
  .profile-container h2 {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 2rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }
  .profile-field {
    margin-bottom: 1rem;
  }
  .profile-field label {
    display: block;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.5);
    margin-bottom: 0.25rem;
  }
  .profile-field input, .profile-field p {
    width: 100%;
    padding: 10px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px;
    color: white;
    font-family: inherit;
  }
  .profile-actions {
    display: flex;
    gap: 12px;
    margin-top: 1.5rem;
  }
  .profile-actions button {
    flex: 1;
    padding: 10px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 40px;
    cursor: pointer;
    color: white;
  }
  .profile-actions button:hover {
    background: rgba(255,255,255,0.2);
  }
  .close-profile {
    margin-top: 1rem;
    text-align: center;
    cursor: pointer;
    color: rgba(255,255,255,0.5);
  }
  .orders-list {
    margin-top: 1.5rem;
    border-top: 1px solid rgba(255,255,255,0.1);
    padding-top: 1rem;
    max-height: 300px;
    overflow-y: auto;
  }
  .order-item {
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    padding: 0.8rem;
    margin-bottom: 0.8rem;
  }
`;
document.head.appendChild(style);

// Modal de login/registro (mesmo anterior, mas com campo nickname)
let modalHTML = `
<div id="authModal" class="modal-login">
  <div class="modal-login-content">
    <h3 id="modalTitle">Entrar</h3>
    <input type="email" id="loginEmail" placeholder="Seu email" autocomplete="email">
    <input type="text" id="loginNickname" placeholder="Nickname (ex: João)" style="display:none;">
    <input type="password" id="loginPassword" placeholder="Sua senha" autocomplete="current-password">
    <div id="authError" style="color:#ff8a7a; font-size:0.8rem; margin-top:8px;"></div>
    <button id="submitAuthBtn">Entrar</button>
    <div class="toggle-auth" id="toggleAuthMode">Não tem conta? Criar conta</div>
    <div class="toggle-auth" id="closeModalBtn">Fechar</div>
  </div>
</div>`;
document.body.insertAdjacentHTML('beforeend', modalHTML);

// Página de perfil (aba)
let profileHTML = `
<div id="profilePage" class="profile-page">
  <div class="profile-container">
    <h2>Meu Perfil</h2>
    <div class="profile-field">
      <label>E-mail</label>
      <p id="profileEmail">-</p>
    </div>
    <div class="profile-field">
      <label>Nickname</label>
      <input type="text" id="profileNickname" placeholder="Seu nickname">
    </div>
    <div class="profile-actions">
      <button id="saveProfileBtn">Salvar</button>
      <button id="closeProfileBtn">Fechar</button>
    </div>
    <div class="orders-list">
      <h3 style="font-size:1rem; margin-bottom:0.5rem;">Meus Pedidos</h3>
      <div id="ordersList">Carregando...</div>
    </div>
    <div class="close-profile" id="closeProfileFooter">Fechar</div>
  </div>
</div>`;
document.body.insertAdjacentHTML('beforeend', profileHTML);

// Funções de UI
function injectUserIcon() {
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
  `;
  navActions.appendChild(userMenu);
  document.getElementById('userAvatarBtn').addEventListener('click', () => {
    if (currentUser) openProfile();
    else openModal();
  });
  document.getElementById('logoutButton').addEventListener('click', logout);
}

let isLoginMode = true;
let waitingForCode = false;
let pendingEmail = null;

function openModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('active');
  document.getElementById('modalTitle').innerText = 'Entrar';
  document.getElementById('submitAuthBtn').innerText = 'Entrar';
  document.getElementById('toggleAuthMode').innerText = 'Não tem conta? Criar conta';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('authError').innerText = '';
  document.getElementById('loginNickname').style.display = 'none';
  document.getElementById('loginPassword').style.display = 'block';
  waitingForCode = false;
  isLoginMode = true;
}

function closeModal() {
  document.getElementById('authModal').classList.remove('active');
}

function toggleMode() {
  isLoginMode = !isLoginMode;
  waitingForCode = false;
  const title = document.getElementById('modalTitle');
  const btn = document.getElementById('submitAuthBtn');
  const toggleText = document.getElementById('toggleAuthMode');
  const nicknameField = document.getElementById('loginNickname');
  const passwordField = document.getElementById('loginPassword');
  if (isLoginMode) {
    title.innerText = 'Entrar';
    btn.innerText = 'Entrar';
    toggleText.innerText = 'Não tem conta? Criar conta';
    nicknameField.style.display = 'none';
    passwordField.style.display = 'block';
    passwordField.placeholder = 'Sua senha';
  } else {
    title.innerText = 'Criar conta';
    btn.innerText = 'Enviar código';
    toggleText.innerText = 'Já tem conta? Fazer login';
    nicknameField.style.display = 'block';
    nicknameField.placeholder = 'Seu nickname (como será visto)';
    passwordField.style.display = 'block';
    passwordField.placeholder = 'Sua senha';
  }
  document.getElementById('authError').innerText = '';
}

async function handleAuth() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const nickname = document.getElementById('loginNickname').value;
  const errorDiv = document.getElementById('authError');
  errorDiv.innerText = '';

  if (!email) { errorDiv.innerText = 'Digite seu e-mail.'; return; }
  if (isLoginMode) {
    if (!password) { errorDiv.innerText = 'Digite sua senha.'; return; }
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('nexzy_token', data.token);
      currentUser = data.user;
      updateUIAfterLogin();
      closeModal();
      fetchOrders();
    } catch (err) { errorDiv.innerText = err.message; }
  } else {
    // Registro
    if (!waitingForCode) {
      if (!nickname) { errorDiv.innerText = 'Escolha um nickname.'; return; }
      pendingEmail = email;
      try {
        const res = await fetch('/api/send-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        waitingForCode = true;
        document.getElementById('modalTitle').innerText = 'Verificar código';
        document.getElementById('submitAuthBtn').innerText = 'Confirmar cadastro';
        document.getElementById('loginNickname').style.display = 'none';
        if (!document.getElementById('verificationCode')) {
          const codeInput = document.createElement('input');
          codeInput.id = 'verificationCode';
          codeInput.type = 'text';
          codeInput.placeholder = 'Código de 6 dígitos';
          codeInput.style.marginTop = '10px';
          passwordField.parentNode.insertBefore(codeInput, passwordField.nextSibling);
        }
        document.getElementById('verificationCode').style.display = 'block';
        document.getElementById('authError').innerText = 'Código enviado! Verifique seu e-mail.';
      } catch (err) { errorDiv.innerText = err.message; }
    } else {
      const code = document.getElementById('verificationCode').value;
      if (!code || !password) { errorDiv.innerText = 'Preencha código e senha.'; return; }
      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingEmail, password, nickname, code })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem('nexzy_token', data.token);
        currentUser = data.user;
        updateUIAfterLogin();
        closeModal();
        fetchOrders();
      } catch (err) { errorDiv.innerText = err.message; }
    }
  }
}

function updateUIAfterLogin() {
  const logoutBtn = document.getElementById('logoutButton');
  const userEmailSpan = document.getElementById('userEmailDisplay');
  if (logoutBtn) logoutBtn.style.display = 'block';
  if (userEmailSpan) {
    userEmailSpan.style.display = 'inline';
    userEmailSpan.innerText = currentUser?.nickname || currentUser?.email.split('@')[0];
  }
}

function logout() {
  localStorage.removeItem('nexzy_token');
  currentUser = null;
  const logoutBtn = document.getElementById('logoutButton');
  const userEmailSpan = document.getElementById('userEmailDisplay');
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
      fetchOrders();
    } else {
      localStorage.removeItem('nexzy_token');
    }
  } catch (err) { console.warn(err); }
}

// Abrir perfil e carregar dados
async function openProfile() {
  if (!currentUser) return;
  const profilePage = document.getElementById('profilePage');
  profilePage.classList.add('active');
  document.getElementById('profileEmail').innerText = currentUser.email;
  document.getElementById('profileNickname').value = currentUser.nickname || '';
  await fetchOrders();
}

async function fetchOrders() {
  const token = localStorage.getItem('nexzy_token');
  if (!token) return;
  try {
    const res = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const orders = await res.json();
      const ordersDiv = document.getElementById('ordersList');
      if (orders.length === 0) {
        ordersDiv.innerHTML = '<p style="color:#aaa;">Nenhum pedido ainda.</p>';
        return;
      }
      ordersDiv.innerHTML = orders.map(order => `
        <div class="order-item">
          <strong>Pedido #${order.id}</strong> - ${new Date(order.created_at).toLocaleDateString()}<br>
          Total: R$ ${parseFloat(order.total).toFixed(2)} - Status: ${order.status}<br>
          <small>Itens: ${order.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</small>
        </div>
      `).join('');
    }
  } catch (err) { console.error(err); }
}

async function saveProfile() {
  const newNickname = document.getElementById('profileNickname').value;
  if (!newNickname) { alert('Nickname não pode ficar vazio'); return; }
  const token = localStorage.getItem('nexzy_token');
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ nickname: newNickname })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('nexzy_token', data.token);
    currentUser = data.user;
    updateUIAfterLogin();
    alert('Perfil atualizado!');
  } catch (err) {
    alert(err.message);
  }
}

function closeProfile() {
  document.getElementById('profilePage').classList.remove('active');
}

// Substituir checkout (similar ao anterior, mas mantém integridade)
function patchCheckout() {
  const originalBtn = document.getElementById('checkoutBtn');
  if (!originalBtn) return;
  const newBtn = originalBtn.cloneNode(true);
  originalBtn.parentNode.replaceChild(newBtn, originalBtn);
  newBtn.addEventListener('click', async () => {
    const token = localStorage.getItem('nexzy_token');
    if (!token) {
      alert('🔐 Você precisa estar logado para finalizar a compra.');
      openModal();
      return;
    }
    if (!window.cart || !window.cart.length) { alert('Sacola vazia.'); return; }
    const items = window.cart.map(i => ({ name: i.name, quantity: i.quantity, price: i.price }));
    const total = window.cart.reduce((s, i) => s + i.price * i.quantity, 0);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items, total })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.init_point) window.location.href = data.init_point;
      else {
        alert(`✅ Pedido #${data.orderId} registrado! (simulação)`);
        window.cart = [];
        if (typeof updateCartUI === 'function') updateCartUI();
        if (typeof saveCart === 'function') saveCart();
        if (typeof closeCartFn === 'function') closeCartFn();
        fetchOrders(); // atualiza lista de pedidos se perfil estiver aberto
      }
    } catch (err) { alert('Erro: ' + err.message); }
  });
}

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
  injectUserIcon();
  restoreSession();
  patchCheckout();

  document.getElementById('submitAuthBtn').addEventListener('click', handleAuth);
  document.getElementById('toggleAuthMode').addEventListener('click', toggleMode);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
  document.getElementById('closeProfileBtn').addEventListener('click', closeProfile);
  document.getElementById('closeProfileFooter').addEventListener('click', closeProfile);
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('authModal')) closeModal();
    if (e.target === document.getElementById('profilePage')) closeProfile();
  });
});
