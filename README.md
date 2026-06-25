# 🌙 Pernoite Ronda Noturna — lovable-pernoite

Sistema web completo para controle de veículos em estacionamento durante a ronda noturna. Funciona **100% offline**, sem dependência de servidor externo — todos os dados são salvos no `localStorage` do navegador.

---

## 🚀 Acesso

**GitHub Pages:** `https://may0lphi.github.io/lovable-pernoite/`

---

## ✨ Funcionalidades

- 📋 **Criação de sessões** de pernoite com nome do vigilante, horário e local
- 🏢 **Setores configuráveis** do estacionamento (ZARP, CREDCARROS, Azul, Verde, etc.)
- 📷 **Escaneamento de placas por câmera ou galeria** com reconhecimento via IA (Gemini Vision)
- 🤖 **OCR automático** — lê placa, marca, modelo e cor do veículo diretamente da foto
- 🗃️ **Cadastro de veículos conhecidos** — veículos fichados são identificados automaticamente
- 📊 **Histórico de rondas** — todas as sessões ficam salvas localmente
- 📱 **Relatório para WhatsApp** — gera texto formatado pronto para envio
- 💾 **Offline-first** — funciona sem internet após o primeiro carregamento

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React + Vite |
| Estilização | TailwindCSS |
| Persistência | `localStorage` (offline) |
| IA / OCR | Google Gemini Vision API (pool de chaves) |
| Deploy | GitHub Pages via GitHub Actions |

---

## ⚙️ Configuração Local

### 1. Instalar dependências

```bash
cd frontend
npm install
```

### 2. Configurar chaves do Gemini

Copie o arquivo de exemplo e insira suas chaves:

```bash
cp src/lib/keys.example.js src/lib/keys.js
```

Edite `src/lib/keys.js`:

```js
export const GEMINI_KEYS = [
  "SUA_CHAVE_AQUI",
  "OUTRA_CHAVE_AQUI"
];
```

> ⚠️ O arquivo `keys.js` está no `.gitignore` e **nunca será enviado ao repositório**.

### 3. Rodar em desenvolvimento

```bash
npm run dev
```

### 4. Build de produção

```bash
npm run build
```

---

## 🔄 Deploy Automático (GitHub Actions)

O deploy é feito automaticamente ao fazer push na branch `main`.

O workflow em `.github/workflows/deploy.yml`:
1. Instala dependências
2. Injeta as chaves Gemini a partir do secret `GEMINI_KEYS_JSON`
3. Executa o build (`npm run build`)
4. Publica o conteúdo de `frontend/dist/` no GitHub Pages

### Configurar o secret no GitHub

Em **Settings → Secrets and Variables → Actions**, crie o secret:

| Nome | Valor (exemplo) |
|------|----------------|
| `GEMINI_KEYS_JSON` | `["CHAVE1","CHAVE2","CHAVE3"]` |

---

## 📁 Estrutura do Projeto

```
lovable-pernoite/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Pipeline de CI/CD
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/         # Componentes React
    │   ├── lib/
    │   │   ├── api.js          # CRUD local (localStorage)
    │   │   ├── keys.js         # Chaves Gemini (ignorado no git)
    │   │   └── keys.example.js # Template das chaves
    │   └── pages/              # Telas da aplicação
    └── package.json
```

---

## 💡 Arquitetura de Dados

Todos os dados são armazenados no `localStorage` do navegador sob as chaves:

| Chave | Conteúdo |
|-------|----------|
| `vtr_sessions` | Lista de sessões de ronda |
| `vtr_sectors` | Setores do estacionamento |
| `vtr_vehicles` | Cadastro de veículos conhecidos |

---

## 📝 Licença

Uso interno. Desenvolvido para operações de vigilância noturna de estacionamento.
