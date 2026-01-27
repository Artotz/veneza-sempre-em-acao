import i18n from "i18next";
import { initReactI18next } from "react-i18next";

type LanguageOption = {
  code: "pt";
  label: string;
};

export const LANGUAGE_STORAGE_KEY = "pmp-language";

export const LANGUAGES: LanguageOption[] = [{ code: "pt", label: "Portugues" }];

const supportedLanguages = LANGUAGES.map((option) => option.code);

const getInitialLanguage = () => {
  if (typeof window === "undefined") return "pt";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && supportedLanguages.includes(stored as LanguageOption["code"])) {
    return stored as LanguageOption["code"];
  }
  const browser = navigator.language.split("-")[0];
  if (supportedLanguages.includes(browser as LanguageOption["code"])) {
    return browser as LanguageOption["code"];
  }
  return "pt";
};

const resources = {
  pt: {
    translation: {
      common: {
        appName: "Plano de Manutenção",
        logging: "Autenticando...",
        loading: "Carregando...",
        offline: "Você está offline.",
        lastUpdate: "Última atualização: {{value}}",
        tryGoOnline: "Tentar ficar online",
        syncing: "Sincronizando...",
        notProvided: "Não informado",
        errorPrefix: "Erro",
        itemsCount: "{{count}} itens",
        listTotalSingle: "Total: {{value}}",
        tableTotalSingle: "Total: {{value}}",
        totalLabel: "Total",
      },
      messages: {
        offlineNoCache:
          "Sem conexão e sem dados em cache. Conecte-se para baixar o maintenance.json.",
        genericLoad:
          "Não foi possível carregar os dados. Tente novamente quando estiver online.",
      },
      errors: {
        firebaseUrlMissing: "VITE_FIREBASE_DB_URL não configurada.",
        maintenanceMissing: "maintenance.json não encontrado no RTDB.",
        syncOffline: "Sem conexão para sincronizar.",
      },
      header: {
        guest: "Visitante",
        signOut: "Sair",
        languageLabel: "Idioma",
      },
      auth: {
        title: "Veneza Service Plan",
        emailPlaceholder: "E-mail",
        passwordPlaceholder: "Senha",
        submit: "Entrar",
        forgotPassword: "Esqueci minha senha",
        forgotEmailRequired: "Informe o e-mail para recuperar a senha.",
        invalidCredentials: "Credenciais inválidas.",
        networkError: "Verifique sua conexão e tente novamente.",
        resetEmailSent:
          "Se seu e-mail estiver registrado, um link será enviado para {{email}}.",
      },
      filters: {
        family: "Família",
        model: "Modelo",
        hours: "Horas",
        startHour: "Revisão inicial",
        endHour: "Revisão final",
        branch: "Filial",
        serviceType: "Tipo de Atendimento",
        planType: "Tipo de Plano",
        paymentCondition: "Condição de pagamento",
        payment: "Pagamento",
        laborDiscount: "Desconto M.O.",
        partsDiscount: "Desconto de Peças",
        lubeDiscount: "Desconto de Lubrif.",
        planTypes: {
          premium: "Premium",
          essential: "Essencial",
        },
        branches: {
          lem: "VE LEM",
          bayeux: "VE BAYEUX",
          recife: "VE RECIFE",
          mossoro: "VE MOSSORO",
          salvador: "VE SALVADOR",
          fortaleza: "VE FORTALEZA",
          petrolina: "VE PETROLINA",
        },
        payments: {
          upfront: "À vista",
          x1: "30 dias",
          x2: "30/60 dias",
          x3: "30/60/90 dias",
          x4: "30/60/90/120 dias",
          x5: "30/60/90/120/150 dias",
          x6: "30/60/90/120/150/180 dias",
        },
        partsDiscounts: {
          plan: "15% - Com Plano",
          noPlan: "10% - Sem Plano",
          campaign: "5% - Campanha",
        },
        serviceTypes: {
          internal: "Interno",
          external: "Externo",
          jd: "John Deere",
        },
        lubeDiscounts: {
          noPlan: "10% - Sem Plano",
          plan: "15% - Com Plano",
          table: "0% - Tabela",
        },
      },
      stats: {
        partsTotal: "Total Peças",
        lubeTotal: "Total Lubrificante",
        finalTotal: "Total Geral",
        generateDocument: "Visualizar Documento",
      },
      list: {
        title: "Lista de Itens",
        count: "{{count}} itens",
        export: "Exportar Lista",
        open: "Abrir Lista",
        close: "Fechar Lista",
        headers: {
          model: "Modelo",
          revision: "Revisão",
          type: "Tipo",
          code: "Código",
          quantity: "Qtd.",
          description: "Descrição",
          over: "Valor",
        },
      },
      pdf: {
        listTitle: "JDP - Lista de Itens",
        listFilePrefix: "JDP",
        essentialPiecesProposal: "PROPOSTA COMERCIAL JOHN DEERE PROTECT",
        powerGardProposal: "PROPOSTA COMERCIAL JOHN DEERE POWERGARD",
        model: "Modelo",
        hours: "Horas",
        branch: "Filial",
        payment: "Pagamento",
        laborDiscount: "Desconto M.O.:",
        commercialProposal: "PROPOSTA COMERCIAL",
        logo: "LOGO",
        customerData: "DADOS DO CLIENTE",
        customerName: "Nome/Razão Social:",
        customerPhone: "Telefone:",
        chassis: "Chassi:",
        paymentCondition: "Condição de pagamento:",
        proposalDate: "Data da Proposta:",
        revisionData: "DADOS DA REVISÃO",
        plan: "Plano:",
        planEssential: "ESSENCIAL",
        revision: "Revisão:",
        itemsPrice: "Preço dos itens:",
        documentPayment: "Pagamento:",
        revisionsTotalParts: "Total Peças:",
        revisionsTotalLabor: "Total M.O.:",
        signatures: {
          legalRepresentative: "Assinatura do responsável legal",
          legalDocument: "RG/CPF do Representante Legal",
          role: "Cargo",
        },

        terms: "TERMOS E CONDIÇÕES",

        termsMain:
          "*O cliente deverá seguir as instruções do manual de operação e manutenção de seu equipamento. É obrigatório o uso de peças genuínas John Deere.\n" +
          "**Os valores acima constam apenas as peças, os valores referentes a mão-de-obra e ao deslocamento serão faturados após aprovação e execução do serviço, de acordo com os valores vigentes de serviços aplicados na ocasião\n" +
          "**A amostra será coletada pelo cliente, seguindo as instruções de coleta fornecidas pela fábrica. A amostra deverá ser entregue a uma unidade do Distribuidor John Deere para ser enviada para a análise. Neste plano, estão inlcusos os kits de análise de óleo. Há opção de aquisição do plano com as demais peças e lubrificantes das respectivas revisões. O programa John Deere ProtectTM é de abrangência nacional. O faturamento e a entrega das peças presentes no plano de manutenção deste equipamento acontecerão de forma imediata. Os preços indicados nesta proposta são válidos para execução dos serviços de segunda à sexta-feira, das 8:00 as 18:00 horas, as quais incluem apenas as coletas de óleo e revisões a cada 2000 horas. Serviços requeridos fora deste período, por necessidade do cliente, serão acrescidos de horas extras e serão faturados separadamente. Peças aplicadas por especialistas dos distribuidores John Deere contam com 12 meses de garantia contra defeitos de fabricação. Os preços no ato da cobrança de cada parcela do montante desta proposta são para prazo de 30 dias. Caso o equipamento não esteja comunicando, fica sobre a responsabilidade do contratante informar e sinalizar o distribuidor John Deere quando a revisão estiver próxima com base no horímetro demonstrado no equipamento. Não haverá pagamentos de licenças ou renovações de licenças do sistema. O monitoramento do equipamento será no período de segunda a sexta-feira, horário comercial. O sistema atualiza os dados a cada 60 minutos para uma maior precisão na tomada de decisão. Necessário a região de trabalho ter cobertura de dados móveis para o monitoramento e configurações dos equipamentos. Caso o local do trabalho não tenha cobertura, o sistema armazenará todos os dados gerados até entrar em local com cobertura onde irá descarregar todas as informações na plataforma. Os dados gerados pelo equipamento são de propriedade exclusiva do cliente, o Centro de Soluções Conectadas dos distribuidores John Deere assegura a confidencialidade das informações e poderá fazer uso dos dados apenas para monitoramento proativo com objetivo de aumentar a disponibilidade e performance da máquina.",

        nonEligibleTitle: "ITENS NÃO ELEGÍVEIS PELA COBERTURA POWERGARD",

        nonEligibleItems:
          "1. Peças/kits não pedidos de fábrica e instalados após a compra do equipamento, não serão cobertos pelo programa PowerGard.\n" +
          "2. Os implementos instalados após a compra, como guincho não oriundo de fábrica, são excluídos de qualquer cobertura do programa PowerGard.\n" +
          "3. Os implementos florestais instalados de fábrica, como módulos de medição, módulos de corte, colheitadeiras, desgalhadoras e todos os implementos Waratah, não se qualificam para o programa PowerGard.\n" +
          "4. Baterias, mangueiras, rádios ou pneus.\n" +
          "5. Franquia cobrada por horas extras solicitadas pelo proprietário.\n" +
          "6. Os custos para transporte do produto para o local onde o serviço será realizado ou visitas de manutenção corretiva pelo Distribuidor.\n" +
          "7. Depreciação e desgaste normal.\n" +
          "8. Danos causados pelos seguintes motivos:\n" +
          "   a) Utilização ou cuidados inadequados com a máquina; b) Aplicação na qual a máquina está trabalhando; c) Falta de manutenção; d) Falha ao seguir as instruções operacionais; e) Falta de proteção durante o armazenamento; f) Vandalismo; g) Elementos; h) Colisão ou outros acidentes.\n" +
          "9. Manutenção normal e substituição de itens que se desgastam com o uso normal, como: filtros, óleo, líquidos de arrefecimento e condicionadores, lâminas e bordas de corte, pinos e buchas (exceto nas juntas de articulação), mangueiras, linhas e conexões, trem de aterramento, correias, freios secos e revestimentos da embreagem seca, lâmpadas, correias de borracha e amortecedores da garra do rebocador.\n" +
          "10. Danos causados a um componente coberto por um componente sem cobertura que é utilizado ou instalado no produto.\n" +
          "11. Para os reparos de garantia feitos em campo, todas as despesas (tais como tempo de locomoção do revendedor, quilometragem ou horas extras) que não existiriam se o produto tivesse sido reparado nas dependências do revendedor.",

        coverageEndTitle: "TÉRMINO DA COBERTURA POWERGARD",

        coverageEnd:
          "A John Deere é dispensada de suas obrigações nos termos do PowerGard se:\n" +
          "1. O serviço (além da manutenção normal e substituição de itens de serviço) for realizado por qualquer outra pessoa que não um distribuidor autorizado John Deere; ou\n" +
          "2. O produto for modificado ou alterado em formas não aprovadas pela John Deere; ou\n" +
          "3. O medidor de horas do equipamento estiver com defeito ou tiver sido violado; ou\n" +
          "4. O produto for removido do país em que o PowerGard foi adquirido; ou\n" +
          "5. O plano de manutenção preventiva da máquina não for seguido; ou\n" +
          "6. O equipamento for usado dentro de uma aplicação que não a designada no PowerGard do produto.\n" +
          "*O faturamento do PowerGard para este equipamento ocorrerá mediante a aceitação desta proposta, sendo emitido boleto para 30 dias.",

        validity: "Prazo de validade: {{date}}",
        filePrefix: "Proposta_Comercial",
      },
      families: {
        backhoe: "Retroescavadeira",
        wheel: "Pá-Carregadeira",
        motor: "Motoniveladora",
        crawler: "Trator de Esteira",
        excavator: "Escavadeira",
      },
    },
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: "pt",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
