import { useMemo } from "react";
import { signOut } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth } from "../lib/firebase";
import backgroundImage from "../assets/background.png";
import cscIcon from "../assets/csc_logo.png";
import logoJd from "../assets/logo_jd.png";
import venezaEquip from "../assets/veneza_equip.png";
import { Header } from "../components/Header";
import { useAuth } from "../contexts/AuthContext";
import { formatSellerName } from "../utils/formatSellerName";

const alteracoesEntries = [
  {
    date: "23-01-2026",
    title: "Versão 1.3",
    items: [
      "Ajuste no PDF de Manutenção Essencial de 'Distribuidor John Deere' para 'Cliente'.",
      "Digitar ou colar um chassi válido no campo de chassi agora o seleciona automaticamente.",
      "Chassis são agora sempre em maiúsculo nos PDFs.",
      "Ajuste no nome de arquivo dos PDFs em casos específicos.",
      "Corrigido o cálculo de partes/h em planos que não começam pela revisão de 500h.",
    ],
  },
  {
    date: "12-01-2026",
    title: "Versão 1.2",
    items: [
      "Ajuste gerais dos PDFs.",
      "Inclusão do aviso de manutenção de 2000h no PDF do Plano de Manutenção.",
      "Inclusão da métrica de Partes/h no PDF do Plano de Manutenção.",
      "Inclusão do chassi ao nome de arquivo dos PDFs.",
      "Adição de funções de administrador.",
      "Adição das páginas perfil e registro de alterações.",
      "Adição do menu sanduíche e ajuste dele no mobile.",
      "Adição de delimitação de filiais por usuário.",
      "Correção do cabeçalho em dispositivos mobile.",
    ],
  },
  {
    date: "15-12-2025",
    title: "Versão 1.1",
    items: [
      "Lançamento da página de garantia.",
      // "Criação da base e do template de garantia estendida.",
      // "Implementação de autenticação nas requisições ao RTDB.",
      // "Adição de rotas protegidas.",
      // "Criação de contexto compartilhado para dados entre páginas.",
      "Padronização visual e estrutural entre páginas de garantia.",
      "Criação e ajustes da tabela de garantia.",
      // "Espelhamento da tabela de garantia com o aplicativo.",
      "Adição de descontos de garantia e validação de seleção de horas.",
      "Inclusão de modalidades Compreensivo e Governamental.",
      "Adição de disclaimer na página e nos PDFs de garantia.",
      "Ajustes de textos, rótulos e nomenclaturas (modelos, planos e termos).",
      "Correções de taxa, markup e valores de custo.",
      "Correção do custo de deslocamento por revisão.",
      "Alteração do prazo de expiração dos PDFs para 5 dias.",
      "Adição de exportação CSV.",
      "Ajustes no nome dos arquivos PDF e CSV.",
      "Adição de imagens de máquinas nos PDFs.",
      "Ajustes de layout para dispositivos pequenos.",
      "Melhorias no preview e nas opções de pagamento.",
      "Ajustes no header, login e mensagens offline.",
      // "Adição do idioma pt-BR.",
      // "Remoção temporária do plano premium.",
      "Correções ortográficas e ajustes finos gerais.",
    ],
  },
  {
    date: "02-12-2025",
    title: "Versão 1.0",
    items: ["Versão inicial apresentada em reunião."],
  },
];

export default function AlteracoesPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const navLinks = useMemo(
    () => [
      { to: "/", label: t("common.appName") },
      { to: "/garantia", label: "PowerGard" },
    ],
    [t],
  );

  const sellerNameLabel = useMemo(
    () => formatSellerName(user?.email ?? null, t("common.notProvided")),
    [t, user?.email],
  );

  if (!user) {
    return (
      <main className="min-h-dvh grid place-items-center bg-background text-foreground">
        {t("common.logging")}
      </main>
    );
  }

  return (
    <main
      className="relative min-h-screen max-h-screen min-h-[100svh] max-h-[100svh] w-screen overflow-y-auto overflow-x-hidden no-scrollbar bg-background text-foreground flex flex-col
             before:fixed before:inset-0 before:bg-black/50 before:z-0 before:pointer-events-none"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="relative z-10 mt-12 flex flex-1 flex-col">
        <Header
          // title={t("common.appName")}
          title={"Registro de Alterações"}
          sellerName={sellerNameLabel}
          links={navLinks}
          signOutLabel={t("header.signOut")}
          onSignOut={() => signOut(auth)}
        />

        <section className="mx-auto max-w-3xl px-4 py-8 w-full flex-1">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xl">
            {/* <h1 className="text-xl font-semibold text-foreground">alteracoes</h1> */}
            {/* <p className="mt-1 text-sm text-foreground">
              Historico resumido das mudancas (mock).
            </p> */}

            <div className="mb-4 sm:col-span-2">
              <div className="rounded-xl border border-border bg-surface p-2">
                <p className="text-sm text-center leading-relaxed text-foreground font-bold">
                  Para informar erros ou sugestões, favor entrar em contato com:
                </p>
                <p className="text-sm text-center leading-relaxed text-foreground font-bold">
                  Artur Catunda
                </p>
                <p className="text-sm text-center leading-relaxed text-foreground font-bold">
                  artur.catunda@venezanet.com
                </p>
                <p className="text-sm text-center leading-relaxed text-foreground font-bold">
                  (85) 99194-4383
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {alteracoesEntries.map((entry) => (
                <div
                  key={`${entry.date}-${entry.title}`}
                  className="rounded-xl border border-border bg-surface-muted p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {entry.title}
                    </span>
                    <span className="text-xs text-foreground/70">
                      {entry.date}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-foreground">
                    {entry.items.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-3 px-4 pb-3 flex flex-row items-center w-full justify-between">
          <div className="px-4 flex flex-row justify-end">
            <img src={cscIcon} alt="CSC" className="h-12 w-auto drop-shadow" />
          </div>
          <div className="px-4 flex flex-row justify-end">
            <img
              src={venezaEquip}
              alt="Veneza Equipamentos"
              className="h-8 w-auto drop-shadow"
            />
            <div className="bg-white h-fit">
              <img src={logoJd} alt="John Deere" className="h-8 w-auto" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
