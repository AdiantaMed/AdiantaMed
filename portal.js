/* adiantaMed — portal: login, área do cliente e painel admin
   Depende de: config.js e supabase-js (carregados antes deste arquivo). */
(function () {
  'use strict';

  /* ================= Base ================= */
  var CFG = window.ADIANTAMED_PORTAL || {};
  var configurado = !!(CFG.url && CFG.key && CFG.url.indexOf('SEU-PROJETO') === -1 && CFG.key.indexOf('SUA-CHAVE') === -1);
  var sb = (configurado && window.supabase) ? window.supabase.createClient(CFG.url, CFG.key) : null;
  var BUCKET = 'documentos';
  var MAX_MB = 10;
  var ORIGEM = location.origin;

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function brl(n) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function dataBR(d) {
    if (!d) return '—';
    var dt = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
    return isNaN(dt) ? '—' : dt.toLocaleDateString('pt-BR');
  }
  function dataHoraBR(d) {
    var dt = new Date(d);
    return isNaN(dt) ? '' : dt.toLocaleDateString('pt-BR') + ' às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function parseValor(s) {
    var t = String(s || '').replace(/[^\d,.-]/g, '');
    if (t.indexOf(',') > -1) t = t.replace(/\./g, '').replace(',', '.');
    var n = Number(t);
    return isNaN(n) ? 0 : n;
  }
  function nomeSeguro(nome) {
    var partes = String(nome || 'arquivo').split('.');
    var ext = partes.length > 1 ? partes.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    var base = partes.join('.').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
    return base + (ext ? '.' + ext : '');
  }
  function mostrar(el, tipo, msg) {
    if (!el) return;
    el.className = 'alert alert-' + tipo;
    el.textContent = msg;
    el.hidden = false;
  }
  function esconder(el) { if (el) el.hidden = true; }
  function traduzErro(e) {
    var m = (e && (e.message || e.error_description || e)) + '';
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar. Procure o link que enviamos (veja também o spam).';
    if (/already registered|already been registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Entrar" ou "Esqueci minha senha".';
    if (/Password should be at least|weak password/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres, com letras e números.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
    if (/mime type|not supported/i.test(m)) return 'Formato de arquivo não aceito. Envie PDF, JPG ou PNG.';
    if (/exceeded the maximum allowed size|Payload too large/i.test(m)) return 'Arquivo grande demais (máximo ' + MAX_MB + ' MB).';
    return 'Algo deu errado: ' + m;
  }

  var STATUS = {
    em_analise:            { admin: 'Em análise',              cliente: 'Em análise',                         tom: 'info' },
    pendente_documentos:   { admin: 'Documentos pendentes',    cliente: 'Documentos pendentes',               tom: 'warn' },
    aguardando_assinatura: { admin: 'Aguardando assinatura',   cliente: 'Aguardando sua assinatura',          tom: 'warn' },
    aprovada:              { admin: 'Aprovada',                cliente: 'Aprovada · pagamento em preparação', tom: 'info' },
    paga:                  { admin: 'Paga ao médico',          cliente: 'Paga',                               tom: 'ok' },
    liquidada:             { admin: 'Liquidada (hospital pagou)', cliente: 'Paga',                            tom: 'ok' },
    atrasada:              { admin: 'Hospital em atraso',      cliente: 'Paga',                               tom: 'danger' },
    recusada:              { admin: 'Recusada',                cliente: 'Recusada',                           tom: 'muted' },
    cancelada:             { admin: 'Cancelada',               cliente: 'Cancelada',                          tom: 'muted' }
  };
  var GRUPO = {
    andamento: ['em_analise', 'pendente_documentos', 'aguardando_assinatura', 'aprovada'],
    pagas: ['paga', 'liquidada', 'atrasada'],
    encerradas: ['recusada', 'cancelada']
  };
  function badge(status, visao) {
    var s = STATUS[status] || { admin: status, cliente: status, tom: 'muted' };
    var tom = visao === 'cliente' && GRUPO.pagas.indexOf(status) > -1 ? 'ok' : s.tom;
    return '<span class="badge ' + tom + '">' + esc(s[visao]) + '</span>';
  }
  var TIPOS_DOC = { comprovante: 'Comprovante do plantão', pessoal: 'Documento pessoal', contrato: 'Contrato', outro: 'Outro' };

  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ================= Sessão ================= */
  async function sessaoAtual() {
    var r = await sb.auth.getSession();
    return r.data && r.data.session;
  }
  async function exigirLogin() {
    var s = await sessaoAtual();
    if (!s) { location.replace('/entrar.html?volta=' + encodeURIComponent(location.pathname)); return null; }
    return s;
  }
  async function carregarPerfil(uid) {
    var r = await sb.from('perfis').select('*').eq('id', uid).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }
  function montarCabecalho(perfil, pagina) {
    var box = $('[data-portal-user]');
    if (!box) return;
    var nome = (perfil && (perfil.nome || perfil.email)) || '';
    var html = '<span class="who">Olá, <strong>' + esc(nome.split(' ')[0]) + '</strong></span>';
    if (perfil && perfil.papel === 'admin') {
      html += pagina === 'admin'
        ? '<a class="btn btn-quiet btn-sm" href="/area.html">Minha área</a>'
        : '<a class="btn btn-outline btn-sm" href="/admin.html">Painel admin</a>';
    }
    html += '<button class="btn btn-quiet btn-sm" type="button" data-sair>Sair</button>';
    box.innerHTML = html;
    $('[data-sair]', box).addEventListener('click', async function () {
      await sb.auth.signOut();
      location.replace('/entrar.html');
    });
  }
  async function abrirDocumento(caminho) {
    var janela = window.open('', '_blank');
    var r = await sb.storage.from(BUCKET).createSignedUrl(caminho, 120);
    if (r.error) { if (janela) janela.close(); alert(traduzErro(r.error)); return; }
    if (janela) janela.location = r.data.signedUrl; else location.href = r.data.signedUrl;
  }
  async function enviarArquivos(clienteId, operacaoId, lista, progresso) {
    // lista: [{file, tipo}]
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i].file;
      if (f.size > MAX_MB * 1024 * 1024) throw new Error('O arquivo "' + f.name + '" passa de ' + MAX_MB + ' MB.');
      if (progresso) progresso('Enviando arquivo ' + (i + 1) + ' de ' + lista.length + ': ' + f.name);
      var caminho = clienteId + '/' + operacaoId + '/' + Date.now() + '-' + lista[i].tipo + '-' + nomeSeguro(f.name);
      var up = await sb.storage.from(BUCKET).upload(caminho, f, { contentType: f.type || undefined, upsert: false });
      if (up.error) throw up.error;
      var ins = await sb.from('documentos').insert({
        operacao_id: operacaoId, cliente_id: clienteId, tipo: lista[i].tipo,
        nome_arquivo: f.name, caminho: caminho, tamanho: f.size
      });
      if (ins.error) throw ins.error;
    }
  }
  function arquivosDe(input, tipo) {
    return input && input.files ? Array.prototype.map.call(input.files, function (f) { return { file: f, tipo: tipo }; }) : [];
  }
  function textoHistorico(h, visao) {
    if (h.evento === 'status') {
      var p = String(h.detalhe || '').split('>');
      var de = STATUS[p[0]], para = STATUS[p[1]];
      if (!de || !para) return null;
      if (visao === 'cliente' && de.cliente === para.cliente) return null;
      return { txt: 'Status: ' + de[visao] + ' → ' + para[visao] };
    }
    if (h.evento === 'Mensagem') return { txt: visao === 'cliente' ? 'Mensagem da adiantaMed' : 'Mensagem enviada ao cliente', msg: h.detalhe };
    return { txt: h.evento + (h.detalhe ? ': ' + h.detalhe : '') };
  }
  function renderTimeline(lista, visao) {
    var itens = lista.map(function (h) {
      var t = textoHistorico(h, visao);
      if (!t) return '';
      return '<li><time>' + esc(dataHoraBR(h.criado_em)) + '</time>' + esc(t.txt) +
        (t.msg ? '<div class="msg">' + esc(t.msg) + '</div>' : '') + '</li>';
    }).join('');
    return itens ? '<ol class="timeline">' + itens + '</ol>' : '<p class="small">Sem eventos ainda.</p>';
  }
  function renderDocs(docs) {
    if (!docs.length) return '<p class="small">Nenhum documento enviado.</p>';
    return '<ul class="doc-list">' + docs.map(function (d) {
      return '<li><span class="doc-name">' + esc(d.nome_arquivo) + '<small>' + esc(TIPOS_DOC[d.tipo] || d.tipo) + ' · ' + esc(dataBR(d.criado_em)) + '</small></span>' +
        '<button class="btn btn-outline btn-sm" type="button" data-abrir="' + esc(d.caminho) + '">Abrir</button></li>';
    }).join('') + '</ul>';
  }
  function ligarAbrirDocs(scope) {
    $$('[data-abrir]', scope).forEach(function (b) {
      b.addEventListener('click', function () { abrirDocumento(b.getAttribute('data-abrir')); });
    });
  }
  function abrirDialog(dlg) { if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); }
  function fecharDialog(dlg) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }
  function ligarFechar(dlg) {
    $$('[data-fechar]', dlg).forEach(function (b) { b.addEventListener('click', function () { fecharDialog(dlg); }); });
  }

  /* ================= Página: entrar ================= */
  async function paginaEntrar() {
    var aviso = $('#aviso');
    var params = new URLSearchParams(location.search);
    var volta = params.get('volta');
    if (!volta || volta.charAt(0) !== '/' || volta.charAt(1) === '/') volta = '/area.html';

    if (await sessaoAtual()) { location.replace(volta); return; }

    var paineis = { entrar: $('#painel-entrar'), criar: $('#painel-criar'), recuperar: $('#painel-recuperar') };
    function ir(qual) {
      Object.keys(paineis).forEach(function (k) { paineis[k].hidden = k !== qual; });
      $$('.tab').forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === qual ? 'true' : 'false'); });
      esconder(aviso);
    }
    $$('[data-tab]').forEach(function (t) { t.addEventListener('click', function () { ir(t.getAttribute('data-tab')); }); });
    $$('[data-ir]').forEach(function (b) { b.addEventListener('click', function () { ir(b.getAttribute('data-ir')); }); });
    if (params.get('modo') === 'criar') ir('criar');

    $('#form-entrar').addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', this); btn.disabled = true;
      var r = await sb.auth.signInWithPassword({ email: this.email.value.trim(), password: this.senha.value });
      btn.disabled = false;
      if (r.error) return mostrar(aviso, 'erro', traduzErro(r.error));
      location.replace(volta);
    });

    $('#form-criar').addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = this;
      if (f.senha.value !== f.senha2.value) return mostrar(aviso, 'erro', 'As senhas não conferem.');
      if (f.senha.value.length < 8) return mostrar(aviso, 'erro', 'A senha precisa ter pelo menos 8 caracteres.');
      if (!f.aceite.checked) return mostrar(aviso, 'erro', 'Para continuar, aceite a Política de Privacidade.');
      var btn = $('button[type=submit]', f); btn.disabled = true;
      var r = await sb.auth.signUp({
        email: f.email.value.trim(),
        password: f.senha.value,
        options: {
          emailRedirectTo: ORIGEM + '/area.html',
          data: {
            nome: f.nome.value.trim(), telefone: f.telefone.value.trim(),
            tipo_pessoa: f.tipo_pessoa.value, cpf_cnpj: f.cpf_cnpj.value.trim(),
            crm: f.crm.value.trim(), crm_uf: f.crm_uf.value.trim(), aceite_lgpd: 'true'
          }
        }
      });
      btn.disabled = false;
      if (r.error) return mostrar(aviso, 'erro', traduzErro(r.error));
      if (r.data && r.data.session) { location.replace('/area.html'); return; }
      f.reset();
      ir('entrar');
      mostrar(aviso, 'ok', 'Conta criada! Enviamos um link de confirmação para ' + r.data.user.email + '. Abra o e-mail (veja também o spam) e clique no link para acessar sua área.');
    });

    $('#form-recuperar').addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', this); btn.disabled = true;
      var r = await sb.auth.resetPasswordForEmail(this.email.value.trim(), { redirectTo: ORIGEM + '/nova-senha.html' });
      btn.disabled = false;
      if (r.error) return mostrar(aviso, 'erro', traduzErro(r.error));
      mostrar(aviso, 'ok', 'Se esse e-mail tiver cadastro, você vai receber um link para criar uma nova senha.');
    });
  }

  /* ================= Página: nova senha ================= */
  async function paginaNovaSenha() {
    var aviso = $('#aviso');
    var form = $('#form-nova-senha');
    var pronto = false;
    sb.auth.onAuthStateChange(function (ev, s) { if (s) pronto = true; });
    var s = await sessaoAtual();
    if (s) pronto = true;
    setTimeout(function () {
      if (!pronto) mostrar(aviso, 'erro', 'Link inválido ou expirado. Peça um novo em "Esqueci minha senha".');
    }, 2500);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (form.senha.value !== form.senha2.value) return mostrar(aviso, 'erro', 'As senhas não conferem.');
      if (form.senha.value.length < 8) return mostrar(aviso, 'erro', 'A senha precisa ter pelo menos 8 caracteres.');
      var btn = $('button[type=submit]', form); btn.disabled = true;
      var r = await sb.auth.updateUser({ password: form.senha.value });
      btn.disabled = false;
      if (r.error) return mostrar(aviso, 'erro', traduzErro(r.error));
      form.hidden = true;
      mostrar(aviso, 'ok', 'Senha alterada! Redirecionando para sua área…');
      setTimeout(function () { location.replace('/area.html'); }, 1500);
    });
  }

  /* ================= Página: área do cliente ================= */
  async function paginaArea() {
    var sessao = await exigirLogin(); if (!sessao) return;
    var uid = sessao.user.id;
    var aviso = $('#aviso');
    var perfil = null;
    try { perfil = await carregarPerfil(uid); } catch (e) { mostrar(aviso, 'erro', traduzErro(e)); }
    montarCabecalho(perfil || { email: sessao.user.email }, 'area');
    if (perfil && perfil.nome) $('#ola').textContent = 'Olá, ' + perfil.nome.split(' ')[0];

    var ops = [];
    var filtro = 'todas';

    async function carregar() {
      var r = await sb.from('operacoes').select('*').order('criado_em', { ascending: false });
      if (r.error) { mostrar(aviso, 'erro', traduzErro(r.error)); return; }
      ops = r.data || [];
      render();
    }
    function render() {
      var andamento = ops.filter(function (o) { return GRUPO.andamento.indexOf(o.status) > -1; });
      var pagas = ops.filter(function (o) { return GRUPO.pagas.indexOf(o.status) > -1; });
      var totalPago = pagas.reduce(function (a, o) { return a + Number(o.valor_liquido || 0); }, 0);
      $('#stats').innerHTML =
        '<div class="stat"><span class="k">Em andamento</span><span class="v">' + andamento.length + '</span><span class="s">em análise ou aguardando você</span></div>' +
        '<div class="stat"><span class="k">Pagas</span><span class="v">' + pagas.length + '</span><span class="s">operações concluídas</span></div>' +
        '<div class="stat"><span class="k">Total já recebido</span><span class="v">' + brl(totalPago) + '</span><span class="s">antecipado na sua conta</span></div>';

      var lista = filtro === 'todas' ? ops : ops.filter(function (o) { return GRUPO[filtro].indexOf(o.status) > -1; });
      var box = $('#lista');
      if (!ops.length) {
        box.innerHTML = '<div class="empty"><h2>Nenhuma operação ainda</h2><p>Envie seu primeiro plantão para análise. Leva poucos minutos.</p><button class="btn btn-primary" type="button" data-nova>Nova operação</button></div>';
      } else if (!lista.length) {
        box.innerHTML = '<div class="empty"><p>Nenhuma operação neste filtro.</p></div>';
      } else {
        box.innerHTML = '<ul class="op-list">' + lista.map(function (o) {
          var valor = o.valor_liquido != null
            ? '<span class="k">' + (GRUPO.pagas.indexOf(o.status) > -1 ? 'Você recebeu' : 'Você recebe') + '</span><span class="v">' + brl(o.valor_liquido) + '</span>'
            : '<span class="k">Valor do plantão</span><span class="v">' + brl(o.valor_plantao) + '</span>';
          return '<li class="op"><div class="op-main"><div class="op-title"><span class="num">#' + esc(o.numero) + '</span>' + esc(o.hospital) + '</div>' +
            '<div class="op-meta"><span>Plantão: ' + esc(dataBR(o.data_plantao)) + '</span><span>Enviada em ' + esc(dataBR(o.criado_em)) + '</span>' +
            (o.pago_em ? '<span>Paga em ' + esc(dataBR(o.pago_em)) + '</span>' : '') + '</div>' +
            '<div>' + badge(o.status, 'cliente') + '</div></div>' +
            '<div class="op-side"><div class="op-valor">' + valor + '</div>' +
            '<button class="btn btn-outline btn-sm" type="button" data-ver="' + esc(o.id) + '">Ver detalhes</button></div></li>';
        }).join('') + '</ul>';
      }
      $$('[data-ver]', box).forEach(function (b) { b.addEventListener('click', function () { verOperacao(b.getAttribute('data-ver')); }); });
      $$('[data-nova]', box).forEach(function (b) { b.addEventListener('click', abrirNova); });
    }
    $$('[data-filtro]').forEach(function (c) {
      c.addEventListener('click', function () {
        filtro = c.getAttribute('data-filtro');
        $$('[data-filtro]').forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
        render();
      });
    });

    /* Nova operação */
    var dlgNova = $('#dlg-nova'); ligarFechar(dlgNova);
    function abrirNova() { $('#form-nova').reset(); esconder($('#aviso-nova')); abrirDialog(dlgNova); }
    $$('[data-nova]').forEach(function (b) { b.addEventListener('click', abrirNova); });
    $('#form-nova').addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = this, avisoN = $('#aviso-nova');
      var valor = parseValor(f.valor_plantao.value);
      if (!(valor > 0)) return mostrar(avisoN, 'erro', 'Informe o valor do plantão.');
      var arquivos = arquivosDe(f.comprovante, 'comprovante').concat(arquivosDe(f.pessoal, 'pessoal'), arquivosDe(f.outros, 'outro'));
      if (!arquivosDe(f.comprovante, 'comprovante').length) return mostrar(avisoN, 'erro', 'Anexe o comprovante do plantão (NF, RPA, escala ou folha de ponto).');
      var grande = arquivos.filter(function (a) { return a.file.size > MAX_MB * 1024 * 1024; })[0];
      if (grande) return mostrar(avisoN, 'erro', 'O arquivo "' + grande.file.name + '" passa de ' + MAX_MB + ' MB.');
      var btn = $('button[type=submit]', f); btn.disabled = true;
      mostrar(avisoN, 'info', 'Criando a operação…');
      var r = await sb.from('operacoes').insert({
        cliente_id: uid, hospital: f.hospital.value.trim(), data_plantao: f.data_plantao.value || null,
        valor_plantao: valor, previsao_pagamento: f.previsao_pagamento.value || null,
        observacao_cliente: f.observacao.value.trim() || null
      }).select('id, numero').single();
      if (r.error) { btn.disabled = false; return mostrar(avisoN, 'erro', traduzErro(r.error)); }
      try {
        await enviarArquivos(uid, r.data.id, arquivos, function (t) { mostrar(avisoN, 'info', t); });
      } catch (err) {
        btn.disabled = false;
        await carregar();
        return mostrar(avisoN, 'erro', 'A operação #' + r.data.numero + ' foi criada, mas um arquivo falhou: ' + traduzErro(err) + ' Você pode reenviar em "Ver detalhes".');
      }
      btn.disabled = false;
      fecharDialog(dlgNova);
      mostrar(aviso, 'ok', 'Operação #' + r.data.numero + ' enviada para análise! Você vai acompanhar o andamento por aqui.');
      await carregar();
    });

    /* Detalhes */
    var dlgVer = $('#dlg-ver'); ligarFechar(dlgVer);
    async function verOperacao(id) {
      var o = ops.filter(function (x) { return x.id === id; })[0]; if (!o) return;
      $('#ver-titulo').textContent = 'Operação #' + o.numero;
      var corpo = $('#ver-corpo');
      corpo.innerHTML = '<p class="loading">Carregando…</p>';
      abrirDialog(dlgVer);
      var res = await Promise.all([
        sb.from('documentos').select('*').eq('operacao_id', id).order('criado_em'),
        sb.from('historico').select('*').eq('operacao_id', id).order('criado_em')
      ]);
      var docs = res[0].data || [], hist = res[1].data || [];
      var podeEnviar = GRUPO.andamento.indexOf(o.status) > -1;
      corpo.innerHTML =
        '<div>' + badge(o.status, 'cliente') + '</div>' +
        '<div class="box"><h3>Resumo</h3><dl class="kv">' +
        '<div><dt>Hospital / pagador</dt><dd>' + esc(o.hospital) + '</dd></div>' +
        '<div><dt>Data do plantão</dt><dd>' + esc(dataBR(o.data_plantao)) + '</dd></div>' +
        '<div><dt>Valor do plantão</dt><dd>' + brl(o.valor_plantao) + '</dd></div>' +
        '<div><dt>Você recebe</dt><dd>' + (o.valor_liquido != null ? brl(o.valor_liquido) : 'em análise') + '</dd></div>' +
        '<div><dt>Previsão de pagamento do hospital</dt><dd>' + esc(dataBR(o.previsao_pagamento)) + '</dd></div>' +
        '<div><dt>Pago a você em</dt><dd>' + esc(dataBR(o.pago_em)) + '</dd></div>' +
        '</dl>' + (o.observacao_cliente ? '<p class="small">Sua observação: ' + esc(o.observacao_cliente) + '</p>' : '') + '</div>' +
        '<div class="box"><h3>Documentos</h3>' + renderDocs(docs) +
        (podeEnviar ? '<form id="form-mais" class="stack-form"><div class="field"><label for="mais-arq">Enviar mais documentos <span class="hint">PDF, JPG ou PNG, até ' + MAX_MB + ' MB cada</span></label><input id="mais-arq" name="arq" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,application/pdf,image/*" required></div><button class="btn btn-outline btn-sm" type="submit">Enviar</button><div class="alert" hidden id="aviso-mais"></div></form>' : '') +
        '</div>' +
        '<div class="box"><h3>Andamento</h3>' + renderTimeline(hist, 'cliente') + '</div>';
      ligarAbrirDocs(corpo);
      var fm = $('#form-mais', corpo);
      if (fm) fm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var am = $('#aviso-mais', corpo), b = $('button', fm); b.disabled = true;
        try {
          await enviarArquivos(uid, id, arquivosDe(fm.arq, 'outro'), function (t) { mostrar(am, 'info', t); });
          await verOperacao(id);
        } catch (err) { b.disabled = false; mostrar(am, 'erro', traduzErro(err)); }
      });
    }

    await carregar();
  }

  /* ================= Página: admin ================= */
  async function paginaAdmin() {
    var sessao = await exigirLogin(); if (!sessao) return;
    var aviso = $('#aviso');
    var perfil = null;
    try { perfil = await carregarPerfil(sessao.user.id); } catch (e) { /* abaixo */ }
    if (!perfil || perfil.papel !== 'admin') { location.replace('/area.html'); return; }
    montarCabecalho(perfil, 'admin');

    var ops = [], clientes = [];
    var sel = $('#filtro-status'), busca = $('#busca');
    sel.innerHTML = '<option value="">Todos os status</option>' + Object.keys(STATUS).map(function (k) {
      return '<option value="' + k + '">' + esc(STATUS[k].admin) + '</option>';
    }).join('');

    async function carregar() {
      var res = await Promise.all([
        sb.from('operacoes').select('*, perfis(nome, email, telefone, crm, crm_uf, cpf_cnpj, tipo_pessoa)').order('criado_em', { ascending: false }),
        sb.from('perfis').select('*').order('criado_em', { ascending: false })
      ]);
      if (res[0].error) return mostrar(aviso, 'erro', traduzErro(res[0].error));
      ops = res[0].data || []; clientes = res[1].data || [];
      renderStats(); renderOps(); renderClientes();
    }
    function soma(lista, campo) { return lista.reduce(function (a, o) { return a + Number(o[campo] || 0); }, 0); }
    function renderStats() {
      function por(st) { return ops.filter(function (o) { return st.indexOf(o.status) > -1; }); }
      var analise = por(['em_analise', 'pendente_documentos']);
      var assinatura = por(['aguardando_assinatura', 'aprovada']);
      var aReceber = por(['paga', 'atrasada']);
      var atrasadas = por(['atrasada']);
      var pagas = por(GRUPO.pagas);
      $('#stats').innerHTML =
        '<div class="stat"><span class="k">Para analisar</span><span class="v">' + analise.length + '</span><span class="s">em análise ou com pendência</span></div>' +
        '<div class="stat"><span class="k">Assinatura / pagamento</span><span class="v">' + assinatura.length + '</span><span class="s">aguardando assinatura ou Pix</span></div>' +
        '<div class="stat"><span class="k">A receber dos hospitais</span><span class="v">' + brl(soma(aReceber, 'valor_plantao')) + '</span><span class="s">' + aReceber.length + ' operações em aberto</span></div>' +
        '<div class="stat"><span class="k">Em atraso</span><span class="v">' + atrasadas.length + '</span><span class="s">' + brl(soma(atrasadas, 'valor_plantao')) + '</span></div>' +
        '<div class="stat"><span class="k">Total antecipado</span><span class="v">' + brl(soma(pagas, 'valor_liquido')) + '</span><span class="s">' + pagas.length + ' operações pagas</span></div>';
    }
    function renderOps() {
      var st = sel.value, q = busca.value.trim().toLowerCase();
      var lista = ops.filter(function (o) {
        if (st && o.status !== st) return false;
        if (!q) return true;
        var p = o.perfis || {};
        return [o.numero, o.hospital, p.nome, p.email, p.crm, p.cpf_cnpj].join(' ').toLowerCase().indexOf(q) > -1;
      });
      $('#cont-ops').textContent = lista.length + ' de ' + ops.length;
      if (!lista.length) { $('#tabela-ops').innerHTML = '<div class="empty"><p>Nenhuma operação encontrada.</p></div>'; return; }
      $('#tabela-ops').innerHTML = '<div class="table-box"><table class="grid-table"><thead><tr>' +
        '<th>Nº</th><th>Enviada</th><th>Médico</th><th>Hospital</th><th class="num">Valor plantão</th><th class="num">Valor líquido</th><th>Previsão</th><th>Status</th><th><span class="sr">Ação</span></th>' +
        '</tr></thead><tbody>' + lista.map(function (o) {
          var p = o.perfis || {};
          return '<tr><td>#' + esc(o.numero) + '</td><td>' + esc(dataBR(o.criado_em)) + '</td>' +
            '<td>' + esc(p.nome || '—') + '<span class="sub">' + esc(p.crm ? 'CRM ' + p.crm + (p.crm_uf ? '/' + p.crm_uf : '') : (p.email || '')) + '</span></td>' +
            '<td>' + esc(o.hospital) + '</td><td class="num">' + brl(o.valor_plantao) + '</td><td class="num">' + brl(o.valor_liquido) + '</td>' +
            '<td>' + esc(dataBR(o.previsao_pagamento)) + '</td><td>' + badge(o.status, 'admin') + '</td>' +
            '<td><button class="linkish" type="button" data-abrir-op="' + esc(o.id) + '">Abrir</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      $$('[data-abrir-op]').forEach(function (b) { b.addEventListener('click', function () { abrirOp(b.getAttribute('data-abrir-op')); }); });
    }
    function renderClientes() {
      var cont = {};
      ops.forEach(function (o) { cont[o.cliente_id] = (cont[o.cliente_id] || 0) + 1; });
      $('#tabela-clientes').innerHTML = !clientes.length ? '<div class="empty"><p>Nenhum cliente cadastrado.</p></div>' :
        '<div class="table-box"><table class="grid-table"><thead><tr><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>CRM</th><th>Tipo</th><th>CPF/CNPJ</th><th>Cadastro</th><th class="num">Operações</th></tr></thead><tbody>' +
        clientes.map(function (c) {
          return '<tr><td>' + esc(c.nome || '—') + (c.papel === 'admin' ? ' <span class="badge info">admin</span>' : '') + '</td><td>' + esc(c.email) + '</td><td>' + esc(c.telefone || '—') + '</td>' +
            '<td>' + esc(c.crm ? c.crm + (c.crm_uf ? '/' + c.crm_uf : '') : '—') + '</td><td>' + esc(c.tipo_pessoa || '—') + '</td><td>' + esc(c.cpf_cnpj || '—') + '</td>' +
            '<td>' + esc(dataBR(c.criado_em)) + '</td><td class="num">' + (cont[c.id] || 0) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    sel.addEventListener('change', renderOps);
    busca.addEventListener('input', renderOps);
    $$('.page-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        $$('.page-tab').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        $('#aba-ops').hidden = t.getAttribute('data-aba') !== 'ops';
        $('#aba-clientes').hidden = t.getAttribute('data-aba') !== 'clientes';
      });
    });

    var dlg = $('#dlg-op'); ligarFechar(dlg);
    function okOp(msg) { var el = $('#aviso-op'); mostrar(el, 'ok', msg); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
    async function abrirOp(id) {
      var o = ops.filter(function (x) { return x.id === id; })[0]; if (!o) return;
      var p = o.perfis || {};
      $('#op-titulo').textContent = 'Operação #' + o.numero;
      var corpo = $('#op-corpo');
      corpo.innerHTML = '<p class="loading">Carregando…</p>';
      if (!dlg.open) abrirDialog(dlg);
      var res = await Promise.all([
        sb.from('documentos').select('*').eq('operacao_id', id).order('criado_em'),
        sb.from('historico').select('*').eq('operacao_id', id).order('criado_em'),
        sb.from('operacoes_interno').select('*').eq('operacao_id', id).maybeSingle()
      ]);
      var docs = res[0].data || [], hist = res[1].data || [], interno = res[2].data || {};
      var opcoes = Object.keys(STATUS).map(function (k) {
        return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + esc(STATUS[k].admin) + '</option>';
      }).join('');
      corpo.innerHTML =
        '<div class="alert" hidden id="aviso-op"></div>' +
        '<div class="box"><h3>Médico</h3><dl class="kv">' +
        '<div><dt>Nome</dt><dd>' + esc(p.nome || '—') + '</dd></div>' +
        '<div><dt>E-mail</dt><dd>' + esc(p.email || '—') + '</dd></div>' +
        '<div><dt>WhatsApp</dt><dd>' + esc(p.telefone || '—') + '</dd></div>' +
        '<div><dt>CRM</dt><dd>' + esc(p.crm ? p.crm + (p.crm_uf ? '/' + p.crm_uf : '') : '—') + '</dd></div>' +
        '<div><dt>' + esc(p.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF') + '</dt><dd>' + esc(p.cpf_cnpj || '—') + '</dd></div>' +
        '</dl></div>' +
        '<div class="box"><h3>Operação</h3><dl class="kv">' +
        '<div><dt>Hospital / pagador</dt><dd>' + esc(o.hospital) + '</dd></div>' +
        '<div><dt>Data do plantão</dt><dd>' + esc(dataBR(o.data_plantao)) + '</dd></div>' +
        '<div><dt>Valor do plantão (informado)</dt><dd>' + brl(o.valor_plantao) + '</dd></div>' +
        '<div><dt>Enviada em</dt><dd>' + esc(dataHoraBR(o.criado_em)) + '</dd></div>' +
        '</dl>' + (o.observacao_cliente ? '<p class="small">Observação do médico: ' + esc(o.observacao_cliente) + '</p>' : '') + '</div>' +
        '<form class="box" id="form-op"><h3>Atualizar</h3><div class="row-2">' +
        '<div class="field"><label for="f-status">Status</label><select id="f-status" name="status">' + opcoes + '</select></div>' +
        '<div class="field"><label for="f-liq">Valor líquido ao médico (R$)</label><input id="f-liq" name="valor_liquido" inputmode="decimal" value="' + esc(o.valor_liquido != null ? String(o.valor_liquido).replace('.', ',') : '') + '"></div>' +
        '<div class="field"><label for="f-prev">Previsão de pagamento do hospital</label><input id="f-prev" name="previsao_pagamento" type="date" value="' + esc(o.previsao_pagamento || '') + '"></div>' +
        '<div class="field"><label for="f-pago">Pago ao médico em</label><input id="f-pago" name="pago_em" type="date" value="' + esc(o.pago_em || '') + '"></div>' +
        '</div><button class="btn btn-primary btn-sm" type="submit">Salvar alterações</button></form>' +
        '<form class="box" id="form-msg"><h3>Mensagem para o médico</h3><div class="field"><label for="f-msg">Aparece no andamento da operação, na área dele</label><textarea id="f-msg" name="msg" required placeholder="Ex.: Falta a escala assinada do plantão de 12/11."></textarea></div><button class="btn btn-outline btn-sm" type="submit">Enviar mensagem</button></form>' +
        '<form class="box" id="form-interno"><h3>Controle interno (o médico não vê)</h3><div class="row-2">' +
        '<div class="field"><label for="f-rec">Valor recebido do hospital (R$)</label><input id="f-rec" name="valor_recebido" inputmode="decimal" value="' + esc(interno.valor_recebido != null ? String(interno.valor_recebido).replace('.', ',') : '') + '"></div>' +
        '<div class="field"><label for="f-rece">Recebido em</label><input id="f-rece" name="recebido_em" type="date" value="' + esc(interno.recebido_em || '') + '"></div>' +
        '</div><div class="field"><label for="f-nota">Notas internas</label><textarea id="f-nota" name="nota">' + esc(interno.nota_interna || '') + '</textarea></div>' +
        '<button class="btn btn-outline btn-sm" type="submit">Salvar controle interno</button></form>' +
        '<div class="box"><h3>Documentos</h3>' + renderDocs(docs) +
        '<form id="form-doc" class="row-2"><div class="field"><label for="f-tipo">Tipo</label><select id="f-tipo" name="tipo"><option value="contrato">Contrato</option><option value="comprovante">Comprovante do plantão</option><option value="pessoal">Documento pessoal</option><option value="outro">Outro</option></select></div>' +
        '<div class="field"><label for="f-arq">Anexar arquivo</label><input id="f-arq" name="arq" type="file" multiple required accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,application/pdf,image/*"></div>' +
        '<div><button class="btn btn-outline btn-sm" type="submit">Anexar</button></div></form></div>' +
        '<div class="box"><h3>Histórico</h3>' + renderTimeline(hist, 'admin') + '</div>';
      ligarAbrirDocs(corpo);
      var av = $('#aviso-op', corpo);

      $('#form-op', corpo).addEventListener('submit', async function (e) {
        e.preventDefault();
        var f = this, liq = f.valor_liquido.value.trim();
        var r = await sb.from('operacoes').update({
          status: f.status.value,
          valor_liquido: liq ? parseValor(liq) : null,
          previsao_pagamento: f.previsao_pagamento.value || null,
          pago_em: f.pago_em.value || null
        }).eq('id', id);
        if (r.error) return mostrar(av, 'erro', traduzErro(r.error));
        await carregar(); await abrirOp(id);
        okOp('Operação atualizada.');
      });
      $('#form-msg', corpo).addEventListener('submit', async function (e) {
        e.preventDefault();
        var r = await sb.from('historico').insert({ operacao_id: id, evento: 'Mensagem', detalhe: this.msg.value.trim() });
        if (r.error) return mostrar(av, 'erro', traduzErro(r.error));
        await abrirOp(id);
        okOp('Mensagem enviada. O médico vê no andamento da operação.');
      });
      $('#form-interno', corpo).addEventListener('submit', async function (e) {
        e.preventDefault();
        var f = this, rec = f.valor_recebido.value.trim();
        var r = await sb.from('operacoes_interno').upsert({
          operacao_id: id, nota_interna: f.nota.value.trim() || null,
          valor_recebido: rec ? parseValor(rec) : null, recebido_em: f.recebido_em.value || null,
          atualizado_em: new Date().toISOString()
        });
        if (r.error) return mostrar(av, 'erro', traduzErro(r.error));
        mostrar(av, 'ok', 'Controle interno salvo.');
      });
      $('#form-doc', corpo).addEventListener('submit', async function (e) {
        e.preventDefault();
        var f = this, b = $('button', f); b.disabled = true;
        try {
          await enviarArquivos(o.cliente_id, id, arquivosDe(f.arq, f.tipo.value), function (t) { mostrar(av, 'info', t); });
          await abrirOp(id);
          okOp('Arquivo anexado.');
        } catch (err) { b.disabled = false; mostrar(av, 'erro', traduzErro(err)); }
      });
    }

    await carregar();
  }

  /* ================= Início ================= */
  document.addEventListener('DOMContentLoaded', function () {
    var pagina = document.body.getAttribute('data-page');
    if (!sb) {
      var a = $('#aviso');
      mostrar(a, 'erro', configurado
        ? 'Não foi possível carregar o Supabase. Verifique sua conexão e recarregue a página.'
        : 'Portal ainda não configurado: preencha a URL e a chave do Supabase no arquivo config.js.');
      return;
    }
    var fn = { entrar: paginaEntrar, 'nova-senha': paginaNovaSenha, area: paginaArea, admin: paginaAdmin }[pagina];
    if (fn) fn().catch(function (e) { mostrar($('#aviso'), 'erro', traduzErro(e)); });
  });
})();
