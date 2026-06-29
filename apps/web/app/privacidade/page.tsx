import type { Metadata } from "next";
import Link from "next/link";
import { Bot } from "lucide-react";
import Footer from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Política de Privacidade — MinhaAgenda AI",
  description:
    "Como a MinhaAgenda AI coleta, usa, compartilha e protege os dados pessoais, em conformidade com a LGPD e com as políticas da Plataforma WhatsApp Business da Meta.",
  alternates: { canonical: "/privacidade" },
};

const UPDATED_AT = "29 de junho de 2026";

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 w-full z-10 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
              <Bot className="text-accent-foreground" size={20} />
            </div>
            <span className="font-bold text-xl text-foreground tracking-tight">
              minha<span className="text-accent">agenda</span>.ai
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors"
            >
              Voltar para Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <article className="max-w-3xl mx-auto">
          <header className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Política de Privacidade
            </h1>
            <p className="text-sm text-muted-foreground">
              Última atualização: {UPDATED_AT}
            </p>
          </header>

          <div className="space-y-10 text-muted-foreground leading-relaxed">
            <section className="space-y-4">
              <p>
                Esta Política de Privacidade descreve como{" "}
                <strong className="text-foreground">
                  LUIZ GUILHERME DE OLIVEIRA TECNOLOGIA DA INFORMACAO LTDA
                </strong>
                , inscrita no CNPJ sob o nº{" "}
                <strong className="text-foreground">64.983.542/0001-04</strong>{" "}
                (“MinhaAgenda”, “nós”), coleta, utiliza, compartilha e protege os
                dados pessoais tratados por meio da plataforma{" "}
                <strong className="text-foreground">MinhaAgenda AI</strong>{" "}
                (o “Serviço”), em conformidade com a Lei nº 13.709/2018 (Lei Geral
                de Proteção de Dados Pessoais — LGPD) e com as políticas da
                Plataforma WhatsApp Business da Meta.
              </p>
              <p>
                Ao utilizar o Serviço ou interagir com um estabelecimento que o
                utiliza (por exemplo, agendando um horário pelo WhatsApp), você
                declara estar ciente desta Política.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                1. Quem é o controlador dos dados
              </h2>
              <p>
                A MinhaAgenda atua, em regra, como{" "}
                <strong className="text-foreground">operadora</strong> de dados
                pessoais em nome dos estabelecimentos (salões, clínicas e
                negócios de beleza e bem-estar) que contratam o Serviço, os quais
                são os <strong className="text-foreground">controladores</strong>{" "}
                das informações de seus clientes. Em relação aos dados de cadastro
                e uso da própria plataforma pelos estabelecimentos, a MinhaAgenda
                atua como controladora.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                2. Dados que coletamos
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong className="text-foreground">
                    Dados de cadastro do estabelecimento:
                  </strong>{" "}
                  nome, e-mail, telefone, dados do negócio e informações de
                  pagamento (processadas por terceiros, como a Stripe).
                </li>
                <li>
                  <strong className="text-foreground">
                    Dados de clientes finais:
                  </strong>{" "}
                  nome, número de telefone/WhatsApp, histórico de agendamentos,
                  serviços de interesse e preferências informadas durante o
                  atendimento.
                </li>
                <li>
                  <strong className="text-foreground">
                    Conteúdo de mensagens do WhatsApp:
                  </strong>{" "}
                  mensagens de texto, áudios e imagens enviadas pelo cliente ao
                  estabelecimento por meio da Plataforma WhatsApp Business, que
                  são processadas para viabilizar o atendimento automatizado por
                  inteligência artificial (agendamento, dúvidas e suporte).
                </li>
                <li>
                  <strong className="text-foreground">Dados técnicos:</strong>{" "}
                  registros de acesso, identificadores de dispositivo, endereço IP
                  e dados de navegação, coletados para segurança e funcionamento do
                  Serviço.
                </li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                3. Como usamos os dados
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Realizar, alterar e cancelar agendamentos;</li>
                <li>
                  Operar o atendimento automatizado por inteligência artificial no
                  WhatsApp (responder dúvidas, sugerir horários e serviços);
                </li>
                <li>Enviar confirmações, lembretes e comunicações do atendimento;</li>
                <li>Gerenciar a assinatura, o faturamento e o suporte ao Serviço;</li>
                <li>Garantir a segurança, prevenir fraudes e cumprir obrigações legais.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                4. Compartilhamento com terceiros
              </h2>
              <p>
                Compartilhamos dados apenas na medida necessária para a prestação
                do Serviço, com prestadores que atuam como operadores, incluindo:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong className="text-foreground">Meta Platforms</strong>{" "}
                  (Plataforma WhatsApp Business) — para envio e recebimento de
                  mensagens;
                </li>
                <li>
                  <strong className="text-foreground">Provedores de IA</strong>{" "}
                  (por exemplo, OpenAI) — para gerar as respostas do atendimento
                  automatizado;
                </li>
                <li>
                  <strong className="text-foreground">Stripe</strong> — para
                  processamento de pagamentos;
                </li>
                <li>
                  <strong className="text-foreground">Google</strong> — para
                  sincronização opcional de agenda (Google Calendar);
                </li>
                <li>
                  <strong className="text-foreground">
                    Provedores de infraestrutura em nuvem
                  </strong>{" "}
                  (hospedagem e banco de dados) — para armazenamento e
                  funcionamento do Serviço.
                </li>
              </ul>
              <p>
                Não vendemos dados pessoais. O uso de dados obtidos pela Plataforma
                WhatsApp Business observa as políticas e os termos da Meta.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                5. Retenção e exclusão
              </h2>
              <p>
                Mantemos os dados pessoais apenas pelo tempo necessário às
                finalidades descritas nesta Política ou para cumprimento de
                obrigações legais. Encerrado o tratamento, os dados são eliminados
                ou anonimizados de forma segura.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                6. Seus direitos (LGPD)
              </h2>
              <p>
                Você pode, a qualquer momento, solicitar: confirmação da existência
                de tratamento; acesso aos dados; correção de dados incompletos ou
                desatualizados; anonimização, bloqueio ou eliminação; portabilidade;
                informação sobre compartilhamento; e revogação do consentimento.
                Para exercer esses direitos, entre em contato pelo canal abaixo.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                7. Segurança
              </h2>
              <p>
                Adotamos medidas técnicas e administrativas para proteger os dados
                pessoais contra acessos não autorizados e situações de destruição,
                perda, alteração ou comunicação indevida, incluindo controle de
                acesso e isolamento de dados entre estabelecimentos.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                8. Contato e Encarregado (DPO)
              </h2>
              <p>
                Para dúvidas sobre esta Política ou para exercer seus direitos,
                entre em contato com a MinhaAgenda:
              </p>
              <p>
                <strong className="text-foreground">
                  LUIZ GUILHERME DE OLIVEIRA TECNOLOGIA DA INFORMACAO LTDA
                </strong>
                <br />
                CNPJ: 64.983.542/0001-04
                <br />
                E-mail:{" "}
                <a
                  href="mailto:contato@minhaagenda.ai"
                  className="text-accent font-medium hover:underline"
                >
                  contato@minhaagenda.ai
                </a>
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                9. Alterações desta Política
              </h2>
              <p>
                Podemos atualizar esta Política periodicamente. A versão vigente
                estará sempre disponível nesta página, com a data da última
                atualização indicada no topo.
              </p>
            </section>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
