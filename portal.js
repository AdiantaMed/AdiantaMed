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
    aguardando_assinatura: { admin: 'Aguardando assinaturas',  cliente: 'Contrato enviado · assine pelo e-mail', tom: 'warn' },
    assinada:              { admin: 'Assinada · pagar médico', cliente: 'Assinada · pagamento em andamento',  tom: 'info' },
    aprovada:              { admin: 'Aprovada',                cliente: 'Aprovada · pagamento em preparação', tom: 'info' },
    paga:                  { admin: 'Paga ao médico',          cliente: 'Paga',                               tom: 'ok' },
    liquidada:             { admin: 'Liquidada (hospital pagou)', cliente: 'Paga',                            tom: 'ok' },
    atrasada:              { admin: 'Hospital em atraso',      cliente: 'Paga',                               tom: 'danger' },
    recusada:              { admin: 'Recusada',                cliente: 'Não aprovada',                       tom: 'muted' },
    cancelada:             { admin: 'Cancelada',               cliente: 'Cancelada',                          tom: 'muted' }
  };
  var GRUPO = {
    andamento: ['em_analise', 'pendente_documentos', 'aguardando_assinatura', 'assinada', 'aprovada'],
    pagas: ['paga', 'liquidada', 'atrasada'],
    encerradas: ['recusada', 'cancelada']
  };
  function badge(status, visao) {
    var s = STATUS[status] || { admin: status, cliente: status, tom: 'muted' };
    var tom = visao === 'cliente' && GRUPO.pagas.indexOf(status) > -1 ? 'ok' : s.tom;
    return '<span class="badge ' + tom + '">' + esc(s[visao]) + '</span>';
  }
  var TIPOS_DOC = { comprovante: 'Comprovante do plantão', pessoal: 'Documento pessoal', identidade: 'RG / CNH', cnpj: 'Cartão CNPJ / contrato social', contrato: 'Contrato', outro: 'Outro' };

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
      var caminho = clienteId + '/' + (operacaoId || 'cadastro') + '/' + Date.now() + '-' + lista[i].tipo + '-' + nomeSeguro(f.name);
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

  /* ================= Cadastro do médico (dados para o contrato) ================= */
  var ESTADOS_CIVIS = ['solteiro(a)', 'casado(a)', 'divorciado(a)', 'viúvo(a)', 'em união estável', 'separado(a)'];
  var UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  function opcoesHtml(lista, atual, vazio) {
    return (vazio ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(function (v) {
      return '<option' + (v === atual ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }
  function faltandoNoCadastro(p, docsCadastro) {
    var f = [];
    if (!p) return ['todos os dados'];
    function req(campo, rotulo) { if (!String(p[campo] || '').trim()) f.push(rotulo); }
    req('tipo_pessoa', 'tipo (PF ou PJ)'); req('nome', 'nome completo'); req('nacionalidade', 'nacionalidade');
    req('estado_civil', 'estado civil'); req('cpf', 'CPF'); req('rg', 'RG'); req('rg_orgao', 'órgão emissor do RG');
    req('crm', 'CRM'); req('crm_uf', 'UF do CRM');
    if (p.tipo_pessoa === 'PJ') { req('razao_social', 'razão social da empresa'); req('cnpj', 'CNPJ'); }
    req('cep', 'CEP'); req('logradouro', 'endereço'); req('numero', 'número'); req('bairro', 'bairro');
    req('cidade', 'cidade'); req('uf', 'UF'); req('telefone', 'WhatsApp');
    if (!String(p.pix || '').trim() && !(p.banco && p.agencia && p.conta)) f.push('conta bancária ou chave Pix');
    if (docsCadastro && !docsCadastro.some(function (d) { return d.tipo === 'identidade'; })) f.push('cópia do RG ou CNH');
    return f;
  }
  function enderecoCompleto(p) {
    var l = [p.logradouro, p.numero].filter(Boolean).join(', ');
    if (p.complemento) l += ' – ' + p.complemento;
    var c = [p.bairro, [p.cidade, p.uf].filter(Boolean).join('/')].filter(Boolean).join(', ');
    return [l, c, p.cep ? 'CEP ' + p.cep : ''].filter(Boolean).join(', ');
  }
  function campo(id, nome, rotulo, valor, extra) {
    return '<div class="field"><label for="' + id + '">' + rotulo + '</label><input id="' + id + '" name="' + nome + '" value="' + esc(valor || '') + '" ' + (extra || '') + '></div>';
  }
  function htmlFormCadastro(p, docsCadastro) {
    p = p || {};
    var pj = p.tipo_pessoa === 'PJ';
    var cpf = p.cpf || (!pj ? p.cpf_cnpj : '');
    var cnpj = p.cnpj || (pj ? p.cpf_cnpj : '');
    var temId = (docsCadastro || []).some(function (d) { return d.tipo === 'identidade'; });
    return '' +
      '<div class="box"><h3>Identificação</h3>' +
      '<div class="row-2"><div class="field"><label for="d-tipo">Você recebe como</label><select id="d-tipo" name="tipo_pessoa" required>' +
      '<option value="PJ"' + (pj ? ' selected' : '') + '>Empresa (PJ)</option><option value="PF"' + (!pj ? ' selected' : '') + '>Pessoa física (RPA)</option></select></div>' +
      campo('d-nome', 'nome', 'Nome completo', p.nome, 'required autocomplete="name"') + '</div>' +
      '<div class="row-2">' + campo('d-nac', 'nacionalidade', 'Nacionalidade', p.nacionalidade || 'brasileira', 'required') +
      '<div class="field"><label for="d-ec">Estado civil</label><select id="d-ec" name="estado_civil" required>' + opcoesHtml(ESTADOS_CIVIS, p.estado_civil, 'Selecione') + '</select></div></div>' +
      '<div class="row-2">' + campo('d-cpf', 'cpf', 'CPF', cpf, 'required inputmode="numeric"') +
      campo('d-rg', 'rg', 'RG', p.rg, 'required') + campo('d-rgo', 'rg_orgao', 'Órgão emissor', p.rg_orgao, 'required placeholder="SSP/SP"') + '</div>' +
      '<div class="row-2">' + campo('d-crm', 'crm', 'CRM', p.crm, 'required inputmode="numeric"') +
      '<div class="field"><label for="d-crmuf">UF do CRM</label><select id="d-crmuf" name="crm_uf" required>' + opcoesHtml(UFS, p.crm_uf, 'UF') + '</select></div></div>' +
      '</div>' +
      '<div class="box" data-pj' + (pj ? '' : ' hidden') + '><h3>Sua empresa</h3><div class="row-2">' +
      campo('d-rs', 'razao_social', 'Razão social', p.razao_social) + campo('d-cnpj', 'cnpj', 'CNPJ', cnpj, 'inputmode="numeric"') + '</div>' +
      '<p class="small">O contrato sai no nome da empresa, e você assina como representante.</p></div>' +
      '<div class="box"><h3 data-end-titulo>' + (pj ? 'Endereço da empresa' : 'Seu endereço') + '</h3><div class="row-2">' +
      campo('d-cep', 'cep', 'CEP', p.cep, 'required inputmode="numeric" autocomplete="postal-code"') +
      campo('d-log', 'logradouro', 'Rua / avenida', p.logradouro, 'required') + '</div><div class="row-2">' +
      campo('d-num', 'numero', 'Número', p.numero, 'required') + campo('d-comp', 'complemento', 'Complemento', p.complemento) +
      campo('d-bai', 'bairro', 'Bairro', p.bairro, 'required') + '</div><div class="row-2">' +
      campo('d-cid', 'cidade', 'Cidade', p.cidade, 'required') +
      '<div class="field"><label for="d-uf">UF</label><select id="d-uf" name="uf" required>' + opcoesHtml(UFS, p.uf, 'UF') + '</select></div>' +
      campo('d-tel', 'telefone', 'WhatsApp', p.telefone, 'required type="tel" autocomplete="tel"') + '</div></div>' +
      '<div class="box"><h3>Onde você recebe o pagamento</h3><p class="small">A conta precisa estar no seu nome' + (pj ? ' ou no da sua empresa' : '') + '. Preencha a chave Pix ou os dados da conta.</p>' +
      '<div class="row-2">' + campo('d-pix', 'pix', 'Chave Pix', p.pix) + campo('d-banco', 'banco', 'Banco', p.banco) + '</div>' +
      '<div class="row-2">' + campo('d-ag', 'agencia', 'Agência', p.agencia, 'inputmode="numeric"') + campo('d-cc', 'conta', 'Conta com dígito', p.conta) +
      '<div class="field"><label for="d-tc">Tipo de conta</label><select id="d-tc" name="tipo_conta">' + opcoesHtml(['corrente', 'poupança', 'pagamento'], p.tipo_conta, '—') + '</select></div></div></div>' +
      '<div class="box"><h3>Documentos</h3>' +
      (docsCadastro && docsCadastro.length ? renderDocs(docsCadastro) : '') +
      '<div class="field"><label for="d-docid">Cópia do RG ou CNH <span class="hint">' + (temId ? 'já enviada · envie outra só se precisar trocar' : 'frente e verso · obrigatório') + '</span></label>' +
      '<input id="d-docid" name="doc_identidade" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,application/pdf,image/*"' + (temId ? '' : ' required') + '></div>' +
      '<div class="field" data-pj' + (pj ? '' : ' hidden') + '><label for="d-doccnpj">Cartão CNPJ ou contrato social <span class="hint">opcional</span></label>' +
      '<input id="d-doccnpj" name="doc_cnpj" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,application/pdf,image/*"></div></div>';
  }
  function ligarFormCadastro(form) {
    var tipo = form.tipo_pessoa;
    function alterna() {
      var pj = tipo.value === 'PJ';
      $$('[data-pj]', form).forEach(function (el) { el.hidden = !pj; });
      form.razao_social.required = pj; form.cnpj.required = pj;
      var t = $('[data-end-titulo]', form); if (t) t.textContent = pj ? 'Endereço da empresa' : 'Seu endereço';
    }
    tipo.addEventListener('change', alterna); alterna();
    form.cep.addEventListener('blur', async function () {
      var cep = form.cep.value.replace(/\D/g, '');
      if (cep.length !== 8) return;
      try {
        var r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
        var j = await r.json();
        if (j.erro) return;
        if (!form.logradouro.value) form.logradouro.value = j.logradouro || '';
        if (!form.bairro.value) form.bairro.value = j.bairro || '';
        if (!form.cidade.value) form.cidade.value = j.localidade || '';
        if (!form.uf.value && j.uf) form.uf.value = j.uf;
        if (!form.numero.value) form.numero.focus();
      } catch (e) { /* sem internet ou ViaCEP fora: segue manual */ }
    });
  }
  var CAMPOS_CADASTRO = ['tipo_pessoa', 'nome', 'nacionalidade', 'estado_civil', 'cpf', 'rg', 'rg_orgao', 'crm', 'crm_uf',
    'razao_social', 'cnpj', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'telefone',
    'pix', 'banco', 'agencia', 'conta', 'tipo_conta'];
  function lerFormCadastro(form) {
    var o = {};
    CAMPOS_CADASTRO.forEach(function (k) { if (form[k]) o[k] = String(form[k].value || '').trim() || null; });
    if (o.tipo_pessoa !== 'PJ') { o.razao_social = null; o.cnpj = null; }
    o.cpf_cnpj = o.tipo_pessoa === 'PJ' ? o.cnpj : o.cpf;
    return o;
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

    var docsCadastro = [];
    async function carregarDocsCadastro() {
      var r = await sb.from('documentos').select('*').eq('cliente_id', uid).is('operacao_id', null).order('criado_em');
      docsCadastro = r.data || [];
    }
    await carregarDocsCadastro();

    /* Meus dados (dados do contrato) */
    var dlgDados = $('#dlg-dados'); ligarFechar(dlgDados);
    var depoisDeSalvar = null;
    function abrirDados(motivo, continuar) {
      depoisDeSalvar = continuar || null;
      var nota = $('#dados-nota');
      if (motivo) mostrar(nota, 'info', motivo); else esconder(nota);
      esconder($('#aviso-dados'));
      $('#dados-campos').innerHTML = htmlFormCadastro(perfil, docsCadastro);
      ligarAbrirDocs($('#dados-campos'));
      ligarFormCadastro($('#form-dados'));
      abrirDialog(dlgDados);
    }
    $$('[data-dados]').forEach(function (b) { b.addEventListener('click', function () { abrirDados(); }); });
    $('#form-dados').addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = this, av = $('#aviso-dados');
      var dados = lerFormCadastro(f);
      var novosId = arquivosDe(f.doc_identidade, 'identidade');
      var novosCnpj = dados.tipo_pessoa === 'PJ' ? arquivosDe(f.doc_cnpj, 'cnpj') : [];
      var docsDepois = docsCadastro.concat(novosId.map(function () { return { tipo: 'identidade' }; }));
      var falta = faltandoNoCadastro(Object.assign({}, perfil, dados), docsDepois);
      if (falta.length) return mostrar(av, 'erro', 'Falta preencher: ' + falta.join(', ') + '.');
      var btn = $('button[type=submit]', f); btn.disabled = true;
      try {
        await enviarArquivos(uid, null, novosId.concat(novosCnpj), function (t) { mostrar(av, 'info', t); });
        dados.cadastro_completo_em = new Date().toISOString();
        var r = await sb.from('perfis').update(dados).eq('id', uid);
        if (r.error) throw r.error;
        perfil = await carregarPerfil(uid);
        await carregarDocsCadastro();
      } catch (err) { btn.disabled = false; return mostrar(av, 'erro', traduzErro(err)); }
      btn.disabled = false;
      fecharDialog(dlgDados);
      if (depoisDeSalvar) { var c = depoisDeSalvar; depoisDeSalvar = null; c(); }
      else mostrar(aviso, 'ok', 'Seus dados foram salvos.');
    });

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
            (o.status === 'aguardando_assinatura' && o.link_assinatura ? '<a class="btn btn-primary btn-sm" href="' + esc(o.link_assinatura) + '" target="_blank" rel="noopener">Assinar contrato</a>' : '') +
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
    function abrirNova() {
      var falta = faltandoNoCadastro(perfil, docsCadastro);
      if (falta.length) {
        return abrirDados('Antes da sua primeira operação, complete os dados que vão no contrato de cessão. Você só faz isso uma vez: nas próximas, já fica tudo salvo.', abrirNovaForm);
      }
      abrirNovaForm();
    }
    function hospitaisAnteriores() {
      var vistos = {};
      ops.forEach(function (o) { if (o.hospital && !vistos[o.hospital]) vistos[o.hospital] = o; });
      return vistos;
    }
    function abrirNovaForm() {
      var f = $('#form-nova'); f.reset(); f.hidden = false; $('#nova-ok').hidden = true; esconder($('#aviso-nova'));
      var hs = hospitaisAnteriores();
      $('#lista-hospitais').innerHTML = Object.keys(hs).map(function (h) { return '<option value="' + esc(h) + '">'; }).join('');
      abrirDialog(dlgNova);
    }
    $$('[data-fechar-nova]').forEach(function (b) { b.addEventListener('click', function () { fecharDialog(dlgNova); }); });
    $('#n-hosp').addEventListener('change', function () {
      var f = $('#form-nova'), o = hospitaisAnteriores()[this.value.trim()];
      if (!o) return;
      if (!f.hospital_cnpj.value && o.hospital_cnpj) f.hospital_cnpj.value = o.hospital_cnpj;
      if (!f.hospital_endereco.value && o.hospital_endereco) f.hospital_endereco.value = o.hospital_endereco;
      if (!f.hospital_contato_nome.value && o.hospital_contato_nome) f.hospital_contato_nome.value = o.hospital_contato_nome;
      if (!f.hospital_contato_email.value && o.hospital_contato_email) f.hospital_contato_email.value = o.hospital_contato_email;
    });
    $$('[data-nova]').forEach(function (b) { b.addEventListener('click', abrirNova); });
    $('#form-nova').addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = this, avisoN = $('#aviso-nova');
      var valor = parseValor(f.valor_plantao.value);
      if (!(valor > 0)) return mostrar(avisoN, 'erro', 'Informe o valor do plantão.');
      var arquivos = arquivosDe(f.comprovante, 'comprovante').concat(arquivosDe(f.outros, 'outro'));
      if (!arquivosDe(f.comprovante, 'comprovante').length) return mostrar(avisoN, 'erro', 'Anexe o comprovante do plantão (NF, RPA, escala ou folha de ponto).');
      var grande = arquivos.filter(function (a) { return a.file.size > MAX_MB * 1024 * 1024; })[0];
      if (grande) return mostrar(avisoN, 'erro', 'O arquivo "' + grande.file.name + '" passa de ' + MAX_MB + ' MB.');
      var btn = $('button[type=submit]', f); btn.disabled = true;
      mostrar(avisoN, 'info', 'Criando a operação…');
      var r = await sb.from('operacoes').insert({
        cliente_id: uid, hospital: f.hospital.value.trim(), data_plantao: f.data_plantao.value || null,
        valor_plantao: valor, previsao_pagamento: f.previsao_pagamento.value || null,
        observacao_cliente: f.observacao.value.trim() || null,
        hospital_cnpj: f.hospital_cnpj.value.trim() || null,
        hospital_endereco: f.hospital_endereco.value.trim() || null,
        documento_fiscal: f.documento_fiscal.value.trim() || null,
        hospital_contato_nome: f.hospital_contato_nome.value.trim() || null,
        hospital_contato_email: f.hospital_contato_email.value.trim() || null
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
      f.hidden = true;
      $('#nova-ok-num').textContent = '#' + r.data.numero;
      $('#nova-ok').hidden = false;
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
      var topo = '';
      if (o.status === 'aguardando_assinatura' && o.link_assinatura) topo = '<div class="box acao destaque"><h3>Falta a sua assinatura</h3><p>O contrato de cessão desta operação está pronto. Assine pelo link que enviamos por e-mail ou direto aqui:</p><div><a class="btn btn-primary" href="' + esc(o.link_assinatura) + '" target="_blank" rel="noopener">Assinar contrato</a></div></div>';
      else if (o.status === 'em_analise') topo = '<div class="alert alert-info">Recebemos seus documentos e a operação está em análise. Você recebe uma mensagem aqui assim que o contrato estiver pronto para assinar.</div>';
      else if (o.status === 'pendente_documentos') topo = '<div class="alert alert-erro">Precisamos de um ajuste ou documento. Veja a mensagem no andamento abaixo e envie o que falta.</div>';
      else if (o.status === 'assinada') topo = '<div class="alert alert-info">Contrato assinado por todas as partes. O pagamento está sendo feito na sua conta.</div>';
      else if (o.status === 'recusada') topo = '<div class="alert alert-erro">Esta operação não foi aprovada' + (o.motivo_recusa ? ': ' + esc(o.motivo_recusa) : '.') + '</div>';
      corpo.innerHTML =
        '<div>' + badge(o.status, 'cliente') + '</div>' + topo +
        '<div class="box"><h3>Resumo</h3><dl class="kv">' +
        '<div><dt>Hospital / pagador</dt><dd>' + esc(o.hospital) + (o.hospital_cnpj ? '<br><span class="small">CNPJ ' + esc(o.hospital_cnpj) + '</span>' : '') + '</dd></div>' +
        '<div><dt>Nota fiscal / RPA</dt><dd>' + esc(o.documento_fiscal || '—') + '</dd></div>' +
        '<div><dt>Assina pelo hospital</dt><dd>' + esc(o.hospital_contato_nome || o.hospital_contato_email ? [o.hospital_contato_nome, o.hospital_contato_email].filter(Boolean).join(' · ') : 'a adiantaMed vai confirmar') + '</dd></div>' +
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

  /* ================= Página: admin (fluxo por etapas) ================= */
  var ETAPAS = {
    analise: ['em_analise', 'pendente_documentos', 'aprovada'],
    assinatura: ['aguardando_assinatura'],
    pagamento: ['assinada'],
    historico: ['paga', 'liquidada', 'atrasada', 'recusada', 'cancelada']
  };
  var ROTULO_ETAPA = { analise: 'Em análise', assinatura: 'Aguardando assinaturas', pagamento: 'Efetuar pagamento', historico: 'Histórico' };
  function etapaDe(st) { for (var k in ETAPAS) { if (ETAPAS[k].indexOf(st) > -1) return k; } return 'analise'; }
  function digitos(s) { return String(s || '').replace(/\D/g, ''); }
  function contaTexto(p) {
    return [p.pix ? 'Pix: ' + p.pix : '', p.banco ? p.banco + ' · ag. ' + (p.agencia || '—') + ' · conta ' + (p.conta || '—') + (p.tipo_conta ? ' (' + p.tipo_conta + ')' : '') : ''].filter(Boolean).join(' | ');
  }
  var STATUS_SIGNER = { signed: ['Assinou', 'ok'], refused: ['Recusou', 'danger'], viewed: ['Abriu, não assinou', 'warn'] };
  function badgeSigner(st) { var s = STATUS_SIGNER[st] || ['Pendente', 'warn']; return '<span class="badge ' + s[1] + '">' + s[0] + '</span>'; }
  var PAPEL_SIGNER = { cedente: 'Médico (cedente)', devedor: 'Hospital (devedor)', cessionario: 'Você (cessionário)' };
  async function chamarAssinatura(corpo) {
    var r = await sb.functions.invoke('assinatura', { body: corpo });
    if (r.error) {
      var msg = r.error.message;
      try { var j = await r.error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) { /* mantém */ }
      throw new Error(msg);
    }
    if (r.data && r.data.erro) throw new Error(r.data.erro);
    return r.data;
  }

  async function paginaAdmin() {
    var sessao = await exigirLogin(); if (!sessao) return;
    var aviso = $('#aviso');
    var eu = null;
    try { eu = await carregarPerfil(sessao.user.id); } catch (e) { /* abaixo */ }
    if (!eu || eu.papel !== 'admin') { location.replace('/area.html'); return; }
    montarCabecalho(eu, 'admin');

    var ops = [], clientes = [], empresa = {}, internos = {};
    var abaAtual = 'analise';

    async function carregar() {
      var res = await Promise.all([
        sb.from('operacoes').select('*, perfis(*)').order('criado_em', { ascending: false }),
        sb.from('perfis').select('*').order('nome'),
        sb.from('empresa').select('*').eq('id', 1).maybeSingle(),
        sb.from('operacoes_interno').select('*')
      ]);
      if (res[0].error) return mostrar(aviso, 'erro', traduzErro(res[0].error));
      ops = res[0].data || []; clientes = res[1].data || []; empresa = res[2].data || {};
      internos = {}; (res[3].data || []).forEach(function (i) { internos[i.operacao_id] = i; });
      render();
    }
    function daEtapa(et) { return ops.filter(function (o) { return etapaDe(o.status) === et; }); }
    function soma(lista, campo) { return lista.reduce(function (a, o) { return a + Number(o[campo] || 0); }, 0); }

    function render() {
      var an = daEtapa('analise'), as = daEtapa('assinatura'), pg = daEtapa('pagamento');
      var abertos = ops.filter(function (o) { return o.status === 'paga' || o.status === 'atrasada'; });
      var pagas = ops.filter(function (o) { return ['paga', 'liquidada', 'atrasada'].indexOf(o.status) > -1; });
      $('#stats').innerHTML =
        '<div class="stat"><span class="k">Em análise</span><span class="v">' + an.length + '</span><span class="s">' + brl(soma(an, 'valor_plantao')) + ' em plantões</span></div>' +
        '<div class="stat"><span class="k">Aguardando assinaturas</span><span class="v">' + as.length + '</span><span class="s">contratos enviados</span></div>' +
        '<div class="stat"><span class="k">A pagar aos médicos</span><span class="v">' + brl(soma(pg, 'valor_liquido')) + '</span><span class="s">' + pg.length + ' boletas assinadas</span></div>' +
        '<div class="stat"><span class="k">A receber dos hospitais</span><span class="v">' + brl(soma(abertos, 'valor_plantao')) + '</span><span class="s">' + abertos.length + ' boletas pagas em aberto</span></div>' +
        '<div class="stat"><span class="k">Total antecipado</span><span class="v">' + brl(soma(pagas, 'valor_liquido')) + '</span><span class="s">' + pagas.length + ' boletas pagas</span></div>';
      ['analise', 'assinatura', 'pagamento'].forEach(function (et) {
        $('[data-aba="' + et + '"] .conta').textContent = daEtapa(et).length;
        renderEtapa(et);
      });
      renderHistorico(); renderClientes();
    }
    function cardBoleta(o) {
      var p = o.perfis || {}, et = etapaDe(o.status), extra = '';
      if (et === 'assinatura') {
        var sg = (internos[o.id] && internos[o.id].zapsign_signers) || [];
        var feitas = sg.filter(function (s) { return s.status === 'signed'; }).length;
        extra = '<span>' + feitas + ' de ' + sg.length + ' assinaturas</span>' + (sg.some(function (s) { return s.status === 'refused'; }) ? '<span class="badge danger">recusa</span>' : '');
      }
      if (et === 'pagamento') extra = '<span>Pagar: ' + esc(contaTexto(p) || 'conta não informada') + '</span>';
      if (o.status === 'recusada' && o.motivo_recusa) extra = '<span>Motivo: ' + esc(o.motivo_recusa) + '</span>';
      var valor = (et === 'pagamento' || et === 'historico') && o.valor_liquido != null
        ? '<span class="k">Valor ao médico</span><span class="v">' + brl(o.valor_liquido) + '</span>'
        : '<span class="k">Valor do plantão</span><span class="v">' + brl(o.valor_plantao) + '</span>';
      return '<li class="op"><div class="op-main"><div class="op-title"><span class="num">#' + esc(o.numero) + '</span>' + esc(p.nome || p.email || '—') + '</div>' +
        '<div class="op-meta"><span>' + esc(o.hospital) + '</span><span>Plantão ' + esc(dataBR(o.data_plantao)) + '</span><span>Enviada ' + esc(dataBR(o.criado_em)) + '</span>' + extra + '</div>' +
        '<div>' + badge(o.status, 'admin') + '</div></div>' +
        '<div class="op-side"><div class="op-valor">' + valor + '</div>' +
        '<button class="btn btn-primary btn-sm" type="button" data-abrir-op="' + esc(o.id) + '">Abrir boleta</button></div></li>';
    }
    function ligarAbrirOps(scope) {
      $$('[data-abrir-op]', scope).forEach(function (b) { b.addEventListener('click', function () { abrirOp(b.getAttribute('data-abrir-op')); }); });
    }
    var VAZIOS = {
      analise: 'Nenhuma boleta esperando análise.',
      assinatura: 'Nenhum contrato aguardando assinatura.',
      pagamento: 'Nenhum pagamento pendente. Quando todos assinarem, a boleta aparece aqui.'
    };
    function renderEtapa(et) {
      var lista = daEtapa(et), box = $('#lista-' + et);
      if (et !== 'analise') lista = lista.slice().reverse();
      box.innerHTML = lista.length ? '<ul class="op-list">' + lista.map(cardBoleta).join('') + '</ul>' : '<div class="empty"><p>' + VAZIOS[et] + '</p></div>';
      ligarAbrirOps(box);
    }
    function renderHistorico() {
      var st = $('#hist-status').value, q = $('#hist-busca').value.trim().toLowerCase(), qd = digitos(q);
      var lista = daEtapa('historico').filter(function (o) {
        if (st && o.status !== st) return false;
        if (!q) return true;
        var p = o.perfis || {};
        var txt = [o.numero, o.hospital, p.nome, p.email, p.crm].join(' ').toLowerCase();
        return txt.indexOf(q) > -1 || (qd.length >= 3 && [p.cpf, p.cnpj, p.cpf_cnpj].map(digitos).join(' ').indexOf(qd) > -1);
      });
      var box = $('#lista-historico');
      box.innerHTML = lista.length ? '<ul class="op-list">' + lista.map(cardBoleta).join('') + '</ul>' : '<div class="empty"><p>Nenhuma boleta fechada encontrada.</p></div>';
      ligarAbrirOps(box);
    }
    $('#hist-status').innerHTML = '<option value="">Todas as fechadas</option>' + ETAPAS.historico.map(function (k) { return '<option value="' + k + '">' + esc(STATUS[k].admin) + '</option>'; }).join('');
    $('#hist-status').addEventListener('change', renderHistorico);
    $('#hist-busca').addEventListener('input', renderHistorico);

    /* Clientes: busca por nome / CPF / CNPJ */
    function renderClientes() {
      var q = $('#cli-busca').value.trim().toLowerCase(), qd = digitos(q);
      var cont = {}, total = {};
      ops.forEach(function (o) {
        cont[o.cliente_id] = (cont[o.cliente_id] || 0) + 1;
        if (['paga', 'liquidada', 'atrasada'].indexOf(o.status) > -1) total[o.cliente_id] = (total[o.cliente_id] || 0) + Number(o.valor_liquido || 0);
      });
      var lista = clientes.filter(function (c) {
        if (c.papel === 'admin') return false;
        if (!q) return true;
        var txt = [c.nome, c.email, c.razao_social, c.crm].join(' ').toLowerCase();
        return txt.indexOf(q) > -1 || (qd.length >= 3 && [c.cpf, c.cnpj, c.cpf_cnpj].map(digitos).join(' ').indexOf(qd) > -1);
      });
      $('#cli-cont').textContent = lista.length + (lista.length === 1 ? ' cliente' : ' clientes');
      var box = $('#lista-clientes');
      box.innerHTML = !lista.length ? '<div class="empty"><p>Nenhum cliente encontrado.</p></div>' :
        '<ul class="op-list">' + lista.map(function (c) {
          var doc = c.tipo_pessoa === 'PJ' ? 'CNPJ ' + (c.cnpj || c.cpf_cnpj || '—') : 'CPF ' + (c.cpf || c.cpf_cnpj || '—');
          return '<li class="op"><div class="op-main"><div class="op-title">' + esc(c.nome || c.email) + '</div>' +
            '<div class="op-meta"><span>' + esc(doc) + '</span><span>' + esc(c.crm ? 'CRM ' + c.crm + (c.crm_uf ? '/' + c.crm_uf : '') : '') + '</span><span>' + esc(c.telefone || '') + '</span></div>' +
            '<div>' + (faltandoNoCadastro(c).length ? '<span class="badge warn">cadastro incompleto</span>' : '<span class="badge ok">cadastro completo</span>') + '</div></div>' +
            '<div class="op-side"><div class="op-valor"><span class="k">' + (cont[c.id] || 0) + ' boletas · antecipado</span><span class="v">' + brl(total[c.id] || 0) + '</span></div>' +
            '<button class="btn btn-outline btn-sm" type="button" data-cliente="' + esc(c.id) + '">Ver histórico</button></div></li>';
        }).join('') + '</ul>';
      $$('[data-cliente]', box).forEach(function (b) { b.addEventListener('click', function () { abrirCliente(b.getAttribute('data-cliente')); }); });
    }
    $('#cli-busca').addEventListener('input', renderClientes);

    var dlgCli = $('#dlg-cliente'); ligarFechar(dlgCli);
    async function abrirCliente(id) {
      var c = clientes.filter(function (x) { return x.id === id; })[0]; if (!c) return;
      $('#cli-titulo').textContent = c.nome || c.email;
      var corpo = $('#cli-corpo');
      corpo.innerHTML = '<p class="loading">Carregando…</p>';
      abrirDialog(dlgCli);
      var r = await sb.from('documentos').select('*').eq('cliente_id', id).is('operacao_id', null).order('criado_em');
      var docsCad = r.data || [];
      var dele = ops.filter(function (o) { return o.cliente_id === id; });
      var pagas = dele.filter(function (o) { return ['paga', 'liquidada', 'atrasada'].indexOf(o.status) > -1; });
      var falta = faltandoNoCadastro(c, docsCad);
      corpo.innerHTML =
        '<div class="stats" style="margin:0">' +
        '<div class="stat"><span class="k">Boletas</span><span class="v">' + dele.length + '</span></div>' +
        '<div class="stat"><span class="k">Antecipado</span><span class="v">' + brl(soma(pagas, 'valor_liquido')) + '</span></div>' +
        '<div class="stat"><span class="k">Em andamento</span><span class="v">' + dele.filter(function (o) { return etapaDe(o.status) !== 'historico'; }).length + '</span></div></div>' +
        '<div class="box"><h3>Boletas</h3>' + (dele.length ? '<div class="table-box" style="margin:0"><table class="grid-table" style="min-width:640px"><thead><tr><th>Nº</th><th>Enviada</th><th>Hospital</th><th class="num">Plantão</th><th class="num">Ao médico</th><th>Status</th><th></th></tr></thead><tbody>' +
          dele.map(function (o) {
            return '<tr><td>#' + esc(o.numero) + '</td><td>' + esc(dataBR(o.criado_em)) + '</td><td>' + esc(o.hospital) + '</td><td class="num">' + brl(o.valor_plantao) + '</td><td class="num">' + brl(o.valor_liquido) + '</td><td>' + badge(o.status, 'admin') + '</td>' +
              '<td><button class="linkish" type="button" data-abrir-op="' + esc(o.id) + '">Abrir</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="small">Nenhuma boleta ainda.</p>') + '</div>' +
        '<div class="box"><h3>Dados do cadastro</h3>' + (falta.length ? '<div class="alert alert-erro">Falta: ' + esc(falta.join(', ')) + '.</div>' : '') +
        '<dl class="kv">' +
        '<div><dt>E-mail</dt><dd>' + esc(c.email || '—') + '</dd></div><div><dt>WhatsApp</dt><dd>' + esc(c.telefone || '—') + '</dd></div>' +
        '<div><dt>CPF</dt><dd>' + esc(c.cpf || '—') + '</dd></div><div><dt>RG</dt><dd>' + esc(c.rg ? c.rg + ' ' + (c.rg_orgao || '') : '—') + '</dd></div>' +
        '<div><dt>CRM</dt><dd>' + esc(c.crm ? c.crm + '/' + (c.crm_uf || '') : '—') + '</dd></div>' +
        (c.tipo_pessoa === 'PJ' ? '<div><dt>Empresa</dt><dd>' + esc(c.razao_social || '—') + '<br><span class="small">CNPJ ' + esc(c.cnpj || '—') + '</span></dd></div>' : '') +
        '<div><dt>Endereço</dt><dd>' + esc(enderecoCompleto(c) || '—') + '</dd></div><div><dt>Conta</dt><dd>' + esc(contaTexto(c) || '—') + '</dd></div>' +
        '<div><dt>Cliente desde</dt><dd>' + esc(dataBR(c.criado_em)) + '</dd></div></dl>' +
        '<h3>Documentos do cadastro</h3>' + renderDocs(docsCad) + '</div>';
      ligarAbrirDocs(corpo); ligarAbrirOps(corpo);
    }

    /* Abas */
    function irAba(nome) {
      abaAtual = nome;
      $$('.page-tab').forEach(function (x) { x.setAttribute('aria-selected', x.getAttribute('data-aba') === nome ? 'true' : 'false'); });
      $$('[data-secao]').forEach(function (s) { s.hidden = s.getAttribute('data-secao') !== nome; });
      if (nome === 'config') preencherConfig();
    }
    $$('.page-tab').forEach(function (t) { t.addEventListener('click', function () { irAba(t.getAttribute('data-aba')); }); });

    /* Configurações (cessionário) */
    var CAMPOS_EMPRESA = ['tipo', 'nome', 'documento', 'endereco', 'representante_nome', 'representante_cpf', 'representante_qualificacao',
      'email', 'telefone', 'banco', 'agencia', 'conta', 'pix', 'cidade_assinatura', 'foro'];
    function preencherConfig() {
      var f = $('#form-config');
      CAMPOS_EMPRESA.forEach(function (k) { if (f[k] && empresa[k] != null) f[k].value = empresa[k]; });
    }
    $('#form-config').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var f = this, dados = { id: 1, atualizado_em: new Date().toISOString() };
      CAMPOS_EMPRESA.forEach(function (k) { dados[k] = String(f[k].value || '').trim() || null; });
      var r = await sb.from('empresa').upsert(dados);
      if (r.error) return mostrar($('#aviso-config'), 'erro', traduzErro(r.error));
      empresa = Object.assign(empresa, dados);
      mostrar($('#aviso-config'), 'ok', 'Dados do cessionário salvos. Eles entram automaticamente nos próximos contratos.');
    });

    /* Boleta */
    var dlg = $('#dlg-op'); ligarFechar(dlg);
    function okOp(msg) { var el = $('#aviso-op'); mostrar(el, 'ok', msg); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
    function erroOp(msg) { var el = $('#aviso-op'); mostrar(el, 'erro', msg); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }

    function caixaAcoes(o, p, docsCad) {
      var et = etapaDe(o.status), int = internos[o.id] || {};
      if (et === 'analise') {
        var falta = faltandoContrato(o, p, empresa);
        if (!o.hospital_contato_email) falta.push('operação: e-mail de quem assina pelo hospital');
        if (!empresa.email) falta.push('Configurações: seu e-mail (para você assinar como cessionário)');
        if (!docsCad.some(function (d) { return d.tipo === 'identidade'; })) falta.push('médico: cópia do RG/CNH');
        return '<div class="box acao"><h3>Decisão</h3>' +
          '<p>Confira os documentos e os dados abaixo. Ao aprovar, o contrato de cessão é gerado e enviado pela Autentique para o médico, para o hospital' + (empresa.email ? ' e para você' : '') + ' assinarem.</p>' +
          (falta.length ? '<div class="alert alert-erro">Antes de enviar, preencha: ' + esc(falta.join('; ')) + '.</div>' : '<div class="alert alert-ok">Tudo pronto para gerar o contrato.</div>') +
          '<div class="acoes-linha">' +
          '<button class="btn btn-primary" type="button" data-acao="enviar"' + (falta.length ? ' disabled' : '') + '>Enviar contrato de cessão</button>' +
          '<button class="btn btn-outline" type="button" data-acao="ajuste">Pedir documento / ajuste</button>' +
          '<button class="btn btn-danger" type="button" data-acao="negar">Negar boleta</button>' +
          '<a class="btn btn-quiet" href="/contrato.html?op=' + encodeURIComponent(o.id) + '" target="_blank" rel="noopener">Ver prévia do contrato</a></div>' +
          '<div data-painel="enviar" hidden class="sub-painel"><h4>Enviar para assinatura</h4><ul class="lista-simples">' +
          '<li><strong>Médico:</strong> ' + esc(p.nome || '') + ' &lt;' + esc(p.email || '') + '&gt;</li>' +
          '<li><strong>Hospital:</strong> ' + esc(o.hospital_contato_nome || o.hospital) + ' &lt;' + esc(o.hospital_contato_email || '—') + '&gt;</li></ul>' +
          '<label class="check"><input type="checkbox" name="incluir_cess" checked> Incluir você (' + esc(empresa.email || 'sem e-mail') + ') como signatário cessionário</label>' +
          '<p class="small">Preço da cessão: <strong>' + brl(o.valor_liquido) + '</strong>. A boleta vai para "Aguardando assinaturas".</p>' +
          '<button class="btn btn-primary" type="button" data-confirmar="enviar">Confirmar envio para assinatura</button></div>' +
          '<div data-painel="ajuste" hidden class="sub-painel"><h4>Pedir documento ou ajuste</h4><div class="field"><label for="aj-msg">Mensagem para o médico</label><textarea id="aj-msg" placeholder="Ex.: Falta a escala assinada do plantão de 14/11."></textarea></div>' +
          '<button class="btn btn-outline" type="button" data-confirmar="ajuste">Enviar pedido</button></div>' +
          '<div data-painel="negar" hidden class="sub-painel"><h4>Negar boleta</h4><div class="field"><label for="ng-motivo">Motivo (o médico vê)</label><textarea id="ng-motivo" placeholder="Ex.: Hospital fora da nossa política de crédito no momento."></textarea></div>' +
          '<button class="btn btn-danger" type="button" data-confirmar="negar">Confirmar recusa</button></div></div>';
      }
      if (et === 'assinatura') {
        var sg = int.zapsign_signers || [];
        return '<div class="box acao"><h3>Assinaturas</h3>' +
          (sg.length ? '<ul class="doc-list">' + sg.map(function (s) {
            return '<li><span class="doc-name"><strong>' + esc(PAPEL_SIGNER[s.papel] || s.papel) + '</strong> · ' + esc(s.nome) + '<small>' + esc(s.email) + '</small></span>' +
              '<span class="acoes-linha">' + badgeSigner(s.status) + (s.sign_url && s.status !== 'signed' ? '<button class="btn btn-outline btn-sm" type="button" data-copiar="' + esc(s.sign_url) + '">Copiar link</button>' : '') + '</span></li>';
          }).join('') + '</ul>' : '<p class="small">Sem dados da assinatura para esta boleta.</p>') +
          '<p class="small">Enviado em ' + esc(dataHoraBR(o.enviado_assinatura_em) || '—') + '. Quando todos assinarem, a boleta passa sozinha para "Efetuar pagamento".</p>' +
          '<div class="acoes-linha"><button class="btn btn-outline" type="button" data-acao-direta="atualizar">Atualizar status agora</button>' +
          '<button class="btn btn-quiet" type="button" data-acao-direta="assinado-manual">Marcar como assinado manualmente</button></div></div>';
      }
      if (et === 'pagamento') {
        return '<div class="box acao destaque"><h3>Efetuar pagamento</h3>' +
          '<p class="valor-grande">' + brl(o.valor_liquido) + '</p>' +
          '<dl class="kv"><div><dt>Favorecido</dt><dd>' + esc(p.tipo_pessoa === 'PJ' ? (p.razao_social || p.nome) : p.nome) + '</dd></div>' +
          '<div><dt>' + (p.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF') + '</dt><dd>' + esc(p.tipo_pessoa === 'PJ' ? (p.cnpj || '—') : (p.cpf || '—')) + '</dd></div>' +
          '<div><dt>Conta</dt><dd>' + esc(contaTexto(p) || 'não informada') + '</dd></div>' +
          '<div><dt>Assinado em</dt><dd>' + esc(dataHoraBR(o.assinado_em) || '—') + '</dd></div></dl>' +
          '<div class="row-2"><div class="field"><label for="pg-data">Data do pagamento</label><input id="pg-data" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div></div>' +
          '<button class="btn btn-primary" type="button" data-acao-direta="pago">Confirmar que o pagamento foi feito</button></div>';
      }
      var resumo = o.status === 'recusada' ? 'Boleta recusada' + (o.motivo_recusa ? ': ' + o.motivo_recusa : '.') :
        o.status === 'cancelada' ? 'Boleta cancelada.' :
        'Paga ao médico em ' + dataBR(o.pago_em) + (o.status === 'liquidada' ? ' · hospital já pagou.' : ' · aguardando o pagamento do hospital.');
      return '<div class="box acao"><h3>Boleta fechada</h3><p>' + esc(resumo) + '</p>' +
        (o.status === 'paga' || o.status === 'atrasada' ? '<div class="acoes-linha"><button class="btn btn-outline" type="button" data-acao-direta="hospital-pagou">Registrar que o hospital pagou</button>' +
          (o.status === 'paga' ? '<button class="btn btn-quiet" type="button" data-acao-direta="atrasada">Marcar hospital em atraso</button>' : '') + '</div>' : '') + '</div>';
    }

    async function abrirOp(id) {
      var o = ops.filter(function (x) { return x.id === id; })[0]; if (!o) return;
      var p = o.perfis || {};
      $('#op-titulo').textContent = 'Boleta #' + o.numero + ' · ' + ROTULO_ETAPA[etapaDe(o.status)];
      var corpo = $('#op-corpo');
      corpo.innerHTML = '<p class="loading">Carregando…</p>';
      if (!dlg.open) abrirDialog(dlg);
      var res = await Promise.all([
        sb.from('documentos').select('*').eq('operacao_id', id).order('criado_em'),
        sb.from('historico').select('*').eq('operacao_id', id).order('criado_em'),
        sb.from('documentos').select('*').eq('cliente_id', o.cliente_id).is('operacao_id', null).order('criado_em')
      ]);
      var docs = res[0].data || [], hist = res[1].data || [], docsCad = res[2].data || [], int = internos[id] || {};
      var editavel = etapaDe(o.status) === 'analise';
      var dis = editavel ? '' : ' disabled';
      corpo.innerHTML =
        '<div class="alert" hidden id="aviso-op"></div>' +
        '<div>' + badge(o.status, 'admin') + '</div>' +
        caixaAcoes(o, p, docsCad) +
        '<div class="box"><h3>Documentos da boleta</h3>' + renderDocs(docs) +
        '<form id="form-doc" class="row-2"><div class="field"><label for="f-tipo">Tipo</label><select id="f-tipo" name="tipo"><option value="comprovante">Comprovante do plantão</option><option value="contrato">Contrato</option><option value="outro">Outro</option></select></div>' +
        '<div class="field"><label for="f-arq">Anexar arquivo</label><input id="f-arq" name="arq" type="file" multiple required accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,application/pdf,image/*"></div>' +
        '<div><button class="btn btn-outline btn-sm" type="submit">Anexar</button></div></form></div>' +
        '<form class="box" id="form-op"><h3>Dados da boleta' + (editavel ? '' : ' (travados após o envio do contrato)') + '</h3>' +
        '<p class="small">Enviada em ' + esc(dataHoraBR(o.criado_em)) + (o.observacao_cliente ? ' · Observação do médico: ' + esc(o.observacao_cliente) : '') + '</p><div class="row-2">' +
        campo('f-hosp', 'hospital', 'Hospital / pagador (razão social)', o.hospital, 'required' + dis) +
        campo('f-hcnpj', 'hospital_cnpj', 'CNPJ do hospital', o.hospital_cnpj, dis) + '</div><div class="row-2">' +
        campo('f-hend', 'hospital_endereco', 'Endereço do hospital', o.hospital_endereco, dis) +
        campo('f-nf', 'documento_fiscal', 'Nº da NF / RPA', o.documento_fiscal, dis) + '</div><div class="row-2">' +
        campo('f-hcn', 'hospital_contato_nome', 'Quem assina pelo hospital', o.hospital_contato_nome, dis) +
        campo('f-hce', 'hospital_contato_email', 'E-mail de quem assina pelo hospital', o.hospital_contato_email, 'type="email"' + dis) + '</div><div class="row-2">' +
        campo('f-data', 'data_plantao', 'Data do plantão', o.data_plantao, 'type="date"' + dis) +
        campo('f-prev', 'previsao_pagamento', 'Vencimento (hospital paga em)', o.previsao_pagamento, 'type="date"' + dis) + '</div><div class="row-2">' +
        '<div class="field"><label>Valor do plantão (informado)</label><input value="' + esc(brl(o.valor_plantao)) + '" disabled></div>' +
        campo('f-liq', 'valor_liquido', 'Valor líquido ao médico (preço da cessão, R$)', o.valor_liquido != null ? String(o.valor_liquido).replace('.', ',') : '', 'inputmode="decimal"' + dis) + '</div>' +
        (editavel ? '<button class="btn btn-primary btn-sm" type="submit">Salvar dados da boleta</button>' : '') + '</form>' +
        '<div class="box"><h3>Médico (cedente)</h3>' + (faltandoNoCadastro(p, docsCad).length ? '<div class="alert alert-erro">Cadastro incompleto. Falta: ' + esc(faltandoNoCadastro(p, docsCad).join(', ')) + '.</div>' : '') +
        '<dl class="kv"><div><dt>Nome</dt><dd>' + esc(p.nome || '—') + '</dd></div><div><dt>E-mail</dt><dd>' + esc(p.email || '—') + '</dd></div>' +
        '<div><dt>WhatsApp</dt><dd>' + esc(p.telefone || '—') + '</dd></div><div><dt>CRM</dt><dd>' + esc(p.crm ? p.crm + '/' + (p.crm_uf || '') : '—') + '</dd></div>' +
        '<div><dt>CPF</dt><dd>' + esc(p.cpf || '—') + '</dd></div><div><dt>RG</dt><dd>' + esc(p.rg ? p.rg + ' ' + (p.rg_orgao || '') : '—') + '</dd></div>' +
        (p.tipo_pessoa === 'PJ' ? '<div><dt>Empresa</dt><dd>' + esc(p.razao_social || '—') + '<br><span class="small">CNPJ ' + esc(p.cnpj || '—') + '</span></dd></div>' : '') +
        '<div><dt>Endereço</dt><dd>' + esc(enderecoCompleto(p) || '—') + '</dd></div><div><dt>Conta</dt><dd>' + esc(contaTexto(p) || '—') + '</dd></div></dl>' +
        '<h3>Documentos do cadastro</h3>' + renderDocs(docsCad) +
        '<div><button class="btn btn-quiet btn-sm" type="button" data-cliente-op="' + esc(o.cliente_id) + '">Ver histórico deste cliente</button></div></div>' +
        '<form class="box" id="form-msg"><h3>Mensagem para o médico</h3><div class="field"><label for="f-msg">Aparece no andamento da boleta, na área dele</label><textarea id="f-msg" name="msg" required></textarea></div><button class="btn btn-outline btn-sm" type="submit">Enviar mensagem</button></form>' +
        '<form class="box" id="form-interno"><h3>Controle interno (o médico não vê)</h3><div class="row-2">' +
        campo('f-rec', 'valor_recebido', 'Valor recebido do hospital (R$)', int.valor_recebido != null ? String(int.valor_recebido).replace('.', ',') : '', 'inputmode="decimal"') +
        campo('f-rece', 'recebido_em', 'Recebido em', int.recebido_em, 'type="date"') + '</div>' +
        '<div class="field"><label for="f-nota">Notas internas</label><textarea id="f-nota" name="nota">' + esc(int.nota_interna || '') + '</textarea></div>' +
        '<button class="btn btn-outline btn-sm" type="submit">Salvar controle interno</button></form>' +
        '<div class="box"><h3>Histórico</h3>' + renderTimeline(hist, 'admin') + '</div>' +
        '<details class="box"><summary>Correção manual de status</summary><p class="small">Use só para corrigir algo fora do fluxo normal.</p><div class="row-2"><div class="field"><label for="f-status">Status</label><select id="f-status">' +
        Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + esc(STATUS[k].admin) + '</option>'; }).join('') +
        '</select></div></div><button class="btn btn-outline btn-sm" type="button" data-acao-direta="status-manual">Aplicar status</button></details>';
      ligarAbrirDocs(corpo);

      async function atualizarOp(campos, msgCliente, msgOk) {
        var r = await sb.from('operacoes').update(campos).eq('id', id);
        if (r.error) { erroOp(traduzErro(r.error)); return false; }
        if (msgCliente) await sb.from('historico').insert({ operacao_id: id, evento: 'Mensagem', detalhe: msgCliente });
        await carregar(); await abrirOp(id); if (msgOk) okOp(msgOk);
        return true;
      }
      // painéis de decisão (análise)
      $$('[data-acao]', corpo).forEach(function (b) {
        b.addEventListener('click', function () {
          var qual = b.getAttribute('data-acao');
          $$('[data-painel]', corpo).forEach(function (pn) { pn.hidden = pn.getAttribute('data-painel') !== qual || !pn.hidden; });
        });
      });
      var bEnv = $('[data-confirmar="enviar"]', corpo);
      if (bEnv) bEnv.addEventListener('click', async function () {
        if (!window.pdfMake) return erroOp('Gerador de PDF não carregou. Recarregue a página.');
        bEnv.disabled = true;
        try {
          mostrar($('#aviso-op'), 'info', 'Gerando o contrato…');
          var par = { cidade: empresa.cidade_assinatura || '', foro: empresa.foro || empresa.cidade_assinatura || '', data: new Date().toISOString().slice(0, 10), prazo: '1 (um) dia útil', notificacao: true };
          var blob = await window.pdfMake.createPdf(contratoPdf(montarContrato(o, p, empresa, par), 'Cessão de crédito · operação nº ' + o.numero)).getBlob();
          var nome = 'contrato-cessao-operacao-' + o.numero + '.pdf';
          var caminho = o.cliente_id + '/' + o.id + '/' + Date.now() + '-contrato-' + nomeSeguro(nome);
          var up = await sb.storage.from(BUCKET).upload(caminho, new File([blob], nome, { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false });
          if (up.error) throw up.error;
          var ins = await sb.from('documentos').insert({ operacao_id: o.id, cliente_id: o.cliente_id, tipo: 'contrato', nome_arquivo: 'Contrato para assinatura – operação ' + o.numero + '.pdf', caminho: caminho, tamanho: blob.size });
          if (ins.error) throw ins.error;
          mostrar($('#aviso-op'), 'info', 'Enviando para a Autentique…');
          var env = await chamarAssinatura({ acao: 'enviar', operacao_id: o.id, caminho: caminho, incluir_cessionario: $('[name=incluir_cess]', corpo).checked });
          await carregar(); await abrirOp(id);
          okOp('Contrato enviado pela Autentique' + (env && env.sandbox ? ' em MODO TESTE (sem validade jurídica)' : '') + '. A boleta foi para "Aguardando assinaturas".');
        } catch (err) { bEnv.disabled = false; erroOp(traduzErro(err)); }
      });
      var bAj = $('[data-confirmar="ajuste"]', corpo);
      if (bAj) bAj.addEventListener('click', function () {
        var m = $('#aj-msg', corpo).value.trim(); if (!m) return erroOp('Escreva o que o médico precisa enviar ou ajustar.');
        atualizarOp({ status: 'pendente_documentos' }, m, 'Pedido enviado. O médico vê a mensagem na área dele.');
      });
      var bNg = $('[data-confirmar="negar"]', corpo);
      if (bNg) bNg.addEventListener('click', function () {
        var m = $('#ng-motivo', corpo).value.trim(); if (!m) return erroOp('Informe o motivo da recusa.');
        if (!confirm('Negar a boleta #' + o.numero + '? Ela vai para o histórico como recusada.')) return;
        atualizarOp({ status: 'recusada', motivo_recusa: m }, 'Boleta não aprovada: ' + m, 'Boleta recusada e movida para o histórico.');
      });
      // ações diretas
      $$('[data-acao-direta]', corpo).forEach(function (b) {
        b.addEventListener('click', async function () {
          var a = b.getAttribute('data-acao-direta');
          if (a === 'atualizar') {
            b.disabled = true;
            try { await chamarAssinatura({ acao: 'atualizar', operacao_id: id }); await carregar(); await abrirOp(id); okOp('Status das assinaturas atualizado.'); }
            catch (err) { b.disabled = false; erroOp(traduzErro(err)); }
          } else if (a === 'assinado-manual') {
            if (!confirm('Confirmar que TODAS as partes assinaram (fora do fluxo automático)?')) return;
            atualizarOp({ status: 'assinada', assinado_em: new Date().toISOString() }, 'Contrato assinado por todas as partes. O pagamento está sendo preparado.', 'Boleta movida para "Efetuar pagamento".');
          } else if (a === 'pago') {
            var d = $('#pg-data', corpo).value || new Date().toISOString().slice(0, 10);
            if (!confirm('Confirmar pagamento de ' + brl(o.valor_liquido) + ' ao médico em ' + dataBR(d) + '?')) return;
            atualizarOp({ status: 'paga', pago_em: d }, 'Pagamento de ' + brl(o.valor_liquido) + ' enviado em ' + dataBR(d) + '. Obrigado por antecipar com a adiantaMed!', 'Pagamento registrado. A boleta foi para o histórico.');
          } else if (a === 'hospital-pagou') {
            var hoje = new Date().toISOString().slice(0, 10);
            await sb.from('operacoes_interno').upsert({ operacao_id: id, recebido_em: hoje, valor_recebido: o.valor_plantao, atualizado_em: new Date().toISOString() });
            atualizarOp({ status: 'liquidada' }, null, 'Registrado: hospital pagou.');
          } else if (a === 'atrasada') {
            atualizarOp({ status: 'atrasada' }, null, 'Boleta marcada como hospital em atraso.');
          } else if (a === 'status-manual') {
            var st = $('#f-status', corpo).value;
            if (st === o.status) return;
            if (!confirm('Mudar o status manualmente para "' + STATUS[st].admin + '"?')) return;
            atualizarOp({ status: st }, null, 'Status alterado.');
          }
        });
      });
      $$('[data-copiar]', corpo).forEach(function (b) {
        b.addEventListener('click', async function () {
          try { await navigator.clipboard.writeText(b.getAttribute('data-copiar')); b.textContent = 'Copiado!'; }
          catch (e) { prompt('Copie o link:', b.getAttribute('data-copiar')); }
        });
      });
      $$('[data-cliente-op]', corpo).forEach(function (b) { b.addEventListener('click', function () { fecharDialog(dlg); abrirCliente(b.getAttribute('data-cliente-op')); }); });

      $('#form-op', corpo).addEventListener('submit', async function (e) {
        e.preventDefault();
        var f = this, liq = f.valor_liquido.value.trim();
        atualizarOp({
          hospital: f.hospital.value.trim(),
          hospital_cnpj: f.hospital_cnpj.value.trim() || null,
          hospital_endereco: f.hospital_endereco.value.trim() || null,
          documento_fiscal: f.documento_fiscal.value.trim() || null,
          hospital_contato_nome: f.hospital_contato_nome.value.trim() || null,
          hospital_contato_email: f.hospital_contato_email.value.trim() || null,
          data_plantao: f.data_plantao.value || null,
          previsao_pagamento: f.previsao_pagamento.value || null,
          valor_liquido: liq ? parseValor(liq) : null
        }, null, 'Dados da boleta salvos.');
      });
      $('#form-msg', corpo).addEventListener('submit', async function (e) {
        e.preventDefault();
        var r = await sb.from('historico').insert({ operacao_id: id, evento: 'Mensagem', detalhe: this.msg.value.trim() });
        if (r.error) return erroOp(traduzErro(r.error));
        await abrirOp(id); okOp('Mensagem enviada. O médico vê no andamento da boleta.');
      });
      $('#form-interno', corpo).addEventListener('submit', async function (e) {
        e.preventDefault();
        var f = this, rec = f.valor_recebido.value.trim();
        var r = await sb.from('operacoes_interno').upsert({
          operacao_id: id, nota_interna: f.nota.value.trim() || null,
          valor_recebido: rec ? parseValor(rec) : null, recebido_em: f.recebido_em.value || null,
          atualizado_em: new Date().toISOString()
        });
        if (r.error) return erroOp(traduzErro(r.error));
        await carregar(); okOp('Controle interno salvo.');
      });
      $('#form-doc', corpo).addEventListener('submit', async function (e) {
        e.preventDefault();
        var f = this, b = $('button', f); b.disabled = true;
        try {
          await enviarArquivos(o.cliente_id, id, arquivosDe(f.arq, f.tipo.value), function (t) { mostrar($('#aviso-op'), 'info', t); });
          await abrirOp(id); okOp('Arquivo anexado.');
        } catch (err) { b.disabled = false; erroOp(traduzErro(err)); }
      });
    }

    irAba('analise');
    await carregar();
    sincronizarAssinaturas();

    // Confere na Autentique as boletas que esperam assinatura (caso o webhook não tenha avisado)
    async function sincronizarAssinaturas() {
      var pend = daEtapa('assinatura').filter(function (o) { return internos[o.id] && internos[o.id].zapsign_token; });
      var mudou = false;
      for (var i = 0; i < pend.length; i++) {
        var antes = JSON.stringify((internos[pend[i].id] || {}).zapsign_signers || []);
        try {
          var r = await chamarAssinatura({ acao: 'atualizar', operacao_id: pend[i].id });
          if (r && (r.status === 'signed' || JSON.stringify(r.signers || []) !== antes)) mudou = true;
        } catch (e) { /* silencioso: o botão "Atualizar status agora" mostra o erro */ }
      }
      if (mudou) await carregar();
    }
  }

  /* ================= Contrato de cessão ================= */
  var UNID = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
    'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  var DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  var CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function ate999(n) {
    if (n === 100) return 'cem';
    var c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(CEM[c]);
    if (r) p.push(r < 20 ? UNID[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNID[r % 10] : ''));
    return p.join(' e ');
  }
  function inteiroExtenso(n) {
    if (n === 0) return 'zero';
    var grupos = [], nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
    var i = 0;
    while (n > 0) { grupos.push({ v: n % 1000, i: i }); n = Math.floor(n / 1000); i++; }
    var partes = grupos.filter(function (g) { return g.v; }).reverse().map(function (g) {
      if (g.i === 1 && g.v === 1) return 'mil';
      return ate999(g.v) + (g.i ? ' ' + nomes[g.i][g.v === 1 ? 0 : 1] : '');
    });
    var ult = grupos.filter(function (g) { return g.v; })[0];
    if (partes.length > 1 && (ult.v < 100 || ult.v % 100 === 0)) {
      var fim = partes.pop(); return partes.join(' ') + ' e ' + fim;
    }
    return partes.join(' ');
  }
  function valorExtenso(v) {
    v = Math.round(Number(v || 0) * 100);
    var reais = Math.floor(v / 100), cent = v % 100, t = [];
    if (reais) {
      var r = inteiroExtenso(reais);
      t.push(r + (reais % 1000000 === 0 ? ' de reais' : reais === 1 ? ' real' : ' reais'));
    }
    if (cent) t.push(inteiroExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos'));
    return t.length ? t.join(' e ') : 'zero real';
  }
  function dataExtenso(iso) {
    var m = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    var d = new Date((iso || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    return d.getDate() + ' de ' + m[d.getMonth()] + ' de ' + d.getFullYear();
  }
  var VAZIO = '[__________]';
  function v(x) { return (x === null || x === undefined || String(x).trim() === '') ? VAZIO : String(x).trim(); }
  function dinheiro(n) { return n == null || n === '' ? VAZIO : brl(n) + ' (' + valorExtenso(n) + ')'; }

  function montarContrato(o, p, e, par) {
    var pj = p.tipo_pessoa === 'PJ', cpj = e.tipo !== 'PF';
    var CE = cpj ? 'CESSIONÁRIA' : 'CESSIONÁRIO';
    var cedente = pj
      ? '**' + v(p.razao_social) + '**, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ' + v(p.cnpj) + ', com sede em ' + v(enderecoCompleto(p)) +
        ', neste ato representada por seu(sua) sócio(a) **' + v(p.nome) + '**, ' + v(p.nacionalidade) + ', ' + v(p.estado_civil) + ', médico(a), inscrito(a) no CRM/' + v(p.crm_uf) +
        ' sob o nº ' + v(p.crm) + ', portador(a) do RG nº ' + v(p.rg) + ' ' + v(p.rg_orgao) + ' e inscrito(a) no CPF sob o nº ' + v(p.cpf) + ', e-mail ' + v(p.email) + ', doravante denominada **CEDENTE**;'
      : '**' + v(p.nome) + '**, ' + v(p.nacionalidade) + ', ' + v(p.estado_civil) + ', médico(a), inscrito(a) no CRM/' + v(p.crm_uf) + ' sob o nº ' + v(p.crm) +
        ', portador(a) do RG nº ' + v(p.rg) + ' ' + v(p.rg_orgao) + ', inscrito(a) no CPF sob o nº ' + v(p.cpf) + ', residente e domiciliado(a) em ' + v(enderecoCompleto(p)) +
        ', e-mail ' + v(p.email) + ', doravante denominado(a) **CEDENTE**;';
    var cess = cpj
      ? '**' + v(e.nome) + '**, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ' + v(e.documento) + ', com sede em ' + v(e.endereco) +
        ', neste ato representada por **' + v(e.representante_nome) + '**, ' + v(e.representante_qualificacao) + ', inscrito(a) no CPF sob o nº ' + v(e.representante_cpf) + ', doravante denominada **CESSIONÁRIA**.'
      : '**' + v(e.nome) + '**, ' + v(e.representante_qualificacao) + ', inscrito(a) no CPF sob o nº ' + v(e.documento) + ', residente e domiciliado(a) em ' + v(e.endereco) + ', doravante denominado **CESSIONÁRIO**.';
    var devedor = '**' + v(o.hospital) + '**, inscrito no CNPJ sob o nº ' + v(o.hospital_cnpj) + ', com endereço em ' + v(o.hospital_endereco);
    var contaCedente = [p.pix ? 'Chave Pix: ' + p.pix : '', p.banco ? p.banco + ', agência ' + v(p.agencia) + ', conta ' + v(p.conta) + (p.tipo_conta ? ' (' + p.tipo_conta + ')' : '') : ''].filter(Boolean).join(' · ') || VAZIO;
    var contaCess = [e.banco ? e.banco + ', agência ' + v(e.agencia) + ', conta ' + v(e.conta) : '', e.pix ? 'Chave Pix: ' + e.pix : ''].filter(Boolean).join(' · ') || VAZIO;
    var titularCedente = pj ? v(p.razao_social) : v(p.nome);
    var local = v(par.cidade) + ', ' + dataExtenso(par.data) + '.';
    var B = [];
    function T(t) { B.push({ k: 'title', t: t }); }
    function H(t) { B.push({ k: 'h', t: t }); }
    function P(t) { B.push({ k: 'p', t: t }); }

    T('INSTRUMENTO PARTICULAR DE CESSÃO DE CRÉDITO');
    B.push({ k: 'sub', t: 'Operação nº ' + v(o.numero) });
    P('Pelo presente instrumento particular, de um lado,');
    P(cedente);
    P('e, de outro lado,');
    P(cess);
    P('As partes acima, em conjunto denominadas "Partes", têm entre si justo e contratado o presente Instrumento Particular de Cessão de Crédito ("Contrato"), que se regerá pelas cláusulas a seguir e pelos arts. 286 a 298 do Código Civil.');

    H('CLÁUSULA 1ª – DO OBJETO');
    P('1.1. O CEDENTE cede e transfere ao(à) ' + CE + ', em caráter definitivo, irrevogável e irretratável, a totalidade do crédito descrito no **Anexo I** ("Crédito"), de sua titularidade contra ' + devedor + ' ("DEVEDOR"), decorrente de serviços médicos (plantão) efetivamente prestados, com todos os direitos, privilégios, garantias e acessórios a ele inerentes.');

    H('CLÁUSULA 2ª – DO PREÇO E DO PAGAMENTO');
    P('2.1. Pela cessão, o(a) ' + CE + ' pagará ao CEDENTE o valor de **' + dinheiro(o.valor_liquido) + '** ("Preço"), em até ' + v(par.prazo) + ' contado(s) da assinatura deste Contrato por todas as Partes, mediante transferência para a conta do CEDENTE indicada no Anexo I.');
    P('2.2. O pagamento do Preço, comprovado pelo extrato da transferência, valerá como plena, geral e irrevogável quitação, nada mais tendo o CEDENTE a reclamar a título de preço da cessão.');

    H('CLÁUSULA 3ª – DA NATUREZA DA CESSÃO');
    P('3.1. A cessão é feita em caráter **pro soluto**: o CEDENTE não responde pela solvência do DEVEDOR (art. 296 do Código Civil), mas responde pela existência, legitimidade, exigibilidade e correta formalização do Crédito ao tempo da cessão (art. 295 do Código Civil).');

    H('CLÁUSULA 4ª – DAS DECLARAÇÕES DO CEDENTE');
    P('4.1. O CEDENTE declara, sob as penas da lei, que: (a) é o único e legítimo titular do Crédito, que corresponde a serviços efetivamente prestados ao DEVEDOR; (b) o Crédito não foi cedido, empenhado, dado em garantia, nem é objeto de penhora, bloqueio ou qualquer outro ônus; (c) não tem conhecimento de glosa, contestação, compensação ou qualquer fato que possa reduzir, atrasar ou impedir o pagamento do Crédito; (d) não existe, no contrato ou na relação com o DEVEDOR, cláusula que proíba ou condicione a cessão do Crédito; e (e) são verdadeiros os documentos e informações fornecidos ao(à) ' + CE + '.');
    P('4.2. O valor de face indicado no Anexo I corresponde ao valor líquido a ser pago pelo DEVEDOR, já deduzidas as retenções de tributos na fonte que lhe couberem.');

    H('CLÁUSULA 5ª – DA RECOMPRA');
    P('5.1. Se o Crédito, no todo ou em parte, for considerado inexistente, for glosado, compensado ou contestado pelo DEVEDOR por fato imputável ao CEDENTE, ou se for falsa qualquer declaração da Cláusula 4ª, o CEDENTE restituirá ao(à) ' + CE + ', em até 5 (cinco) dias úteis da comunicação, o Preço proporcional à parcela afetada, atualizado pela taxa legal prevista no art. 406 do Código Civil desde a data do pagamento.');

    H('CLÁUSULA 6ª – DA NOTIFICAÇÃO E DO PAGAMENTO PELO DEVEDOR');
    P('6.1. O CEDENTE autoriza o(a) ' + CE + ' a notificar o DEVEDOR desta cessão, nos termos do art. 290 do Código Civil, inclusive por meio do Termo de Notificação anexo, para que o pagamento do Crédito seja feito diretamente ao(à) ' + CE + '. O CEDENTE se compromete a assinar os documentos e prestar as informações necessárias para esse fim.');
    P('6.2. Se o CEDENTE receber, por qualquer motivo, valores relativos ao Crédito, deverá repassá-los integralmente ao(à) ' + CE + ' em até 2 (dois) dias úteis do recebimento, sob pena de multa de 10% (dez por cento) sobre o valor recebido, sem prejuízo da atualização pela taxa legal.');

    H('CLÁUSULA 7ª – DOS TRIBUTOS');
    P('7.1. Cada Parte responde pelos tributos de que seja contribuinte em razão deste Contrato, na forma da legislação aplicável.');

    H('CLÁUSULA 8ª – DA PROTEÇÃO DE DADOS');
    P('8.1. O CEDENTE autoriza o tratamento dos dados pessoais constantes deste Contrato para a execução da cessão, a notificação do DEVEDOR e o cumprimento de obrigações legais e regulatórias, nos termos da Lei nº 13.709/2018 (LGPD).');

    H('CLÁUSULA 9ª – DAS DISPOSIÇÕES GERAIS');
    P('9.1. As Partes reconhecem a validade da assinatura deste Contrato por meio eletrônico, nos termos da Lei nº 14.063/2020 e do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001, admitindo como válidos a autoria e a integridade do documento assinado.');
    P('9.2. Este Contrato obriga as Partes e seus sucessores a qualquer título.');
    P('9.3. Fica eleito o foro da comarca de ' + v(par.foro) + ' para dirimir quaisquer questões oriundas deste Contrato, com renúncia a qualquer outro, por mais privilegiado que seja.');
    P('E, por estarem justas e contratadas, as Partes assinam o presente Contrato, juntamente com 2 (duas) testemunhas.');
    B.push({ k: 'local', t: local });
    B.push({ k: 'sig', itens: [
      { nome: titularCedente, papel: 'CEDENTE' + (pj ? ' – p/ ' + v(p.nome) : '') },
      { nome: v(e.nome), papel: CE + (cpj && e.representante_nome ? ' – p/ ' + e.representante_nome : '') }
    ] });
    B.push({ k: 'sig', itens: [{ nome: 'Testemunha 1', papel: 'Nome / CPF:' }, { nome: 'Testemunha 2', papel: 'Nome / CPF:' }] });

    B.push({ k: 'break' });
    T('ANEXO I – DESCRIÇÃO DO CRÉDITO E DADOS PARA PAGAMENTO');
    B.push({ k: 'table', linhas: [
      ['Operação', 'nº ' + v(o.numero)],
      ['Cedente', titularCedente + (pj ? ' – CNPJ ' + v(p.cnpj) : ' – CPF ' + v(p.cpf))],
      ['Devedor', v(o.hospital)],
      ['CNPJ do devedor', v(o.hospital_cnpj)],
      ['Endereço do devedor', v(o.hospital_endereco)],
      ['Documento fiscal (NF / RPA)', v(o.documento_fiscal)],
      ['Serviço', 'Plantão médico' + (o.data_plantao ? ' realizado em ' + dataBR(o.data_plantao) : '')],
      ['Valor de face (líquido a receber do devedor)', dinheiro(o.valor_plantao)],
      ['Vencimento previsto', o.previsao_pagamento ? dataBR(o.previsao_pagamento) : VAZIO],
      ['Preço da cessão', dinheiro(o.valor_liquido)],
      ['Conta do CEDENTE para pagamento do Preço', contaCedente],
      ['Conta do(a) ' + CE + ' para pagamento pelo devedor', contaCess]
    ] });
    B.push({ k: 'local', t: local });
    B.push({ k: 'sig', itens: [{ nome: titularCedente, papel: 'CEDENTE' }, { nome: v(e.nome), papel: CE }] });

    if (par.notificacao) {
      B.push({ k: 'break' });
      T('NOTIFICAÇÃO DE CESSÃO DE CRÉDITO');
      P('Ao **' + v(o.hospital) + '** – CNPJ ' + v(o.hospital_cnpj) + ' – ' + v(o.hospital_endereco) + '.');
      P('Prezados Senhores,');
      P('Nos termos do art. 290 do Código Civil, notificamos V.Sas. de que o crédito abaixo, de titularidade de **' + titularCedente + '**, decorrente de serviços médicos prestados a essa instituição, foi cedido a **' + v(e.nome) + '** (' + (cpj ? 'CNPJ ' : 'CPF ') + v(e.documento) + '):');
      B.push({ k: 'table', linhas: [
        ['Documento fiscal (NF / RPA)', v(o.documento_fiscal)],
        ['Serviço', 'Plantão médico' + (o.data_plantao ? ' realizado em ' + dataBR(o.data_plantao) : '')],
        ['Valor líquido', dinheiro(o.valor_plantao)],
        ['Vencimento previsto', o.previsao_pagamento ? dataBR(o.previsao_pagamento) : VAZIO]
      ] });
      P('A partir do recebimento desta notificação, o pagamento do crédito deverá ser feito **exclusivamente** a ' + v(e.nome) + ', na conta: **' + contaCess + '**. O pagamento feito a qualquer outra pessoa não extinguirá a obrigação.');
      B.push({ k: 'local', t: local });
      B.push({ k: 'sig', itens: [{ nome: titularCedente, papel: 'CEDENTE' }, { nome: v(e.nome), papel: CE }] });
      H('CIÊNCIA E CONFIRMAÇÃO DO DEVEDOR');
      P('Declaramos ciência da cessão acima, confirmamos a existência do crédito no valor indicado, com vencimento previsto em ' + (o.previsao_pagamento ? dataBR(o.previsao_pagamento) : '____/____/______') + ', e que, nesta data, não há compensações, descontos ou glosas a opor. O pagamento será feito na conta indicada.');
      B.push({ k: 'sig', itens: [{ nome: v(o.hospital), papel: 'Nome, cargo e data:' }] });
    }
    return B;
  }
  function partesNegrito(t) {
    var p = String(t).split('**').map(function (s, i) { return { t: s, b: i % 2 === 1 }; });
    // pontuação logo após o negrito fica junto dele (evita espaço antes da vírgula no PDF justificado)
    for (var i = 0; i < p.length - 1; i++) {
      if (p[i].b) { var m = /^[,.;:)]+/.exec(p[i + 1].t); if (m) { p[i].t += m[0]; p[i + 1].t = p[i + 1].t.slice(m[0].length); } }
    }
    return p.filter(function (x) { return x.t; });
  }
  function contratoHtml(B) {
    return B.map(function (b) {
      if (b.k === 'title') return '<h2 class="ct-title">' + esc(b.t) + '</h2>';
      if (b.k === 'sub') return '<p class="ct-sub">' + esc(b.t) + '</p>';
      if (b.k === 'h') return '<h3 class="ct-h">' + esc(b.t) + '</h3>';
      if (b.k === 'p' || b.k === 'local') return '<p class="' + (b.k === 'local' ? 'ct-local' : 'ct-p') + '">' + partesNegrito(b.t).map(function (x) {
        var t = esc(x.t).replace(/\[__________\]/g, '<mark>[__________]</mark>');
        return x.b ? '<strong>' + t + '</strong>' : t;
      }).join('') + '</p>';
      if (b.k === 'sig') return '<div class="ct-sigs">' + b.itens.map(function (s) {
        return '<div class="ct-sig"><span class="ct-line"></span><strong>' + esc(s.nome) + '</strong><span>' + esc(s.papel) + '</span></div>';
      }).join('') + '</div>';
      if (b.k === 'table') return '<table class="ct-table">' + b.linhas.map(function (l) {
        return '<tr><th>' + esc(l[0]) + '</th><td>' + esc(l[1]).replace(/\[__________\]/g, '<mark>[__________]</mark>') + '</td></tr>';
      }).join('') + '</table>';
      if (b.k === 'break') return '<hr class="ct-break">';
      return '';
    }).join('');
  }
  function contratoPdf(B, titulo) {
    var content = [], grupo = null;
    function sigPdf(b) {
      return {
        columns: b.itens.map(function (s) {
          return { width: '*', stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7 }], margin: [0, 34, 0, 4] },
            { text: s.nome, bold: true, fontSize: 9.5 }, { text: s.papel, fontSize: 9, color: '#444' }
          ] };
        }), columnGap: 30, margin: [0, 6, 0, 10]
      };
    }
    B.forEach(function (b) {
      if (b.k === 'local') { grupo = { stack: [{ text: b.t, style: 'local' }], unbreakable: true }; content.push(grupo); return; }
      if (b.k === 'sig' && grupo) { grupo.stack.push(sigPdf(b)); return; }
      grupo = null;
      if (b.k === 'title') content.push({ text: b.t, style: 'title' });
      else if (b.k === 'sub') content.push({ text: b.t, style: 'sub' });
      else if (b.k === 'h') content.push({ text: b.t, style: 'h' });
      else if (b.k === 'p') content.push({ text: partesNegrito(b.t).map(function (x) { return { text: x.t, bold: x.b }; }), style: 'p' });
      else if (b.k === 'sig') content.push(Object.assign(sigPdf(b), { unbreakable: true }));
      else if (b.k === 'table') content.push({
        table: { widths: [170, '*'], body: b.linhas.map(function (l) { return [{ text: l[0], bold: true, fillColor: '#F1F5F9' }, l[1]]; }) },
        layout: { hLineColor: '#CBD5E1', vLineColor: '#CBD5E1' }, fontSize: 9.5, margin: [0, 6, 0, 12]
      });
      else if (b.k === 'break') content.push({ text: '', pageBreak: 'after' });
    });
    return {
      info: { title: titulo },
      pageSize: 'A4', pageMargins: [56, 56, 56, 60],
      defaultStyle: { fontSize: 10.5, lineHeight: 1.25 },
      footer: function (atual, total) { return { text: titulo + ' · página ' + atual + ' de ' + total, alignment: 'center', fontSize: 8, color: '#666', margin: [0, 20, 0, 0] }; },
      content: content,
      styles: {
        title: { fontSize: 13, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
        sub: { fontSize: 9.5, alignment: 'center', color: '#444', margin: [0, 0, 0, 14] },
        h: { fontSize: 10.5, bold: true, margin: [0, 10, 0, 4] },
        p: { alignment: 'justify', margin: [0, 0, 0, 6] },
        local: { margin: [0, 10, 0, 6] }
      }
    };
  }
  function faltandoContrato(o, p, e) {
    var f = faltandoNoCadastro(p).map(function (x) { return 'médico: ' + x; });
    function req(obj, campo, rot) { if (!String(obj[campo] == null ? '' : obj[campo]).trim()) f.push(rot); }
    req(o, 'hospital_cnpj', 'operação: CNPJ do hospital'); req(o, 'hospital_endereco', 'operação: endereço do hospital');
    req(o, 'documento_fiscal', 'operação: nº da NF/RPA'); req(o, 'previsao_pagamento', 'operação: vencimento previsto');
    req(o, 'valor_liquido', 'operação: valor líquido ao médico (preço)');
    req(e, 'nome', 'cessionário: nome / razão social'); req(e, 'documento', 'cessionário: CPF/CNPJ'); req(e, 'endereco', 'cessionário: endereço');
    if (e.tipo !== 'PF') { req(e, 'representante_nome', 'cessionário: representante'); req(e, 'representante_cpf', 'cessionário: CPF do representante'); }
    if (!e.pix && !e.banco) f.push('cessionário: conta para o hospital pagar');
    return f;
  }

  async function paginaContrato() {
    var sessao = await exigirLogin(); if (!sessao) return;
    var aviso = $('#aviso');
    var eu = await carregarPerfil(sessao.user.id).catch(function () { return null; });
    if (!eu || eu.papel !== 'admin') { location.replace('/area.html'); return; }
    montarCabecalho(eu, 'admin');
    var id = new URLSearchParams(location.search).get('op');
    if (!id) return mostrar(aviso, 'erro', 'Abra esta página pelo botão "Gerar contrato de cessão" no painel admin.');
    var res = await Promise.all([
      sb.from('operacoes').select('*, perfis(*)').eq('id', id).maybeSingle(),
      sb.from('empresa').select('*').eq('id', 1).maybeSingle()
    ]);
    if (res[0].error || !res[0].data) return mostrar(aviso, 'erro', 'Operação não encontrada.');
    var o = res[0].data, p = o.perfis || {}, e = res[1].data || {};
    $('#ct-titulo').textContent = 'Contrato de cessão · operação #' + o.numero;
    var f = $('#form-ct');
    f.cidade.value = e.cidade_assinatura || '';
    f.foro.value = e.foro || e.cidade_assinatura || '';
    f.data.value = new Date().toISOString().slice(0, 10);
    var falta = faltandoContrato(o, p, e);
    if (falta.length) mostrar($('#ct-falta'), 'erro', 'Campos em branco (vão aparecer como [__________] no contrato): ' + falta.join('; ') + '. Complete no cadastro do médico, na operação ou em Configurações do painel admin.');
    function params() { return { cidade: f.cidade.value.trim(), foro: f.foro.value.trim(), data: f.data.value, prazo: f.prazo.value.trim(), notificacao: f.notificacao.checked }; }
    function blocos() { return montarContrato(o, p, e, params()); }
    function previa() { $('#ct-previa').innerHTML = contratoHtml(blocos()); }
    previa();
    f.addEventListener('input', previa); f.addEventListener('change', previa);
    var nomeArq = 'contrato-cessao-operacao-' + o.numero + '.pdf';
    var tituloPdf = 'Cessão de crédito · operação nº ' + o.numero;
    $('#ct-baixar').addEventListener('click', function () {
      if (!window.pdfMake) return mostrar(aviso, 'erro', 'Não foi possível carregar o gerador de PDF. Recarregue a página.');
      window.pdfMake.createPdf(contratoPdf(blocos(), tituloPdf)).download(nomeArq);
    });
    $('#ct-salvar').addEventListener('click', async function () {
      if (!window.pdfMake) return mostrar(aviso, 'erro', 'Não foi possível carregar o gerador de PDF. Recarregue a página.');
      var b = this; b.disabled = true;
      try {
        mostrar(aviso, 'info', 'Gerando o PDF…');
        var blob = await window.pdfMake.createPdf(contratoPdf(blocos(), tituloPdf)).getBlob();
        var arquivo = new File([blob], nomeArq, { type: 'application/pdf' });
        await enviarArquivos(o.cliente_id, o.id, [{ file: arquivo, tipo: 'contrato' }], function (t) { mostrar(aviso, 'info', t); });
        var upd = { contrato_gerado_em: new Date().toISOString() };
        if (f.mudar_status.checked && ['em_analise', 'pendente_documentos', 'aprovada'].indexOf(o.status) > -1) upd.status = 'aguardando_assinatura';
        var r = await sb.from('operacoes').update(upd).eq('id', o.id);
        if (r.error) throw r.error;
        if (upd.status) o.status = upd.status;
        mostrar(aviso, 'ok', 'Contrato salvo nos documentos da operação #' + o.numero + (upd.status ? ' e status alterado para "Aguardando assinatura"' : '') + '. O médico já consegue ver e baixar na área dele.');
      } catch (err) { mostrar(aviso, 'erro', traduzErro(err)); }
      b.disabled = false;
    });
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
    var fn = { entrar: paginaEntrar, 'nova-senha': paginaNovaSenha, area: paginaArea, admin: paginaAdmin, contrato: paginaContrato }[pagina];
    if (fn) fn().catch(function (e) { mostrar($('#aviso'), 'erro', traduzErro(e)); });
  });
})();
