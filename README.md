# OmniChat - Sistema de Atendimento Multi-Canal

Bem-vindo ao OmniChat! Este é um sistema completo de atendimento ao cliente com suporte a múltiplos canais (WhatsApp, WebChat), gestão de filas, respostas rápidas e dashboard de métricas.

## 🚀 Funcionalidades Entregues

### 1. Multi-Canal
- **WebChat Embeddable**: Widget pronto para ser colocado em qualquer site.
- **WhatsApp Oficial (Cloud API)**: Adapter implementado para integração direta com a Meta.
- **GTI (uazapi)**: Suporte legado a API não-oficial.

### 2. Gestão de Conversas
- **Filas de Atendimento**: Organize conversas por departamentos.
- **Respostas Rápidas**: Atalhos (`/atalho`) para mensagens frequentes.
- **Mídia**: Suporte a envio e recebimento de Imagem, Áudio (com Player), Vídeo e Documentos.
- **Deleção**: Possibilidade de apagar conversas e contatos (Lixeira).

### 3. Produtividade & UI
- **Dashboard**: Métricas em tempo real de conversas abertas, resolvidas e volume de mensagens.
- **Notificações Globais**: Toasts interativos ("Ver") quando chega mensagem em outra aba.
- **Modo Dark/Light**: Interface limpa e responsiva.

---

## 📦 Instalação e Uso

### Pré-requisitos
- Node.js 18+
- SQL Server Express (Local ou Docker)

### 1. Configurar Banco de Dados
1. Crie um banco chamado `OmniChatDev`.
2. Execute os scripts na pasta `backend/db/` na ordem:
   - `01-schema.sql` (Tabelas)
   - `02-canned-and-automation.sql` (Dados iniciais)
   - `03-seed.sql` (Opcional, usuários de teste)

### 2. Backend
No terminal, entre na pasta `backend`:
```bash
cd backend
npm install
# Configure o .env (copie do .env.example e ajuste DB_USER/DB_PASS)
npm run dev
```
O servidor rodará em `http://localhost:3001`.

### 3. Frontend
Em outro terminal, entre na pasta `frontend`:
```bash
cd frontend
npm install
npm run dev
```
Acesse a aplicação em `http://localhost:5173`.
Login padrão (se usou seed): `admin@omni.chat` / `123456`.

---

## 📖 Guia de Uso Rápido

### Acessar o WebChat
1. Certifique-se que o backend está rodando.
2. Acesse `http://localhost:3001/widget.html`.
3. Envie uma mensagem como visitante.
4. No OmniChat (frontend), veja a mensagem chegar e responda!

### Configurar WhatsApp Oficial
1. Vá em **Configurações** (⚙️) no menu lateral.
2. Em **Adapter Padrão**, selecione `OFFICIAL`.
3. Insira o `Phone ID` e o `Access Token` da Meta Developers.
4. Salve. O sistema agora usará a API Oficial para envios.

### Dashboard
Clique no ícone **📊** para ver o resumo da operação (Conversas em aberto, Resolvidas, etc).

---

## 🏗️ Estrutura do Projeto

- **backend/**: API Node.js + Express + Socket.IO.
  - `src/adapters/`: Lógica de conexão com canais (GTI, Official, WebChat).
  - `src/services/`: Regras de negócio.
  - `public/`: Arquivos estáticos (Widget).
- **frontend/**: React + Vite + TypeScript.
  - `src/components/`: Componentes UI reutilizáveis.
  - `src/App.tsx`: Lógica principal e rotas.

---

**Desenvolvido como MVP para Escala.**
Pronto para deploy e uso!
