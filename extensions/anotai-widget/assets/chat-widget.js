(function() {
  const trigger = document.getElementById('anotai-chat-trigger');
  const windowEl = document.getElementById('anotai-chat-window');
  const closeBtn = document.getElementById('anotai-chat-close');
  const sendBtn = document.getElementById('anotai-chat-send');
  const inputEl = document.getElementById('anotai-chat-input');
  const messagesEl = document.getElementById('anotai-chat-messages');

  const shop = Shopify.shop;
  const customerEmail = window.ShopifyAnalytics?.meta?.page?.customerEmail || localStorage.getItem('anotai_customer_email') || 'guest@example.com';

  // Toggle Chat
  trigger.addEventListener('click', () => windowEl.classList.toggle('hidden'));
  closeBtn.addEventListener('click', () => windowEl.classList.add('hidden'));

  // Send Message
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    // 1. Add User Message
    appendMessage('user', text);
    inputEl.value = '';

    // 2. Show Loading
    const loadingId = appendMessage('bot', '...', true);

    try {
      // 3. Call App Proxy
      const response = await fetch('/apps/anotai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shop,
          customer_email: customerEmail,
          message: text
        })
      });

      const data = await response.json();
      
      // 4. Update Message
      removeMessage(loadingId);
      appendMessage('bot', data.message);

      // 5. Show Recommendations if any
      if (data.recommendations && data.recommendations.length > 0) {
        data.recommendations.forEach(prod => {
          appendMessage('bot', `✨ Recommended: ${prod.title} ($${prod.price})\nReason: ${prod.reasoning}`);
        });
      }

    } catch (err) {
      removeMessage(loadingId);
      appendMessage('bot', "I'm having trouble connecting. Please try again later.");
    }
  }

  function appendMessage(role, text, isLoading = false) {
    const id = 'msg-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = `anotai-message ${role}`;
    div.innerText = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
  }

  function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

})();
