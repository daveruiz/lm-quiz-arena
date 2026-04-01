import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true, // listen on 0.0.0.0 — allows access from any host / network IP
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
});
