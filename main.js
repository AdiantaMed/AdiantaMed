/* adiantaMed — scripts do site
 * ============================================================
 *  CONFIGURAÇÃO: troque estes valores antes de publicar
 * ============================================================ */
var ADIANTAMED = {
  whatsapp: '55XXXXXXXXXXX',   // DDI + DDD + número, só dígitos. Ex.: 5519999999999
  taxaMensal: 2.5,             // % ao mês usada no simulador (valor ilustrativo)
  taxaMinima: 2.0,             // % mínima por operação
  valorMin: 500,
  valorMax: 50000
};

(function () {
  'use strict';

  /* ---------- WhatsApp ---------- */
  function waLink(msg) {
    var base = 'https://wa.me/' + ADIANTAMED.whatsapp;
    return msg ? base + '?text=' + encodeURIComponent(msg) : base;
  }
  var waReady = /^\d{10,15}$/.test(ADIANTAMED.whatsapp);
  document.querySelectorAll('[data-wa]').forEach(function (a) {
    var msg = a.getAttribute('data-wa') || 'Olá! Quero saber mais sobre a antecipação de plantões da adiantaMed.';
    if (waReady) {
      a.href = waLink(msg);
      a.target = '_blank';
      a.rel = 'noopener';
    }
  });

  /* ---------- Menu mobile ---------- */
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('menu');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* ---------- Ano no rodapé ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Simulador ---------- */
  var sim = document.querySelector('[data-sim]');
  if (sim) {
    var brl = function (n) { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var range = sim.querySelector('[data-sim-range]');
    var input = sim.querySelector('[data-sim-input]');
    var pills = sim.querySelectorAll('[data-prazo]');
    var out = {
      liquido: sim.querySelector('[data-out="liquido"]'),
      bruto: sim.querySelector('[data-out="bruto"]'),
      taxa: sim.querySelector('[data-out="taxa"]'),
      desconto: sim.querySelector('[data-out="desconto"]'),
      prazo: sim.querySelector('[data-out="prazo"]')
    };
    var cta = sim.querySelector('[data-sim-cta]');
    var state = { valor: 5000, prazo: 45 };

    function parseMoney(s) {
      var n = Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
      return isNaN(n) ? 0 : n;
    }
    function fmtInput(n) { return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }

    function calc() {
      var v = Math.min(Math.max(state.valor, 0), ADIANTAMED.valorMax);
      var pct = Math.max(ADIANTAMED.taxaMensal * state.prazo / 30, ADIANTAMED.taxaMinima) / 100;
      var desconto = v * pct;
      var liquido = v - desconto;
      out.liquido.textContent = brl(liquido);
      out.bruto.textContent = brl(v);
      out.taxa.textContent = (pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
      out.desconto.textContent = '− ' + brl(desconto);
      out.prazo.textContent = state.prazo + ' dias';
      if (cta) {
        var msg = 'Olá! Simulei no site da adiantaMed:\n' +
          '• Plantão: ' + brl(v) + '\n' +
          '• Hospital paga em: ' + state.prazo + ' dias\n' +
          '• Valor a receber: ' + brl(liquido) + '\n' +
          'Quero antecipar.';
        cta.setAttribute('data-wa', msg);
        if (waReady) { cta.href = waLink(msg); cta.target = '_blank'; cta.rel = 'noopener'; }
      }
    }

    range.min = ADIANTAMED.valorMin;
    range.max = 20000;
    range.addEventListener('input', function () {
      state.valor = Number(range.value);
      input.value = fmtInput(state.valor);
      calc();
    });
    input.addEventListener('input', function () {
      state.valor = parseMoney(input.value);
      range.value = Math.min(Math.max(state.valor, ADIANTAMED.valorMin), 20000);
      calc();
    });
    input.addEventListener('blur', function () {
      if (state.valor < ADIANTAMED.valorMin) state.valor = ADIANTAMED.valorMin;
      if (state.valor > ADIANTAMED.valorMax) state.valor = ADIANTAMED.valorMax;
      input.value = fmtInput(state.valor);
      range.value = Math.min(state.valor, 20000);
      calc();
    });
    pills.forEach(function (p) {
      p.addEventListener('click', function () {
        state.prazo = Number(p.getAttribute('data-prazo'));
        pills.forEach(function (o) { o.setAttribute('aria-pressed', o === p ? 'true' : 'false'); });
        calc();
      });
    });
    input.value = fmtInput(state.valor);
    range.value = state.valor;
    calc();
  }

  /* ---------- Formulário de contato → WhatsApp ---------- */
  var form = document.querySelector('[data-contact-form]');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var d = new FormData(form);
      var msg = 'Olá! Vim pelo site da adiantaMed.\n' +
        '• Nome: ' + d.get('nome') + '\n' +
        '• Perfil: ' + d.get('perfil') + '\n' +
        (d.get('crm') ? '• CRM: ' + d.get('crm') + '\n' : '') +
        (d.get('hospital') ? '• Hospital / instituição: ' + d.get('hospital') + '\n' : '') +
        (d.get('mensagem') ? '• Mensagem: ' + d.get('mensagem') : '');
      if (waReady) {
        window.open(waLink(msg), '_blank', 'noopener');
      } else {
        var status = form.querySelector('[data-status]');
        if (status) status.textContent = 'Configure o número de WhatsApp em main.js para ativar o envio.';
      }
    });
  }
})();
