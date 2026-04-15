import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true,           // bind to 0.0.0.0
    allowedHosts: true, // accept any Host header
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
});
