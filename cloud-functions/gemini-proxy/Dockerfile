FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
ENV PORT=8080
EXPOSE 8080
# Cloud Functions Framework 사용
CMD ["npx", "functions-framework", "--target=geminiProxy", "--port=8080"]
