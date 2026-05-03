'use client';

import { useState, useEffect, useCallback } from 'react';
import { Skeleton } from '../components/Skeleton';

type PacienteResultado = {
  chave: string;
  nome: string;
  telefones: string[];
  unidades: string[];
  origem: string | null;
  data_cadastro_kommo: string | null;
  data_avaliacao: string | null;
  data_contrato: string | null;
  data_pgto: string | null;
  dentista: string | null;
  atendente: string | null;
  vlr_contrato: number | null;
  situacao: string | null;
  ultimo_atendimento: string | null;
  total_atendimentos: number;
  ultima_acao: string | null;
};

type Resposta = {
  busca: string;
  total: number;
  resultados: PacienteResultado[];
};

function digitos(s: string): string {
  return s.replace(/\D/g, '');
}

function linkWhatsapp(tel: string): string {
  const d = digitos(tel);
  if (!d) return '#';
  const numero = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return `https://wa.me/${numero}`;
}

function fmtData(d: string | null): string {
  if (!d) return '—';
  return new Date(d.slice(0, 10)).toLocaleDateString('pt-BR');
}

function fmtBR(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BuscarPage() {
  const [q, setQ] = useState('');
  const [resp, setResp] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async (termo: string) => {
    if (termo.length < 2) {
      setResp(null);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/paciente-buscar?q=${encodeURIComponent(termo)}`);
      const json = await res.json();
      if (json.error) setErro(json.error);
      else setResp(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setCarregando(false);
    }
  }, []);

  // Debounce: busca 400ms depois de parar de digitar
  useEffect(() => {
    const t = setTimeout(() => buscar(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q, buscar]);

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Buscar paciente</h1>
          <p className="text-gray-400 text-sm mt-1">
            Busque por nome ou telefone. Ex: "Maria Silva" ou "11912345678".
          </p>
        </header>

        <div className="mb-6">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Digite o nome ou telefone do paciente..."
            autoFocus
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-indigo-500"
          />
          {q.length > 0 && q.length < 2 && (
            <div className="text-xs text-gray-500 mt-1">Digite ao menos 2 caracteres.</div>
          )}
        </div>

        {erro && (
          <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-4 mb-6">
            {erro}
          </div>
        )}

        {carregando && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        )}

        {!carregando && resp && resp.resultados.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
            Nenhum paciente encontrado pra "{resp.busca}".
          </div>
        )}

        {!carregando && resp && resp.resultados.length > 0 && (
          <>
            <div className="text-xs text-gray-500 mb-3">
              {resp.total} {resp.total === 1 ? 'resultado' : 'resultados'}
              {resp.total > 50 && <> (mostrando os 50 mais recentes)</>}
            </div>
            <div className="space-y-3">
              {resp.resultados.map(p => <CardPaciente key={p.chave} p={p} />)}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function CardPaciente({ p }: { p: PacienteResultado }) {
  // Determina o status mais avancado do funil
  const status = p.data_pgto
    ? { rotulo: 'Pagou', cor: 'text-emerald-300', data: p.data_pgto }
    : p.data_contrato
      ? { rotulo: 'Fechou', cor: 'text-amber-300', data: p.data_contrato }
      : p.data_avaliacao
        ? { rotulo: 'Avaliou', cor: 'text-purple-300', data: p.data_avaliacao }
        : p.ultimo_atendimento
          ? { rotulo: 'Em atendimento', cor: 'text-cyan-300', data: p.ultimo_atendimento }
          : p.data_cadastro_kommo
            ? { rotulo: 'Cadastrado (Kommo)', cor: 'text-indigo-300', data: p.data_cadastro_kommo }
            : { rotulo: 'Sem status', cor: 'text-gray-500', data: null };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{p.nome}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
            <span className={status.cor}>● {status.rotulo}</span>
            {status.data && <span>· {fmtData(status.data)}</span>}
            {p.unidades.length > 0 && <span>· {p.unidades.join(', ')}</span>}
            {p.origem && <span>· {p.origem}</span>}
          </div>
        </div>
        {p.telefones.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {p.telefones.slice(0, 2).map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <a
                  href={`tel:${digitos(t)}`}
                  className="text-xs text-gray-300 hover:text-indigo-300 transition"
                  title="Ligar"
                >
                  {t}
                </a>
                <a
                  href={linkWhatsapp(t)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 text-xs px-1.5 py-0.5 rounded border border-emerald-800/60 bg-emerald-950/30"
                  title="WhatsApp"
                >
                  WA
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mini-funil em badges */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <Etapa rotulo="Cadastro Kommo" data={p.data_cadastro_kommo} cor="indigo" />
        <Etapa rotulo="Avaliou" data={p.data_avaliacao} cor="purple" />
        <Etapa rotulo="Contrato" data={p.data_contrato} cor="amber" valor={p.vlr_contrato} />
        <Etapa rotulo="Pagamento" data={p.data_pgto} cor="emerald" />
        <Etapa
          rotulo="Telemarketing"
          data={p.ultimo_atendimento}
          cor="cyan"
          extra={p.total_atendimentos > 0 ? `${p.total_atendimentos} atend.` : undefined}
        />
      </div>

      {(p.dentista || p.atendente || p.situacao || p.ultima_acao) && (
        <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500 flex gap-x-4 gap-y-1 flex-wrap">
          {p.situacao && <span>Situação: <span className="text-gray-300">{p.situacao}</span></span>}
          {p.dentista && <span>Dentista: <span className="text-gray-300">{p.dentista}</span></span>}
          {p.atendente && <span>Atendente: <span className="text-gray-300">{p.atendente}</span></span>}
          {p.ultima_acao && <span>Última ação: <span className="text-gray-300">{p.ultima_acao}</span></span>}
        </div>
      )}
    </div>
  );
}

function Etapa({
  rotulo,
  data,
  cor,
  valor,
  extra,
}: {
  rotulo: string;
  data: string | null;
  cor: 'indigo' | 'purple' | 'amber' | 'emerald' | 'cyan';
  valor?: number | null;
  extra?: string;
}) {
  const cores: Record<string, string> = {
    indigo: 'border-indigo-700/40 bg-indigo-950/20 text-indigo-300',
    purple: 'border-purple-700/40 bg-purple-950/20 text-purple-300',
    amber: 'border-amber-700/40 bg-amber-950/20 text-amber-300',
    emerald: 'border-emerald-700/40 bg-emerald-950/20 text-emerald-300',
    cyan: 'border-cyan-700/40 bg-cyan-950/20 text-cyan-300',
  };
  const ativo = !!data;
  return (
    <div
      className={`rounded border p-2 ${
        ativo ? cores[cor] : 'border-gray-800 bg-gray-900/40 text-gray-600'
      }`}
    >
      <div className="text-[9px] uppercase tracking-wider opacity-70">{rotulo}</div>
      <div className="text-xs font-medium leading-tight mt-0.5">
        {ativo ? fmtData(data) : '—'}
      </div>
      {ativo && valor !== undefined && valor !== null && (
        <div className="text-[10px] mt-0.5 opacity-80">
          R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      )}
      {ativo && extra && <div className="text-[10px] mt-0.5 opacity-80">{extra}</div>}
    </div>
  );
}
