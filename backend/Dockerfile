# Usar node 20 alpine
FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependência
COPY backend/package*.json ./backend/
COPY shared/ ./shared/

# Instalar dependências do backend
WORKDIR /app/backend
RUN npm ci

# Voltar para a raiz para copiar o código e buildar
WORKDIR /app
COPY backend/ ./backend/

# Build do projeto
WORKDIR /app/backend
RUN npm run build

# Expor a porta definida no docker-compose (3002)
EXPOSE 3002

# Comando para rodar
CMD ["npm", "start"]
