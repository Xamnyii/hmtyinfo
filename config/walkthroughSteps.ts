export type WalkthroughPlacement = "left" | "right" | "top" | "bottom" | "center";

export type WalkthroughStep = {
  id: string;
  title: string;
  description: string;
  cta?: string;
  target: string;
  route: string;
  placement: WalkthroughPlacement;
  buttonPrimary?: string;
  buttonSecondary?: string;
};

export const walkthroughSteps: WalkthroughStep[] = [
  {
    id: "welcome",
    title: "Bienvenido al centro de investigación",
    description: "Aquí podrás investigar movimientos financieros, descubrir conexiones entre empresas y dejar que nuestros agentes rastreen posibles esquemas de fraude.",
    target: "body",
    route: "/mainpage",
    placement: "center",
    cta: "Comenzar recorrido",
    buttonSecondary: "Omitir",
  },
  {
    id: "new-investigation",
    title: "Comienza una investigación",
    description: "Desde aquí puedes abrir un nuevo caso y proporcionar los datos que analizará el agente.",
    target: '[data-tour="new-investigation"]',
    route: "/mainpage",
    placement: "right",
  },
  {
    id: "evidence",
    title: "Proporciona la evidencia",
    description: "Agrega registros financieros, archivos o fuentes de información. Estos datos serán el punto de partida de la investigación.",
    target: '[data-tour="evidence"]',
    route: "/mainpage",
    placement: "right",
  },
  {
    id: "ai-agent",
    title: "Tu investigador de IA",
    description: "El agente analiza la evidencia, formula hipótesis, sigue pistas y decide qué herramientas utilizar durante la investigación.",
    target: '[data-tour="ai-agent"]',
    route: "/mainpage",
    placement: "right",
  },
  {
    id: "mcp-tools",
    title: "Herramientas especializadas",
    description: "Durante una investigación, el agente puede utilizar herramientas especializadas para consultar, comparar y analizar diferentes tipos de información.",
    target: '[data-tour="mcp-tools"]',
    route: "/investigacion",
    placement: "left",
  },
  {
    id: "money-flow",
    title: "Sigue el dinero",
    description: "Visualiza cómo se conectan empresas, proveedores, cuentas y transacciones mientras el agente reconstruye el flujo del dinero.",
    target: '[data-tour="money-flow"]',
    route: "/investigacion",
    placement: "left",
  },
  {
    id: "evidence-trail",
    title: "Observa cómo avanza la investigación",
    description: "Cada hallazgo queda vinculado con su evidencia para que puedas entender cómo el agente llegó a sus conclusiones.",
    target: '[data-tour="evidence-trail"]',
    route: "/investigacion",
    placement: "left",
  },
  {
    id: "forensic-report",
    title: "Tu expediente forense",
    description: "Al finalizar, obtendrás un expediente con el esquema detectado, entidades implicadas, evidencia, flujo del dinero y conclusiones de la investigación. También podrás revisar qué pistas fueron descartadas y por qué.",
    target: '[data-tour="forensic-report"]',
    route: "/investigacion",
    placement: "left",
  },
  {
    id: "final",
    title: "Todo listo",
    description: "Ya conoces las herramientas principales. Inicia una investigación y deja que el agente siga las pistas.",
    target: "body",
    route: "/mainpage",
    placement: "center",
    cta: "Iniciar investigación",
    buttonSecondary: "Finalizar recorrido",
  },
];
