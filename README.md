# adiantamed.com.br

Site estático da adiantaMed, pronto para o GitHub Pages.

## Publicar

1. Crie um repositório no GitHub (ex.: `adiantamed-site`) e suba **todos** os arquivos desta pasta na raiz, incluindo `CNAME` e `.nojekyll`.
2. No repositório: **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em **Custom domain** confirme `adiantamed.com.br` e marque **Enforce HTTPS** quando liberar.
4. No registro do domínio (Registro.br), aponte o DNS:
   - 4 registros **A** para `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - 1 registro **CNAME** para `www` → `SEU-USUARIO.github.io`

## Antes de publicar, troque

| Onde | O quê |
|---|---|
| `main.js` (topo) | `taxaMensal` e `taxaMinima` do simulador (o WhatsApp já está configurado) |
| Todas as páginas (rodapé) | `CNPJ [00.000.000/0001-00]` |
| `duvidas.html` / `index.html` | respostas marcadas com `[...]` (documentos, taxas, prazo, atraso do hospital) |
| `quem-somos.html` | texto institucional |
| `contato.html` | horário de atendimento |
| `privacidade.html`, `termos.html` | razão social, endereço, encarregado (DPO) — revisar com advogado |

Dica: busque por `[` em todos os arquivos para achar o que falta.

## Arquivos

- **Páginas:** `index.html`, `como-funciona.html`, `simulacao.html`, `para-hospitais.html`, `quem-somos.html`, `duvidas.html`, `contato.html`, `privacidade.html`, `termos.html`, `404.html`
- **Estilo e scripts:** `style.css`, `main.js`
- **Marca:** `logo.svg` / `logo.png` (fundo claro), `logo-branco.svg` / `logo-branco.png` (fundo escuro), `icone.svg`
- **Ícones:** `favicon.ico`, `favicon.svg`, `favicon-32.png`, `favicon-192.png`, `favicon-512.png`, `apple-touch-icon.png`, `icone-maskable.svg`, `icone-maskable-512.png`
- **Compartilhamento:** `og-image.png` (prévia de link no WhatsApp, LinkedIn etc.)
- **Redes sociais:** `perfil-redes-sociais.png` (foto de perfil 1080×1080 para Instagram/WhatsApp Business)
- **Config:** `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml`, `site.webmanifest`

## Como o site funciona sem servidor

- **Simulador:** calcula no navegador e envia o resultado pronto pelo WhatsApp.
- **Formulário de contato:** monta a mensagem e abre o WhatsApp — não precisa de backend.
- Envio de documentos e geração automática do contrato de cessão exigem um backend (ex.: Google Apps Script + Drive + plataforma de assinatura) — próxima etapa.

## Cor do topo
O tema é definido no `<html data-theme="azul">` de cada página. Opções prontas no `style.css`: `azul`, `rose`, `branco`.
