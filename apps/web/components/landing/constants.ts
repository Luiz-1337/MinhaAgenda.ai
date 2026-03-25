import { Calendar, MessageSquare, ShoppingBag, TrendingUp, Clock, Shield } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface Plan {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
  buttonText: string;
}

export const FEATURES: Feature[] = [
  {
    title: "Agendamento Inteligente",
    description: "O agente conversa com seus clientes 24/7, encontra horários livres e agenda automaticamente, sincronizando com sua agenda.",
    icon: Calendar
  },
  {
    title: "Respostas Instantâneas",
    description: "Dúvidas sobre preços, localização ou procedimentos? A IA responde na hora, com a personalidade da sua marca.",
    icon: MessageSquare
  },
  {
    title: "Recomendação de Produtos",
    description: "Baseado no histórico do cliente, a IA sugere produtos de manutenção para casa, aumentando seu ticket médio.",
    icon: ShoppingBag
  },
  {
    title: "Gestão de Pedidos",
    description: "Acompanhe vendas de produtos e agendamentos em tempo real através de um dashboard intuitivo.",
    icon: TrendingUp
  },
  {
    title: "Economia de Tempo",
    description: "Pare de responder WhatsApp o dia todo. Deixe a IA cuidar do atendimento repetitivo enquanto você foca na arte.",
    icon: Clock
  },
  {
    title: "Segurança de Dados",
    description: "Seus dados e os de seus clientes protegidos com criptografia de ponta a ponta.",
    icon: Shield
  }
];

export const PLANS: Plan[] = [
  {
    name: "Solo",
    price: "R$ 299",
    highlight: true,
    description: "Ideal para profissionais autonomos que querem automatizar o atendimento.",
    features: [
      "1 Salao",
      "1 Agente IA",
      "Atendimento WhatsApp automatizado",
      "Agendamento inteligente",
      "Suporte por email"
    ],
    buttonText: "Escolher Solo"
  },
  {
    name: "Pro",
    price: "R$ 999",
    description: "Para negocios em crescimento que precisam de mais capacidade e integracao.",
    features: [
      "Ate 3 Saloes",
      "3 Agentes IA",
      "Integracoes avancadas",
      "Relatorios e metricas",
      "Suporte prioritario"
    ],
    buttonText: "Escolher Pro"
  },
  {
    name: "Enterprise",
    price: "Sob Consulta",
    description: "Solucao personalizada para redes e grandes operacoes.",
    features: [
      "Saloes ilimitados",
      "Agentes ilimitados",
      "API dedicada",
      "Gerente de conta exclusivo",
      "SLA garantido"
    ],
    buttonText: "Fale conosco"
  }
];

