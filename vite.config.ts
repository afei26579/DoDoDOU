import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 或 true，监听所有接口
    port: 5173,      // 固定端口，避免随机
    strictPort: true // 端口被占用时报错，不自动换
  }
});
