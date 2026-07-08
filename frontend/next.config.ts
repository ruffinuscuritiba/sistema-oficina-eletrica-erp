import type { NextConfig } from "next";
import path from "path";

// Fixa a raiz do Turbopack neste diretorio. Sem isso, a auto-deteccao de
// workspace (via package-lock.json) sobe pro diretorio pai -- e o nome dessa
// pasta (com "&" e espaco) quebra o path-join interno do Turbopack ao tentar
// calcular caminhos relativos entre as duas raizes ("leaves the filesystem root").
const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
