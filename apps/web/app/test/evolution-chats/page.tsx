'use client';

/**
 * Tela de testes: sincroniza e exibe todos os chats da Evolution API.
 * Ao clicar em um chat: exibe mensagens e permite enviar.
 * Acessível apenas pela URL — não há link no portal.
 * URL: /test/evolution-chats
 */

import { useEffect, useState, useRef } from 'react';

interface EvolutionChatItem {
  id?: string;
  remoteJid?: string;
  name?: string;
  conversationTimestamp?: number;
  unreadCount?: number;
  archive?: boolean;
  [key: string]: unknown;
}

interface EvolutionChatsInstance {
  salonId: string;
  salonName: string;
  instanceName: string;
  connectionStatus: string | null;
  chats: EvolutionChatItem[];
  error?: string;
}

interface EvolutionChatsResponse {
  ok: boolean;
  instances: EvolutionChatsInstance[];
  syncedAt: string;
  error?: string;
}

interface EvolutionMessageItem {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  message?: { conversation?: string; extendedTextMessage?: { text?: string }; [key: string]: unknown };
  messageTimestamp?: number;
  [key: string]: unknown;
}

function formatTimestamp(ts?: number): string {
  if (ts == null) return '—';
  try {
    return new Date(ts * 1000).toLocaleString('pt-BR');
  } catch {
    return String(ts);
  }
}

function getMessageText(msg: EvolutionMessageItem): string {
  const m = msg?.message;
  if (!m) return '';
  if (typeof m.conversation === 'string') return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  return JSON.stringify(m);
}

type SelectedChat = {
  instanceName: string;
  remoteJid: string;
  salonName: string;
};

function ChatRow({
  chat,
  instanceName,
  salonName,
  selected,
  onSelect,
}: {
  chat: EvolutionChatItem;
  instanceName: string;
  salonName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const id = (chat.remoteJid ?? chat.id ?? '—') as string;
  const name = (chat.name ?? id) as string;
  const unread = chat.unreadCount ?? 0;
  const ts = chat.conversationTimestamp as number | undefined;
  const archive = !!chat.archive;

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`border-b border-slate-200 dark:border-slate-700 cursor-pointer transition-colors ${
        selected
          ? 'bg-indigo-500/10 dark:bg-indigo-500/20'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
      }`}
    >
      <td className="px-3 py-2 text-sm font-mono text-slate-600 dark:text-slate-300 truncate max-w-[200px]" title={id}>
        {id}
      </td>
      <td className="px-3 py-2 text-sm text-slate-800 dark:text-slate-200 truncate max-w-[180px]" title={name}>
        {name}
      </td>
      <td className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
        {formatTimestamp(ts)}
      </td>
      <td className="px-3 py-2 text-sm">
        {unread > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium">
            {unread}
          </span>
        ) : (
          <span className="text-slate-400">0</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-slate-500">
        {archive ? 'Arquivado' : '—'}
      </td>
    </tr>
  );
}

function MessagesPanel({
  selected,
  onClose,
}: {
  selected: SelectedChat;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<EvolutionMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendText, setSendText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        instanceName: selected.instanceName,
        remoteJid: selected.remoteJid,
        limit: '50',
      });
      const res = await fetch(`/api/test/evolution-chats/messages?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `HTTP ${res.status}`);
        setMessages([]);
      } else {
        setMessages(json.messages ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [selected.instanceName, selected.remoteJid]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = sendText.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/test/evolution-chats/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: selected.instanceName,
          remoteJid: selected.remoteJid,
          text,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSendError(json?.error ?? 'Falha ao enviar');
      } else {
        setSendText('');
        // Resposta imediata (fire-and-forget no servidor); em grupos a API pode demorar
        if (json.messageId === 'pending' || json.note) {
          setSendNote(json.note ?? 'Mensagem em envio. Atualize a lista em alguns segundos.');
          setTimeout(() => { setSendNote(null); fetchMessages(); }, 5000);
          setTimeout(() => fetchMessages(), 12000);
        } else {
          await fetchMessages();
        }
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  const displayJid = selected.remoteJid.length > 40 ? selected.remoteJid.slice(0, 37) + '…' : selected.remoteJid;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="min-w-0">
          <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{selected.salonName}</p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate" title={selected.remoteJid}>
            {displayJid}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {loading && (
          <div className="text-center text-slate-500 py-6">Carregando mensagens…</div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm p-3">
            {error}
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="text-center text-slate-500 py-6">Nenhuma mensagem neste chat.</div>
        )}
        {!loading && messages.map((msg, i) => {
          const fromMe = !!msg?.key?.fromMe;
          const text = getMessageText(msg);
          const ts = msg.messageTimestamp;
          return (
            <div
              key={msg?.key?.id ?? i}
              className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  fromMe
                    ? 'bg-indigo-600 text-white rounded-br-md'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{text || '(mídia ou outro tipo)'}</p>
                {ts != null && (
                  <p className={`text-xs mt-1 ${fromMe ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    {formatTimestamp(ts)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={listEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
        {sendError && (
          <p className="text-red-600 dark:text-red-400 text-sm mb-2">{sendError}</p>
        )}
        {sendNote && (
          <p className="text-amber-700 dark:text-amber-300 text-sm mb-2">{sendNote}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={sendText}
            onChange={(e) => setSendText(e.target.value)}
            placeholder="Digite a mensagem…"
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !sendText.trim()}
            className="shrink-0 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none"
          >
            {sending ? '…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function InstanceCard({
  inst,
  selectedChat,
  onSelectChat,
  onCloseChat,
}: {
  inst: EvolutionChatsInstance;
  selectedChat: SelectedChat | null;
  onSelectChat: (c: SelectedChat) => void;
  onCloseChat: () => void;
}) {
  const [open, setOpen] = useState(true);
  const hasError = !!inst.error;
  const count = inst.chats.length;
  const isSelected = (c: EvolutionChatItem) =>
    selectedChat?.instanceName === inst.instanceName &&
    (c.remoteJid ?? c.id) === selectedChat?.remoteJid;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-slate-500 dark:text-slate-400 text-sm font-mono">{inst.instanceName}</span>
          <span className="text-slate-800 dark:text-slate-200 font-medium truncate">{inst.salonName}</span>
          {inst.connectionStatus && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                inst.connectionStatus === 'connected'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                  : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
              }`}
            >
              {inst.connectionStatus}
            </span>
          )}
          {hasError && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-700 dark:text-red-400">
              Erro
            </span>
          )}
        </div>
        <span className="text-slate-500 text-sm tabular-nums shrink-0">{count} chats</span>
        <span className="text-slate-400 shrink-0">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          {inst.error && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              {inst.error}
            </div>
          )}
          {inst.chats.length === 0 && !inst.error && (
            <div className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
              Nenhum chat nesta instância.
            </div>
          )}
          {inst.chats.length > 0 && (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 font-medium">ID / JID</th>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Última conversa</th>
                    <th className="px-3 py-2 font-medium">Não lidas</th>
                    <th className="px-3 py-2 font-medium">Arquivado</th>
                  </tr>
                </thead>
                <tbody>
                  {inst.chats.map((chat, i) => (
                    <ChatRow
                      key={(chat.remoteJid ?? chat.id ?? i) as string}
                      chat={chat}
                      instanceName={inst.instanceName}
                      salonName={inst.salonName}
                      selected={isSelected(chat)}
                      onSelect={() =>
                        onSelectChat({
                          instanceName: inst.instanceName,
                          remoteJid: (chat.remoteJid ?? chat.id) as string,
                          salonName: inst.salonName,
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function TestEvolutionChatsPage() {
  const [data, setData] = useState<EvolutionChatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);

  const fetchChats = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/test/evolution-chats');
      const json: EvolutionChatsResponse = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
      setData(null);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchChats();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex flex-col">
      <div className="flex flex-1 min-h-0">
        <div className={`flex flex-col flex-1 min-w-0 p-4 md:p-6 ${selectedChat ? 'lg:max-w-[55%]' : ''}`}>
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Teste — Chats Evolution API
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Clique em um chat para ver mensagens e enviar.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchChats}
              disabled={syncing}
              className="shrink-0 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {syncing ? 'Sincronizando…' : 'Atualizar'}
            </button>
          </header>

          {loading && !data && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-slate-500 mt-4">
              Carregando…
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300 mt-4">
              {error}
            </div>
          )}

          {data?.instances && data.instances.length === 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-slate-500 mt-4">
              Nenhuma instância Evolution configurada (salões com WhatsApp conectado).
            </div>
          )}

          {data?.instances && data.instances.length > 0 && (
            <div className="space-y-4 mt-4 overflow-auto min-h-0">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Sincronizado em {new Date(data.syncedAt).toLocaleString('pt-BR')} — {data.instances.length} instância(s)
              </p>
              {data.instances.map((inst) => (
                <InstanceCard
                  key={inst.instanceName}
                  inst={inst}
                  selectedChat={selectedChat}
                  onSelectChat={setSelectedChat}
                  onCloseChat={() => setSelectedChat(null)}
                />
              ))}
            </div>
          )}
        </div>

        {selectedChat && (
          <div className="hidden lg:flex flex-col w-[45%] min-h-0 border-l border-slate-200 dark:border-slate-700">
            <MessagesPanel selected={selectedChat} onClose={() => setSelectedChat(null)} />
          </div>
        )}
      </div>

      {selectedChat && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 flex flex-col">
          <div className="flex-1 flex flex-col min-h-0 mt-12 mx-2 mb-2 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xl">
            <MessagesPanel selected={selectedChat} onClose={() => setSelectedChat(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
